# Remote architecture

Each connection joins a client to one environment over HTTP and WebSocket. Direct access, Tailscale,
and SSH change how the client reaches the server; they do not introduce a different
execution model.

## Identity is independent of the route

- An environment keeps its ID across restarts and endpoint changes. Repository identity can
  correlate clones across environments (preferring `upstream` for PR features, grouping forks by
  `origin`), but work never silently crosses environments.
- [Environment ID initialization](../../apps/server/src/environment/ServerEnvironment.ts) publishes
  atomically and retains repair state so concurrent initializers choose the same winner; do not
  sweep that recovery state as temp cleanup.
- **Routes are untrusted hints.** Only the connecting client can prove reachability. Never fall back
  to loopback when a shareable endpoint is unavailable (loopback names the client's own machine).
  Verify a direct or learned route answers as the expected environment before sending credentials,
  and never let a token paired over HTTPS downgrade to plain HTTP.
- **Route kinds order the walk.** The
  [supervisor](../../packages/client-runtime/src/connection/supervisor.ts) preflights earlier routes
  of a better kind (loopback, LAN, tailnet or VPN, public, SSH, best first) and replaces the session
  when one would connect. An earlier route of the same kind is not worth a reconnect: MagicDNS
  through `tailscale serve` and the raw tailnet address reach the same host, and mobile reconnects
  over whichever answers first after every resume.
- Pull request routing trust covers the saved route set: adding or changing a route revokes trust;
  reordering does not.

## Peer links

A [peer link](../../apps/server/src/peer/PeerLinks.ts) lets one environment's agents work in another
by signing in to the target's `/mcp` as an ordinary OAuth client (`t3code-peer-link`). The receiving
side lists and revokes it in Environments like any other session, and owns its expiry/renewal.

- **Mode ceilings always narrow.** Forwarded calls carry the calling agent's modes in
  `T3-Mode-Limit`, which the receiving `/mcp` can only intersect downward with the link's approved
  access.
- **Non-full-access links are fenced by `linkOrigin`.** Threads launched by a peer link (and their
  derived forks, subagents, and spawned threads) carry an immutable `linkOrigin` stamp enforced in
  shared access rules ([`mcp/linkOrigin.ts`](../../apps/server/src/mcp/linkOrigin.ts)). Below full
  access, linked work can mutate only threads with the same origin, cannot touch projects, settings,
  scheduled tasks, or further links, and skips project setup scripts. Full-access links are not
  fenced because their agents already run as the receiving OS user.
- **Namespace idempotency keys.** All callers on the linking side share one session on the receiving
  side, so idempotency keys must be hashed with the caller's namespace before forwarding.
- **Clients read linked threads as standard thread streams.**
  [`PeerThreadRelay`](../../apps/server/src/peer/PeerThreadRelay.ts) proxies the same stream format
  read-only so there is no second transcript schema to maintain.
- **The device network switch (`linkedEnvironmentsEnabled`) gates both sides.** Off, linking and
  forwarding refuse, but reading, waiting for, and interrupting a thread still work so a remote task
  already running completes.
- **A forwarded wait is split into calls of at most 50 s**, because the receiving `/mcp` sends
  nothing while a wait is open and a proxy on the route may drop an idle request.

## Tailnet devices

[`TailnetDevices`](../../apps/server/src/peer/TailnetDevices.ts) makes the same kind of link without
a pairing code between the members of the user's device network. A user has one network. Being one
of the owner's Tailscale nodes only gets a machine listed; it becomes a member when the owner allows
it once from any full-access member, and that act is the whole grant.

Requests arriving through Serve come from loopback with headers any local process can forge, so
nothing inbound is trusted:

- **The side giving access dials the other.** The issuer resolves the requester's address itself (a
  tailnet IP, or an https MagicDNS name, never plain http on a name), whoises it, checks its
  descriptor and stable node id against the roster, asks that address to confirm the requester's
  pending challenge, and only then mints and delivers the token. A forged request naming a real
  device's address dies at the confirmation.
- **Each direction is its own handshake.** The issuer links back before answering, so each half is
  proven by the side granting it. Gossip between members only adds addresses to try. A handshake
  slot is held for the proof only: the link back and the roster exchange run outside it, or several
  machines linking at once starve each other.
- **Membership is the grant; a link is only how it is carried.** A member links to a machine as soon
  as a sync adds it, and opening a member repairs a missing, expired, or unanswering link. A link or
  session minted while its machine was being revoked is cut by a second roster check.
- **A member is bound to its Tailscale node** (`StableID` from whois). Only the owner's Allow binds
  or rebinds it, and a different node answering for the same environment id is refused. A machine
  with no network joins whichever of the owner's nodes allowed it and takes that roster whole; a
  machine that has members takes a join only from one of them. Two networks do not merge by
  themselves. A machine refuses to join while linked environments is off, on a dev server, or when
  it revoked the allowing machine.
- **A machine announces itself.** A scan tells each machine it finds (`hello`) and that machine lists
  it after proving the address through Tailscale. Nothing is granted by a hello.

The [roster](../../apps/server/src/peer/Membership.ts) is replicated and merged last-writer-wins by
hybrid logical clock. `revoked` is a tombstone that never expires and outranks any write that does
not name it in `restores`, so a machine that missed a revocation cannot undo it. A roster write counts
only from a member session (the signed `mbr` claim, never a pairing-code link) whose machine is full
access on the receiving side, and never for an entry naming the sender. Each machine also keeps local
limits that never replicate; effective access is the narrower of roster and limit, applied to each
`/mcp` request. Agents may only narrow, and never change the machine their link comes from: widening
and restoring are the user's. A machine that leaves writes its own tombstone and clears its roster;
re-adding it is a join whose write names the tombstone in `restores`. Every member write also writes
the level an older build reads (`tailnet_device_policy`), because that build admits a machine with no
row there at full access.

Apps open members without a click: `dueNetworkMemberOpens` in
[`networkMembers.ts`](../../packages/client-runtime/src/connection/networkMembers.ts) runs a bounded
loop (two opens at once, one attempt per change, 2 s to 5 min backoff). The first open often fails
because a machine is listed the instant it is allowed. The app fetches the member's public
descriptor before asking any server to mint, and a member switched off in the app is never opened,
which is why members offer that switch and no Remove.

The server an app opens a member through asks that member for a one-time pairing credential capped
at the app's own grant, and for a network app (session subject `network-app:<id>`) at that app's
roster access. App sessions carry no agent mode ceiling, so anything below full access opens
read-only; `NETWORK_ACCESS_CEILING` in contracts sets this and caps member MCP sessions and agent
calls relayed through a connected app (`McpGatewayBroker`). Each relayed call carries the calling
chat's modes and the answering app applies them against its own reads of the target. A call moves to
the next app only when it cannot have run or is an unanswered read; a write that may have run is
never sent twice. Only a full-access chat may change the agent library, because every client syncs
it to every machine.

## Hosted web is a client

The hosted web app stores its connection catalog in the browser and connects directly to each
environment without proxying traffic, so it reaches a backend only at an HTTPS address that browser
can open, such as a tailnet address served by Tailscale Serve. A [hosted pairing URL](../../apps/web/src/hostedPairing.ts)
puts the backend target in the query and the pairing secret in the URL fragment so the secret never
reaches the hosted origin, then strips it from history.

## Desktop previews tunnel loopback

A desktop webview for a remote environment keeps `localhost` URLs and tunnels loopback connections
through `/api/preview/tunnel` on the environment's own origin:

- **Fixed SOCKS5 proxy, not PAC.** Chromium ignores PAC scripts for loopback hosts. Use a fixed
  proxy that routes only loopback through the tunnel (excluding link-local addresses) and never
  falls back directly—a failed or disabled tunnel must error rather than silently load the
  reviewer's own localhost.
- **Media tickets and local-owner check.** Desktop main holds no environment credentials, so the
  renderer supplies a media ticket per connection (also tracking route switches). Because Chromium
  cannot authenticate to SOCKS5, the local listener restricts access to the current OS user where
  the platform allows (Linux `/proc/net/tcp`).

## Access and process ownership are separate

- Tailscale supplies an endpoint for normal pairing; auth remains the environment's responsibility.
- [SSH cleanup](../../packages/ssh/src/tunnel.ts) stops a remote server only if the launcher started
  it; a server discovered already running must survive client disconnect.
- Remote servers outlive client releases. Clients negotiate features via advertised capabilities
  rather than assuming version parity. Process replacement uses the
  [update protocol](./07_server-updates.md).
