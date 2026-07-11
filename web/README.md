# CylinderDicer Web

Vue.js web shell for account, lobby, shop, ranking, inventory, and the Defold play wrapper.

The Defold HTML5 build is loaded from `web/public/play/` by `src/play-wrapper/DefoldCanvas.vue`.

After bundling Defold HTML5 into `play/wasm-web/CylinderDicer/`, sync it into the web public directory from the repository root:

```bash
npm run defold:web:sync
```
