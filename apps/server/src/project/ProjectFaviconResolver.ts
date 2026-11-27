import { safeDecodeURIComponent } from "@t3tools/shared/markdownLinks";
import * as Cache from "effect/Cache";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as Schema from "effect/Schema";

import * as WorkspaceIoGate from "../workspace/WorkspaceIoGate.ts";
import * as WorkspacePaths from "../workspace/WorkspacePaths.ts";
import * as T3ProjectFileLoader from "./T3ProjectFileLoader.ts";

const FAVICON_CACHE_CAPACITY = 512;
const ICON_SOURCE_SCAN_BYTES = 128 * 1024;
const FAVICON_POSITIVE_CACHE_TTL = Duration.minutes(10);
const FAVICON_NEGATIVE_CACHE_TTL = Duration.minutes(1);

function faviconCacheKey(cwd: string, faviconPath?: string): string {
  return `${faviconPath ?? ""}\0${cwd}`;
}

function parseFaviconCacheKey(key: string): {
  readonly cwd: string;
  readonly faviconPath?: string;
} {
  const separatorIndex = key.indexOf("\0");
  if (separatorIndex === -1) {
    return { cwd: key };
  }
  const faviconPath = key.slice(0, separatorIndex);
  const cwd = key.slice(separatorIndex + 1);
  return faviconPath.length === 0 ? { cwd } : { cwd, faviconPath };
}

const FAVICON_CANDIDATES = [
  "favicon.svg",
  "favicon.ico",
  "favicon.png",
  "public/favicon.svg",
  "public/favicon.ico",
  "public/favicon.png",
  "app/favicon.ico",
  "app/favicon.png",
  "app/icon.svg",
  "app/icon.png",
  "app/icon.ico",
  "src/favicon.ico",
  "src/favicon.svg",
  "src/app/favicon.ico",
  "src/app/icon.svg",
  "src/app/icon.png",
  "assets/icon.svg",
  "assets/icon.png",
  "assets/logo.svg",
  "assets/logo.png",
  "assets/images/icon.png",
  ".idea/icon.svg",
  "Resources/AppIcon.icns",
  "AppIcon.icns",
] as const;

// Monorepos keep their apps one level below this directory, each with its own
// icon (for example `apps/web/app/favicon.ico` or `apps/mobile/assets/images/icon.png`).
const MONOREPO_APPS_DIRECTORY = "apps";
// Bounds the probes for a workspace with an unusually large apps directory.
const MAX_MONOREPO_APPS = 16;
// Flutter's default favicon ranks below icons a project declares in its source.
const FALLBACK_FAVICON_CANDIDATES = ["web/favicon.png"] as const;

const ICON_SOURCE_FILES = [
  "index.html",
  "public/index.html",
  "app/routes/__root.tsx",
  "src/routes/__root.tsx",
  "app/root.tsx",
  "src/root.tsx",
  "src/index.html",
] as const;

const HTML_LINK_RE = /<link\b[^<>]*>/gi;
// `rel` is an unordered, whitespace-separated token list; any `icon` token marks an icon link.
const ICON_REL_VALUE = String.raw`(?:"(?:[^"]*[\t\n\f\r ])?icon(?=[\t\n\f\r "])|'(?:[^']*[\t\n\f\r ])?icon(?=[\t\n\f\r ']))`;
// HTML attribute syntax: a name, then an optional double-quoted, single-quoted, or unquoted value.
const HTML_ATTRIBUTE_RE =
  /([^\t\n\f\r "'<>/=]+)(?:[\t\n\f\r ]*=[\t\n\f\r ]*(?:"([^"]*)"|'([^']*)'|([^\t\n\f\r >]+)))?/g;
const ICON_REL_RE = new RegExp(String.raw`\brel\s*:\s*${ICON_REL_VALUE}`, "i");
const ICON_HREF_RE = /\bhref\s*:\s*["']([^"'?#]+)/i;

export class ProjectFaviconResolutionError extends Schema.TaggedError<ProjectFaviconResolutionError>()(
  "ProjectFaviconResolutionError",
  {
    operation: Schema.Literals([
      "normalize-workspace",
      "resolve-path",
      "stat-candidate",
      "read-source",
      "list-apps",
    ]),
    workspaceRoot: Schema.String,
    relativePath: Schema.optional(Schema.String),
    absolutePath: Schema.optional(Schema.String),
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to resolve project favicon during ${this.operation} for workspace ${this.workspaceRoot}.`;
  }
}

const isWorkspaceRootNotExistsError = Schema.is(WorkspacePaths.WorkspaceRootNotExistsError);

export const isMissingWorkspaceRoot = (error: ProjectFaviconResolutionError): boolean =>
  error.operation === "normalize-workspace" && isWorkspaceRootNotExistsError(error.cause);

export class ProjectFaviconResolver extends Context.Service<
  ProjectFaviconResolver,
  {
    readonly resolvePath: (
      cwd: string,
      faviconPath?: string,
    ) => Effect.Effect<string | null, ProjectFaviconResolutionError>;
    /** Forgets cached lookups for a workspace whose files changed, such as a finished clone. */
    readonly invalidate: (cwd: string) => Effect.Effect<void>;
  }
>()("t3/project/ProjectFaviconResolver") {}

function* extractIconHrefs(source: string): Generator<string> {
  for (const [tag] of source.matchAll(HTML_LINK_RE)) {
    const attributes = new Map<string, { value: string; quoted: boolean }>();
    for (const [, name, doubleQuoted, singleQuoted, unquoted] of tag
      .slice("<link".length)
      .matchAll(HTML_ATTRIBUTE_RE)) {
      const key = name!.toLowerCase();
      if (attributes.has(key)) continue;
      const quotedValue = doubleQuoted ?? singleQuoted;
      attributes.set(key, {
        value: quotedValue ?? unquoted ?? "",
        quoted: quotedValue !== undefined,
      });
    }
    const rel = attributes
      .get("rel")
      ?.value.toLowerCase()
      .split(/[\t\n\f\r ]+/);
    if (!rel?.includes("icon")) continue;
    const href = attributes.get("href");
    // An unquoted `{...}` is a JSX expression, not a path.
    if (!href || (!href.quoted && href.value.startsWith("{"))) continue;
    const path = href.value.split(/[?#]/, 1)[0];
    if (path) yield path;
  }
  for (const run of source.split("}")) {
    if (!ICON_REL_RE.test(run)) continue;
    const hrefMatch = run.match(ICON_HREF_RE);
    if (hrefMatch?.[1]) yield hrefMatch[1];
  }
}

export const optionOnNotFound = <A, R>(
  effect: Effect.Effect<A, PlatformError.PlatformError, R>,
): Effect.Effect<Option.Option<A>, PlatformError.PlatformError, R> =>
  effect.pipe(
    Effect.asSome,
    Effect.catchTags({
      PlatformError: (error) =>
        error.reason._tag === "NotFound" ? Effect.succeed(Option.none<A>()) : Effect.fail(error),
    }),
  );

// A path through a file (ENOTDIR) or a symlink loop names no file either.
const optionOnMissing = <A, R>(
  effect: Effect.Effect<A, PlatformError.PlatformError, R>,
): Effect.Effect<Option.Option<A>, PlatformError.PlatformError, R> =>
  optionOnNotFound(effect).pipe(
    Effect.catchIf(
      (error) => error.reason._tag === "BadResource",
      () => Effect.succeedNone,
    ),
  );

export const make = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const workspacePaths = yield* WorkspacePaths.WorkspacePaths;
  const projectFileLoader = yield* T3ProjectFileLoader.T3ProjectFileLoader;
  const ioGate = yield* WorkspaceIoGate.WorkspaceIoGate;

  const resolveIconHref = (href: string): ReadonlyArray<string> => {
    // `data:`, `https:` and `//host` icons name no project file, and a long data URL fails `stat`.
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href.trim())) return [];
    // Browsers strip surrounding whitespace from URL attributes; file paths keep theirs.
    const clean = safeDecodeURIComponent(href.trim().replace(/^\//, ""));
    // A decoded NUL fails `stat` instead of missing.
    if (clean.includes("\0")) return [];
    return [path.join("public", clean), clean];
  };

  const findExistingFile = Effect.fn("ProjectFaviconResolver.findExistingFile")(function* (
    projectCwd: string,
    relativeCandidates: ReadonlyArray<string>,
    candidateScope: "workspace" | "filesystem",
  ): Effect.fn.Return<string | null, ProjectFaviconResolutionError> {
    for (const relativePath of relativeCandidates) {
      const candidate = yield* (
        candidateScope === "filesystem" && path.isAbsolute(relativePath)
          ? Effect.succeed({ absolutePath: relativePath, relativePath })
          : workspacePaths.resolveRelativePathWithinRoot({
              workspaceRoot: projectCwd,
              relativePath,
            })
      ).pipe(
        Effect.asSome,
        Effect.catchTags({
          WorkspacePathOutsideRootError: () =>
            Effect.succeed(
              Option.none<{ readonly absolutePath: string; readonly relativePath: string }>(),
            ),
        }),
      );
      if (Option.isNone(candidate)) {
        continue;
      }
      const stats = yield* optionOnMissing(
        ioGate.run(
          projectCwd,
          candidate.value.absolutePath,
          fileSystem.stat(candidate.value.absolutePath),
        ),
      ).pipe(
        Effect.mapError(
          (cause) =>
            new ProjectFaviconResolutionError({
              operation: "stat-candidate",
              workspaceRoot: projectCwd,
              relativePath,
              absolutePath: candidate.value.absolutePath,
              cause,
            }),
        ),
      );
      if (Option.isSome(stats) && stats.value.type === "File") {
        return candidate.value.absolutePath;
      }
    }
    return null;
  });

  // Lists the package directories under `apps/`, sorted so resolution is stable.
  const listMonorepoApps = Effect.fn("ProjectFaviconResolver.listMonorepoApps")(function* (
    projectCwd: string,
  ): Effect.fn.Return<ReadonlyArray<string>, ProjectFaviconResolutionError> {
    const appsDirectory = path.join(projectCwd, MONOREPO_APPS_DIRECTORY);
    const toError = (cause: PlatformError.PlatformError) =>
      new ProjectFaviconResolutionError({
        operation: "list-apps",
        workspaceRoot: projectCwd,
        relativePath: MONOREPO_APPS_DIRECTORY,
        absolutePath: appsDirectory,
        cause,
      });
    const appsStats = yield* optionOnNotFound(
      ioGate.run(projectCwd, appsDirectory, fileSystem.stat(appsDirectory)),
    ).pipe(Effect.mapError(toError));
    if (Option.isNone(appsStats) || appsStats.value.type !== "Directory") {
      return [];
    }
    const entries = yield* ioGate
      .run(projectCwd, appsDirectory, fileSystem.readDirectory(appsDirectory))
      .pipe(Effect.mapError(toError));
    const apps: Array<string> = [];
    for (const entry of entries.filter((name) => !name.startsWith(".")).toSorted()) {
      if (apps.length === MAX_MONOREPO_APPS) break;
      const entryPath = path.join(appsDirectory, entry);
      const entryStats = yield* optionOnNotFound(
        ioGate.run(projectCwd, entryPath, fileSystem.stat(entryPath)),
      ).pipe(Effect.mapError(toError));
      if (Option.isSome(entryStats) && entryStats.value.type === "Directory") {
        apps.push(entry);
      }
    }
    return apps;
  });

  const findIconFromSource = Effect.fn("ProjectFaviconResolver.findIconFromSource")(function* (
    projectCwd: string,
    sourceFile: string,
  ): Effect.fn.Return<string | null, ProjectFaviconResolutionError> {
    const sourcePath = yield* workspacePaths
      .resolveRelativePathWithinRoot({
        workspaceRoot: projectCwd,
        relativePath: sourceFile,
      })
      .pipe(
        Effect.mapError(
          (cause) =>
            new ProjectFaviconResolutionError({
              operation: "resolve-path",
              workspaceRoot: projectCwd,
              relativePath: sourceFile,
              cause,
            }),
        ),
      );
    const stats = yield* optionOnMissing(
      ioGate.run(projectCwd, sourcePath.absolutePath, fileSystem.stat(sourcePath.absolutePath)),
    ).pipe(
      Effect.mapError(
        (cause) =>
          new ProjectFaviconResolutionError({
            operation: "stat-candidate",
            workspaceRoot: projectCwd,
            relativePath: sourceFile,
            absolutePath: sourcePath.absolutePath,
            cause,
          }),
      ),
    );
    if (Option.isNone(stats) || stats.value.type !== "File") {
      return null;
    }
    const source = yield* optionOnMissing(
      ioGate.run(
        projectCwd,
        sourcePath.absolutePath,
        fileSystem.open(sourcePath.absolutePath, { flag: "r" }).pipe(
          Effect.flatMap((file) => file.readAlloc(ICON_SOURCE_SCAN_BYTES)),
          Effect.scoped,
        ),
      ),
    ).pipe(
      Effect.mapError(
        (cause) =>
          new ProjectFaviconResolutionError({
            operation: "read-source",
            workspaceRoot: projectCwd,
            relativePath: sourceFile,
            absolutePath: sourcePath.absolutePath,
            cause,
          }),
      ),
    );
    if (Option.isNone(source) || Option.isNone(source.value)) {
      return null;
    }
    const hrefs = Array.from(extractIconHrefs(new TextDecoder().decode(source.value.value)));
    return yield* findExistingFile(projectCwd, hrefs.flatMap(resolveIconHref), "workspace");
  });

  // In order, stopping at the first hit: WorkspaceIoGate runs one call per root anyway, and a
  // probe that never starts cannot hang on a folder that stopped answering.
  const firstInOrder = Effect.fn("ProjectFaviconResolver.firstInOrder")(function* <A>(
    items: ReadonlyArray<A>,
    probe: (item: A) => Effect.Effect<string | null, ProjectFaviconResolutionError>,
  ) {
    for (const item of items) {
      const found = yield* probe(item);
      if (found) {
        return found;
      }
    }
    return null;
  });

  const resolvePathUncached = Effect.fn("ProjectFaviconResolver.resolvePathUncached")(function* (
    cwd: string,
    faviconPath?: string,
  ): Effect.fn.Return<string | null, ProjectFaviconResolutionError> {
    const projectCwd = yield* ioGate.run(cwd, cwd, workspacePaths.normalizeWorkspaceRoot(cwd)).pipe(
      Effect.mapError(
        (cause) =>
          new ProjectFaviconResolutionError({
            operation: "normalize-workspace",
            workspaceRoot: cwd,
            cause,
          }),
      ),
    );
    if (faviconPath !== undefined) {
      const existing = yield* findExistingFile(projectCwd, [faviconPath], "filesystem");
      if (existing) {
        return existing;
      }
    }

    const projectFile = yield* projectFileLoader.load(projectCwd);
    if (Option.isSome(projectFile) && projectFile.value.iconPath !== undefined) {
      const existing = yield* findExistingFile(
        projectCwd,
        [projectFile.value.iconPath],
        "workspace",
      );
      if (existing) {
        return existing;
      }
    }

    const wellKnown = yield* firstInOrder(FAVICON_CANDIDATES, (candidate) =>
      findExistingFile(projectCwd, [candidate], "workspace"),
    );
    if (wellKnown) {
      return wellKnown;
    }

    const fromSource = yield* firstInOrder(ICON_SOURCE_FILES, (sourceFile) =>
      findIconFromSource(projectCwd, sourceFile),
    );
    if (fromSource) {
      return fromSource;
    }

    // A monorepo root rarely has an icon of its own. Each well-known path is
    // tried across every app before the next, so the best icon format wins.
    const apps = yield* listMonorepoApps(projectCwd);
    const appCandidates = FAVICON_CANDIDATES.flatMap((candidate) =>
      apps.map((app) => path.join(MONOREPO_APPS_DIRECTORY, app, candidate)),
    );
    const fromApps = yield* findExistingFile(projectCwd, appCandidates, "workspace");
    if (fromApps) {
      return fromApps;
    }

    return yield* findExistingFile(projectCwd, FALLBACK_FAVICON_CANDIDATES, "workspace");
  });

  const faviconCache = yield* Cache.makeWith<string, string | null, ProjectFaviconResolutionError>(
    (key) => {
      const { cwd, faviconPath } = parseFaviconCacheKey(key);
      return resolvePathUncached(cwd, faviconPath);
    },
    {
      capacity: FAVICON_CACHE_CAPACITY,
      timeToLive: Exit.match({
        onSuccess: (value: string | null) =>
          value === null ? FAVICON_NEGATIVE_CACHE_TTL : FAVICON_POSITIVE_CACHE_TTL,
        onFailure: (cause) =>
          Option.exists(Cause.findErrorOption(cause), isMissingWorkspaceRoot)
            ? FAVICON_NEGATIVE_CACHE_TTL
            : Duration.zero,
      }),
    },
  );

  const resolvePath: ProjectFaviconResolver["Service"]["resolvePath"] = Effect.fn(
    "ProjectFaviconResolver.resolvePath",
  )(function* (cwd, faviconPath) {
    const key = faviconCacheKey(cwd, faviconPath);
    const cached = yield* Cache.get(faviconCache, key);
    if (cached === null) {
      return null;
    }

    const stats = yield* optionOnMissing(ioGate.run(cwd, cached, fileSystem.stat(cached))).pipe(
      Effect.mapError(
        (cause) =>
          new ProjectFaviconResolutionError({
            operation: "stat-candidate",
            workspaceRoot: cwd,
            absolutePath: cached,
            cause,
          }),
      ),
    );
    if (Option.isSome(stats) && stats.value.type === "File") {
      return cached;
    }

    yield* Cache.invalidate(faviconCache, key);
    return yield* Cache.get(faviconCache, key);
  });

  const invalidate: ProjectFaviconResolver["Service"]["invalidate"] = (cwd) =>
    Cache.keys(faviconCache).pipe(
      Effect.flatMap((keys) =>
        Effect.forEach(
          Array.from(keys).filter((key) => parseFaviconCacheKey(key).cwd === cwd),
          (key) => Cache.invalidate(faviconCache, key),
          { discard: true },
        ),
      ),
    );

  return ProjectFaviconResolver.of({ resolvePath, invalidate });
});

export const layer = Layer.effect(ProjectFaviconResolver, make);
