import { expect, it } from "@effect/vitest";
import {
  ALLOW_ALL_PROVIDER_PRIVACY_CHOICE,
  DEFAULT_PROVIDER_PRIVACY_CHOICE,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { ChildProcessSpawner } from "effect/process";
import { spawnCommandCode } from "./commandCodeProcess.ts";

it.effect.each([
  { name: "blocked", choice: DEFAULT_PROVIDER_PRIVACY_CHOICE, user: {}, expected: "1" },
  {
    name: "user value wins",
    choice: DEFAULT_PROVIDER_PRIVACY_CHOICE,
    user: { DO_NOT_TRACK: "0" },
    expected: "0",
  },
  { name: "allowed", choice: ALLOW_ALL_PROVIDER_PRIVACY_CHOICE, user: {}, expected: undefined },
])("applies the privacy overlay at spawn ($name)", ({ choice, user, expected }) =>
  Effect.gen(function* () {
    const doNotTrack: Array<unknown> = [];
    yield* spawnCommandCode({
      binaryPath: "commandcode",
      args: ["--version"],
      cwd: "/",
      environment: user,
      privacy: () => choice,
    }).pipe(
      Effect.provideService(
        ChildProcessSpawner.ChildProcessSpawner,
        ChildProcessSpawner.make((command) => {
          if (command._tag === "StandardCommand")
            doNotTrack.push(command.options.env?.DO_NOT_TRACK);
          return Effect.die("captured");
        }),
      ),
      Effect.exit,
    );
    expect(doNotTrack).toEqual([expected]);
  }),
);
