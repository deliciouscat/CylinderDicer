# HTML5 Visual Diagnosis

Standalone bundle QA at `http://127.0.0.1:5173/play/index.html` with `localSimulator: true` + `QA_COMMAND`. Harness: `tools/html5-diagnosis-harness.js`.

## Background GUI migration (2026-07-07)

The previous background was the game’s only world sprite. It has been moved to `/background/background.gui` as a GUI `backdrop` box node using `main/background`, with `/background/background.gui_script` preserving the existing `pan_to` / `background_pan_complete` contract and `visual_status.background` reporting.

Current render path:

- `play/main/main.collection` still exposes `/background#background`, but the component now references `/background/background.gui`.
- The old embedded sprite `backdrop` is no longer referenced.
- `background.gui` contains one `backdrop` node: texture `main/background`, size `941×1672`, scale `1.36`, initial position `(640, -410, 0.1)`, `color.w = 1.0`.
- `background.gui_script` uses `gui.set_render_order(2)` and direct screen-space pan positions.
- HTML5 pans snap immediately with `gui.set_position`; editor/desktop pans animate for `0.6s`.
- Later HUD `.gui` files keep structural alpha-zero `TYPE_BOX` nodes at `0×0`; otherwise HTML5 can draw those boxes as white/grey coverage over lower render orders.
- HTML5 canvas pointer-downs are also forwarded through `game_bridge.lua` as `DOM_POINTER` messages. This is a transport fallback for browser/canvas input delivery; `cylinder_overlay.script` routes it through the same load logic as native Defold input.

This intentionally removes the world projection path from current gameplay. It does **not** prove the exact original orthographic/high-DPI mismatch root cause.

Validation status:

- Passed: LuaJIT parse for `background.gui_script`.
- Passed: Defold editor HTTP build (`success: true`, no issues).
- Passed: `npm run defold:web:build` release bundle + sync; bundle freshness check reported `play/background/background.gui_script` as the latest source.
- Passed: `node tools/html5-phase-check.mjs --shots .tmp/html5-bg-hud-shots-screenshot-metrics`.
  - reload: `position_y=-410`, screenshot non-grey.
  - real pointer reload clicks: three canvas clicks load 3 bullets and advance to `cup_shake`.
  - shake: `position_y=720`, screenshot non-grey.
  - bidding local turn: `position_y=-410`, screenshot non-grey.
- Caution: `QA_STATUS.visual.background.position_y` alone is not enough; it can be correct while an upper GUI layer hides the image. Screenshot checks must also confirm non-grey background art and HUD-over-background layering.
- Caution: WebGL canvas readback through `ctx.drawImage(canvas)` can return black in headless/automation even when the page screenshot is correct. Use captured PNG screenshot pixels for automated visual checks.
- Note: after the HTML5 `DOM_POINTER` follow-up, Lua parse and HTML5 bundle/checks passed; editor HTTP build was not rerun because `play/.internal/editor.port` was absent.

## Editor vs HTML5 screenshot matrix (2026-07-07)

| Phase | Editor (desktop) | HTML5 (`/play/index.html`) | Parity |
| --- | --- | --- | --- |
| **reload** | Tavern panorama (`y≈-410`), reload UI, carousel placeholders, 3 bullet pips | Tavern panorama, reload UI, `position_y=-410` | pass |
| **cup_shake** | Round wooden table (`y≈720`), leather cups, `[Space]…` hint, `0/6` | Round wooden table, cups/dice UI, `position_y=720` | pass |
| **bidding (local turn)** | Tavern panorama, rail, bid controls, dice tray, carousel, cylinder HUD | Tavern panorama, rail, bid controls, dice tray/cylinder HUD, `position_y=-410` | pass |
| **bare page load** | N/A — editor auto-starts dev match | **Table panorama only**, no cups/rail/dice, corrupted top banner, Defold footer | **not comparable** |

### How to read the matrix

1. **Editor reload/bidding** show the **upper** panorama (tavern / `LOCATION_Y.bidding = -410`).
2. **Editor shake** shows the **lower** panorama (round table / `LOCATION_Y.shaking = 720`).
3. **HTML5 bare URL** (no `START_MATCH`) is **not the same test** as editor play:
   - `main.script` `start_dev_match()` is **skipped on web** (`bridge.is_web()`).
   - Engine boots idle; Vue wrapper or console must send `START_MATCH`.
4. The HTML5 bare screenshot **proved the background texture could render on WebGL before the GUI migration** (table texture visible). Earlier “all white” runs were partly **embedded-browser throttling** and partly **unstarted match / stale GUI**.
5. **Foreground parity on HTML5 bare page is N/A** — without `START_MATCH` there is no store, director sync, or activated GUI blocks.

## Executive summary (automated traces)

| Hypothesis | Result |
| --- | --- |
| Indexed PNG (#2) | **Ruled out** — `background.png` is 8-bit RGB; cup/dice GUI atlases render on HTML5 when match is started. |
| CSS pathing (#4) | **N/A** — in-game background is a Defold render resource, not HTML/CSS. |
| Z-clipping (#1) | **Low priority pre-migration** — table portion rendered; widen near/far experiment did not change bare-page observation. GUI migration removes this as a current background concern. |
| Pan Y only | **Insufficient** — `position_y` can be correct while another GUI scene covers the image. Pair status checks with screenshot-pixel checks. |
| HUD alpha-zero boxes | **Confirmed** — later full-screen/group `TYPE_BOX` nodes with `color.w=0` covered the GUI background in HTML5. Structural invisible boxes are now `0×0`. |
| HTML5 reload clicks | **Fixed** — canvas `pointerdown` now forwards logical coordinates via `DOM_POINTER`; the cylinder script handles that message with the same loader used by `on_input`. |
| Canvas readback | **Unreliable for this check** — headless WebGL canvas readback returned black; captured page screenshots showed correct rendering. |
| Main loop throttling (embedded browser) | **Confirmed** — stalls tween, `bidding_gap`, director `activate`. Use focused Chrome or the Playwright screenshot checker for sign-off. |
| Stale GUI after fast QA | **Confirmed** — reducer ahead of `visual.*` until `resumeMainLoop` pumps. |
| Coworker 4-point FAQ | **Low yield** — background is sprite; PNG is true color; not CSS splash. |

## Phase traces (HTML5 automated, Playwright screenshot check)

| Phase | `background.position_y` | `background.target_y` | On-screen |
| --- | --- | --- | --- |
| reload | -410 | -410 | Tavern art + reload HUD |
| cup_shake | 720 | 720 | Round table art + cups/dice |
| bidding local turn | -410 | -410 | Tavern art + rail/bid controls/dice/cylinder HUD |

User Chrome bare page: **table art visible without gameplay** — stronger than embedded-browser table rendering.

Network: no zero-byte `/play/` resource failures in `performance.getEntriesByType('resource')`.

## Applied mitigations (in repo)

1. `background.gui` / `background.gui_script` — GUI backdrop, `visual_status` (`location`, `target_y`, `position_y`), render order 2, and **HTML5 instant pan** (no tween).
2. `main.collection` — background component now references `/background/background.gui`; old embedded sprite removed. Camera near/far experiment remains but no longer drives the background.
3. HUD `.gui` structural boxes — alpha-zero root/group nodes that are containers only were changed to `0×0`, preventing HTML5 from drawing invisible full-screen covers over the background.
4. HTML5 pointer fallback — `game_bridge.lua` forwards canvas pointer-downs as `DOM_POINTER`; `main.script` posts them to `/cylinder#cylinder`; `cylinder_overlay.script` reuses its reload hit-test and load flow.
5. `tools/html5-phase-check.mjs` — automated phase flow now samples captured PNG screenshots instead of WebGL canvas readback, and uses real canvas clicks for the initial reload.

## Next verification

Editor/desktop visual sign-off is still worth doing after any GUI metadata change:

- [ ] reload/cup_shake/bidding local turn match the editor screenshots.
- [ ] `bidding ↔ shaking` pan still animates for about `0.6s` on editor/desktop.
- [ ] HTML5 remains snap-pan only and continues through `background_pan_complete`.

If HTML5 regresses, run `node tools/html5-phase-check.mjs --shots .tmp/html5-bg-hud-shots` first. If the JSON `position_y` is correct but screenshot metrics fail, inspect upper GUI scenes for enabled alpha-zero `TYPE_BOX` nodes with non-zero size before changing camera/projection constants.

## How to rerun

```bash
npm run defold:web:build
# Focused Chrome tab — NOT embedded IDE browser
# http://127.0.0.1:5173/play/index.html
# paste tools/html5-diagnosis-harness.js → await __cdHarness.runPhaseChecks()

# Or automated (Playwright Chromium):
node tools/html5-phase-check.mjs --shots .tmp/html5-bg-hud-shots
```
