# QA Protocol

This is a legacy local QA protocol for the current Defold dev runtime.
It is not the product authority model. The target product architecture is
server-authoritative and documented in [`../../SERVER.md`](../../SERVER.md).

For this legacy QA path, the Defold dev runtime owns game state and exposes a
local file protocol.

- Status snapshot: `/tmp/cylinderdicer_qa_status.txt`
- Command queue: `/tmp/cylinderdicer_qa_commands.txt`

Status is one JSON object. Commands are JSON Lines:

```json
{"id":"controller-1","actor_id":"opponent-1","action":"bid","payload":{"count":6,"face":3}}
```

Legacy text commands remain supported for terminal QA.

`available_actions` is authoritative for controller and bot presentation. Defold
still validates every command against current state.

External opponent tools do not access these files. They connect to
`vertual-server/`, which rejects local-player commands and unavailable actions before
forwarding accepted commands to Defold.
