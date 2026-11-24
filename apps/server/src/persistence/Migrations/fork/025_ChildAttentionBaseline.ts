import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

// When parents first heard about their children; ChildAttentionService records it on start.
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE child_attention_baseline (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      enabled_at TEXT NOT NULL
    )
  `;
});
