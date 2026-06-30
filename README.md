# CylinderDicer

Liar's Dice 변형 게임. 웹에서는 Vue.js 앱이 로비, 상점, 랭킹, 결제, 공지 같은 게임 외부 화면을 담당하고, Defold는 실제 플레이 화면을 담당한다.

## Project Layout

```text
root/
  play/      Defold project. Gameplay, input, animation, native/mobile/desktop builds.
  web/       Vue web app. Lobby, shop, ranking, inventory, account, Defold wrapper.
  opponent-controller/  Vue QA GUI for manually driving dev-match players.
  opponent-bot/         Node QA bot using the same player command protocol.
  vertual-server/       Local QA server between opponent tools and Defold.
  shared/    Shared docs and message protocol between web and play.
  tools/     Build/copy scripts for web and Defold outputs.
```

## Local Opponent QA

Run the Defold project in dev mode, then start server and controller together:

```bash
node tools/start-opponent-qa.mjs
```

Open `http://127.0.0.1:4318`.

Run automated opponents in another terminal:

```bash
cd opponent-bot
npm start
```

Both opponent tools connect only to `vertual-server/`. The server bridges the JSON
QA protocol documented in `shared/qa/README.md`.

## Targets

- Web: build `play/` as Defold HTML5 and load it from `web/public/play/`.
- Mobile app: build native mobile targets from `play/`.
- Desktop app: build native desktop targets from `play/`.

## Key Docs

- [Convex implementation plan](shared/docs/CONVEX_IMPLEMENTATION.md)
- [Defold gameplay project](play/README.md)