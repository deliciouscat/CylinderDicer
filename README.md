# CylinderDicer

Liar's Dice 변형 게임. 웹에서는 Vue.js 앱이 로비, 상점, 랭킹, 결제, 공지 같은 게임 외부 화면을 담당하고, Defold는 실제 플레이 화면을 담당한다.

## Project Layout

```text
root/
  play/      Defold project. Gameplay, input, animation, native/mobile/desktop builds.
  web/       Vue web app. Lobby, shop, ranking, inventory, account, Defold wrapper.
  shared/    Shared docs and message protocol between web and play.
  tools/     Build/copy scripts for web and Defold outputs.
```

## Targets

- Web: build `play/` as Defold HTML5 and load it from `web/public/play/`.
- Mobile app: build native mobile targets from `play/`.
- Desktop app: build native desktop targets from `play/`.

## Key Docs

- [Defold gameplay project](play/README.md)
- [BACKND integration notes](shared/docs/BACKND_INTEGRATION.md)
