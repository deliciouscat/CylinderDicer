# Opponent Bot

Node bot using the HTTP API from `vertual-server/`.

```bash
cd ../vertual-server
npm start
```

In another terminal:

```bash
cd ../opponent-bot
npm start
```

Default behavior controls every non-local player. Options:

```bash
BOT_PLAYERS=opponent-1,opponent-3 npm start
BOT_CHALLENGE_RATE=0.4 npm start
npm start -- --once
```

Environment:

- `QA_SERVER_URL`
- `BOT_PLAYERS`
- `BOT_INTERVAL_MS`
- `BOT_CHALLENGE_RATE`
