import { assert, describe, expect, it } from "@effect/vitest";
import { ProviderInstanceId, TextGenerationError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { decodeJsonReply, fromRunner, type Request } from "./textGenerationOperations.ts";
import { sanitizeDraftRewrite } from "./textGenerationUtils.ts";

// regression: #23726 a reply that echoes the schema key replaced the seed title with "title"
it.effect("fails a thread title reply that is only the schema key", () =>
  Effect.gen(function* () {
    const textGeneration = fromRunner("Stub", (request) =>
      decodeJsonReply(request, "Stub", '{"title":"title","needsRefinement":false}'),
    );

    const outcome = yield* textGeneration
      .generateThreadTitle({
        cwd: process.cwd(),
        message: "$implement Issue #140",
        modelSelection: {
          instanceId: ProviderInstanceId.make("pi"),
          model: "anthropic/claude-haiku-4-5",
        },
      })
      .pipe(Effect.match({ onFailure: (error) => error, onSuccess: (result) => result }));

    assert.instanceOf(outcome, TextGenerationError);
    assert.strictEqual(outcome.operation, "generateThreadTitle");
  }),
);

describe("rewriteDraft", () => {
  it.effect("sends the draft as-is and trims the rewrite", () =>
    Effect.gen(function* () {
      const requests: Array<Request<never>> = [];
      const generation = fromRunner("Fake", (request) => {
        requests.push(request as Request<never>);
        return Effect.succeed({ text: "  Fix the login bug.\n" } as never);
      });
      const draft = "um so like fix the `login()` bug in src/auth.ts";

      const result = yield* generation.rewriteDraft({
        cwd: "/repo",
        text: draft,
        modelSelection: { instanceId: "claude", model: "haiku" } as never,
      });

      expect(result).toEqual({ text: "Fix the login bug." });
      expect(requests[0]?.operation).toBe("rewriteDraft");
      expect(requests[0]?.prompt.endsWith(`Draft:\n${draft}`)).toBe(true);
    }),
  );

  it.each([
    ['{"text": "Go to src/auth.ts."}', "Go to src/auth.ts."],
    ["{ not json } keep me", "{ not json } keep me"],
    ['{"other": 1}', '{"other": 1}'],
  ])("unwraps a nested JSON reply only when it holds text: %s", (raw, expected) => {
    expect(sanitizeDraftRewrite(raw)).toBe(expected);
  });
});
