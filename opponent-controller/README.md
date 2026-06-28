# Opponent Controller

Vue GUI for driving non-local CylinderDicer dev-match players through
`vertual-server/`. It does not read or write QA files directly.

From repository root, recommended:

```bash
node tools/start-opponent-qa.mjs
```

Manual two-terminal startup:

```bash
cd vertual-server
npm start
```

```bash
cd ../opponent-controller
npm install
npm run dev
```

Open `http://127.0.0.1:4318`.

Production:

```bash
npm run build
npm start
```

Environment overrides:

- `QA_SERVER_URL` for the Vite proxy target.
