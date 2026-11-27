import { resolveSpawnCommand } from "@t3tools/shared/shell";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import type { ProviderPrivacySource } from "@t3tools/contracts";
import {
  DO_NOT_TRACK_TABLE,
  withProviderPrivacyEnvironment,
} from "@t3tools/provider-core/server/privacy";
import { collectStreamAsString } from "@t3tools/provider-core/server/snapshotProbe";

// DO_NOT_TRACK also stops its error and trace reporting. CMD_LOCAL_ONLY would break hosted models.
const COMMAND_CODE_PRIVACY_ENVIRONMENT = DO_NOT_TRACK_TABLE;

export const spawnCommandCode = Effect.fn("spawnCommandCode")(function* (input: {
  binaryPath: string;
  args: readonly string[];
  cwd: string;
  environment: NodeJS.ProcessEnv;
  prompt?: string;
  privacy?: ProviderPrivacySource | undefined;
}) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const environment = withProviderPrivacyEnvironment(
    input.environment,
    COMMAND_CODE_PRIVACY_ENVIRONMENT,
    input.privacy,
  );
  const command = yield* resolveSpawnCommand(input.binaryPath, input.args, { env: environment });
  return yield* spawner.spawn(
    ChildProcess.make(command.command, command.args, {
      cwd: input.cwd,
      env: environment,
      shell: command.shell,
      stdin:
        input.prompt === undefined
          ? "ignore"
          : { stream: Stream.encodeText(Stream.make(input.prompt)) },
    }),
  );
});

export const collectCommandCode = Effect.fn("collectCommandCode")(function* (
  input: Parameters<typeof spawnCommandCode>[0],
) {
  const child = yield* spawnCommandCode(input);
  const [stdout, stderr, code] = yield* Effect.all(
    [
      collectStreamAsString(child.stdout, { maxBytes: 2 * 1024 * 1024 }),
      collectStreamAsString(child.stderr, { maxBytes: 16 * 1024 }),
      child.exitCode.pipe(Effect.map(Number)),
    ],
    { concurrency: "unbounded" },
  );
  return { stdout, stderr, code };
});
