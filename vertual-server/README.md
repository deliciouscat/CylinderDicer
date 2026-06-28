# CylinderDicer Vertual Server

Local QA server between opponent tools and the Defold dev runtime.

```bash
npm start
```

Default URL: `http://127.0.0.1:4319`

The server:

- Reads `/tmp/cylinderdicer_qa_status.txt`.
- Validates non-local actor commands against `available_actions`.
- Appends accepted JSON commands to `/tmp/cylinderdicer_qa_commands.txt`.
- Rejects commands for the local player.

Environment:

- `PORT`
- `HOST`
- `QA_STATUS_FILE`
- `QA_COMMAND_FILE`
