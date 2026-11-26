# Observability

Server observability has three outputs: pretty stdout logs (not persisted locally, except SSH-managed launches at `~/.t3/ssh-launch/<state>/server.log`), a local NDJSON trace file (always on), and optional OTLP export (traces, metrics, logs).

## Local traces and event-loop stalls

Default trace paths (`server.trace.ndjson`):

- Production / explicit `--home-dir` / `T3CODE_HOME`: `<home>/userdata/logs/server.trace.ndjson`
- Linked worktree dev run: `<worktree>/.t3/userdata/logs/server.trace.ndjson`
- Non-worktree dev run: `~/.t3/dev/logs/server.trace.ndjson`

The file does not keep every span. It always keeps spans that failed or were interrupted, spans that
ran at least `T3CODE_TRACE_SLOW_SPAN_MS`, spans without a server parent such as HTTP requests,
`ws.rpc.*` spans, and provider turn and session spans. Other spans are kept for a
`T3CODE_TRACE_SAMPLE_RATE` share of their subtrees, so a sampled operation keeps all of its children,
and a kept span also keeps its ancestors that are still running. Browser spans forwarded by clients
are sampled by trace with the same rules. OTLP export is not sampled. Set `T3CODE_TRACE_SAMPLE_RATE=1`
to write every span while you investigate something.

Summarize counts, rates, and latency percentiles offline (even while a server is stalled or stopped):

```sh
t3 trace summary --since 30m --limit 40
# Set T3CODE_TRACE_FILE=/path/to/server.trace.ndjson for dev or copied traces
```

Counts and rates cover only the spans the file kept, so compare builds at the same
`T3CODE_TRACE_SAMPLE_RATE`, or at `1` for exact numbers.

Logs emitted inside an active span (`Effect.log*`) attach as span events unless `T3CODE_OTLP_LOGS_URL` is configured (which exports all log records directly to avoid duplicates).

Event-loop stalls (>2 s) write `server.eventLoop.stall` spans and append to `event-loop-stalls.ndjson` beside the trace file. SQLite spans carry `db.connection` (`writer`/`reader`) and `db.lock_wait_ms` (queue wait off the event loop—subtract it before blaming query speed). Metrics live only in-process unless OTLP export is enabled.

At trace level Info or above (the default), with timing enabled, the local server file samples routine spans: SQLite, workflow runs (step code, retry schedules, cleanup and the agent threads a run starts are excluded; spans an author adds in the workflow body itself are sampled), and spans marked with `routineSpan` from `@t3tools/shared/observability` (high-volume lookups and sweeps). A routine span that succeeds in under 10 ms without events is kept only when its own span ID ends in `00` (about one in 256). The key is per span, not per trace or parent, because background fibers share the server's boot trace and recurring ticks reuse one parent span. Counts and averages for these spans in the local file and Settings → Diagnostics are therefore a biased sample. `T3CODE_TRACE_MIN_LEVEL=Debug` keeps everything. This sampling does not apply to OTLP export.

## Local OTLP stack (Grafana LGTM)

```sh
docker run --name lgtm -p 3000:3000 -p 4317:4317 -p 4318:4318 --rm -ti grafana/otel-lgtm
```

Open `http://localhost:3000` (`admin`/`admin`), export OTLP URLs in the shell, and restart the server from that same shell (packaged desktop apps launched from Finder/Dock/Start Menu do not inherit shell env vars):

```sh
export T3CODE_OTLP_TRACES_URL=http://localhost:4318/v1/traces
export T3CODE_OTLP_METRICS_URL=http://localhost:4318/v1/metrics
export T3CODE_OTLP_LOGS_URL=http://localhost:4318/v1/logs
export OTEL_RESOURCE_ATTRIBUTES=deployment.environment.name=development
vp run dev
```

## OTLP configuration and kill switches

- **Endpoints:** `T3CODE_OTLP_{TRACES,METRICS,LOGS}_URL` outrank standard `OTEL_EXPORTER_OTLP_{TRACES,METRICS,LOGS}_ENDPOINT` and `OTEL_EXPORTER_OTLP_ENDPOINT`. `T3CODE_OTLP_HEADERS` / `T3CODE_OTLP_PROTOCOL` (`http/json` default) apply only to `T3CODE_OTLP_*` endpoints; `OTEL_EXPORTER_OTLP_*` endpoints read `OTEL_EXPORTER_OTLP_*` headers/protocol (`http/protobuf` default). See [user telemetry](../user/telemetry.md#export-diagnostics-to-your-own-receiver) for Settings precedence.
- **Service names are fixed:** `t3code-server` (backend), `t3code-desktop` (Electron main, traces/logs only), and `t3code-web` (UI). `OTEL_SERVICE_NAME` is ignored—distinguish installs with `OTEL_RESOURCE_ATTRIBUTES` (e.g. `deployment.environment.name=staging`).
- **Kill switches:** `T3CODE_OTEL_SDK_DISABLED` (outranks `OTEL_SDK_DISABLED`, accepts standard boolean spellings; `OTEL_SDK_DISABLED` only accepts `true`) disables all OTLP export in server and desktop while keeping local traces and stdout intact. `OTEL_{TRACES,METRICS,LOGS}_EXPORTER=none` disables a single signal unless overridden by `T3CODE_OTLP_*_URL`.
- **Trace tuning:** `T3CODE_TRACE_FILE`, `T3CODE_TRACE_MAX_BYTES`, `T3CODE_TRACE_MAX_FILES`, `T3CODE_TRACE_MIN_LEVEL`, `T3CODE_TRACE_TIMING_ENABLED`, `T3CODE_TRACE_SLOW_SPAN_MS` (always write spans at least this long, default `1000`), `T3CODE_TRACE_SAMPLE_RATE` (share of routine span subtrees written, `0` to `1`, default `0.05`).
- **Instrumentation rules:** Trace operation boundaries via `Effect.fn("Service.operation")` (see [Effect services](../internals/02_effect-services.md)). Put high-cardinality IDs/paths on span attributes, never on metric labels.

## Heap snapshots

On macOS and Linux (not Windows), send `SIGUSR2` to the server PID from `server-runtime.json` (in the server's state dir beside `logs/`) to write `<logsDir>/server-<pid>-<timestamp>.heapsnapshot` for Chrome DevTools Memory tab:

```sh
pid="$(jq .pid "${T3CODE_HOME:-$HOME/.t3}/userdata/server-runtime.json")"
ps -p "$pid" -o command=   # verify it is the T3 server—never signal desktop or launcher
kill -USR2 "$pid"
```

- Writing pauses the server (up to a minute+ on large heaps) and needs roughly as much free RAM as the heap—send once, and avoid on a swapping host.
- Snapshots contain tokens, secrets, and thread content. Never share them publicly, and delete them manually when finished.
