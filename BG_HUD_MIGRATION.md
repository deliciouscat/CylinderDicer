# BG → HUD(GUI) Migration Plan

배경(world sprite)을 GUI 레이어로 이관하여 HTML5 시각 불일치의 원인 경로를 제거하는 마이그레이션 계획.

## 결론 요약

- 배경은 이 게임의 **유일한 world sprite**다 (`play/main/main.collection`의 `background` GO). 컵/레일/주사위/캐러셀/듀얼 등 나머지 시각 요소는 전부 GUI(render_order 3~15)이며, HTML5에서 정상 렌더가 확인됐다.
- 초기 HTML5 진단은 world sprite의 projection/좌표 불일치를 의심했다. 이 마이그레이션은 그 경로의 유일한 사용자를 제거해 게임 전체를 GUI 렌더 경로로 통일한다.
- HUDify 후속 진단에서 남은 HTML5 grey/white 화면은 background 자체가 아니라 alpha-zero HUD `TYPE_BOX` nodes가 배경 위를 덮는 문제로 확인됐다.

## 진행 상태 (2026-07-07)

- 완료: `background.gui` / `background.gui_script` / `main.collection` 마이그레이션. `/background#background` URL과 `pan_to` / `background_pan_complete` / `visual_status.background` 계약은 유지된다.
- 최종 배경 구조:
  - `background.gui`: 단일 `backdrop` box node, texture `main/background`, size `941×1672`, scale `1.36`, initial position `(640, -410, 0.1)`, `color.w = 1.0`, `adjust_reference: ADJUST_REFERENCE_PARENT`.
  - `background.gui_script`: `gui.set_render_order(2)`, web은 `gui.set_position` 즉시 snap, editor/desktop은 `0.6s` `gui.animate`.
- HTML5에서 배경이 사라진 직접 원인:
  - background 자체가 아니라, 나중에 렌더되는 HUD `.gui`들의 alpha-zero full-screen/group `TYPE_BOX` nodes가 HTML5에서 흰/회색 면으로 배경을 덮었다.
  - 구조용 invisible box nodes는 `0×0`으로 축소했다 (`local_hud`, `shake`, `player_carousel`, `bid_controls`, `rail`, `cylinder_overlay`, `duel`). 실제 visible panel/shade nodes만 면적을 가진다.
  - `render_order(10)`은 배경을 보이게 만들지만 HUD를 덮으므로 실패한 우회책이다. 안정 경로는 background order `2` + HUD 구조 box 정리다.
- 자동화:
  - `tools/html5-phase-check.mjs`는 harness로 reload/shake/bidding-local을 진행하고, PNG screenshot pixels를 샘플링해 배경 art가 grey/blank가 아님을 확인한다.
  - initial reload는 QA command가 아니라 실제 canvas click 3회로 검증한다.
  - WebGL canvas를 2D canvas로 readback하는 방식은 headless에서 black을 반환할 수 있어 판정 신호로 쓰지 않는다.
- 검증:
  - LuaJIT parse 통과.
  - Defold editor HTTP build 통과 (`{"success":true,"issues":[]}`).
  - `npm run defold:web:build` release bundle + sync 통과.
  - `node tools/html5-phase-check.mjs --shots .tmp/html5-bg-hud-shots-click-reload` 통과: real reload clicks load 3 bullets, reload/bidding `position_y=-410`, shake `position_y=720`, three screenshots all non-grey.
  - HTML5 `DOM_POINTER` follow-up 이후 editor HTTP build는 `play/.internal/editor.port` 부재로 재실행하지 못했다.

## 이전 구조 (migration 전)

| 요소 | 값 |
| --- | --- |
| GO | `main.collection` → `background`, position `(640, -410, 0)`, scale `1.36` |
| 컴포넌트 | `/background/background.script` + embedded sprite `backdrop` (`/main/main.atlas`의 `background` 애니메이션) |
| 원본 이미지 | `play/assets/images/backgrounds/default/background.png`, 941×1672, 8-bit RGB true color |
| 팬 로직 | `background.script`가 `pan_to` 수신 → `LOCATION_Y` (`bidding/setup = -410`, `shaking/dualing = 720`)로 이동, 완료 시 `background_pan_complete` 회신. web에서는 tween 없이 즉시 이동 |
| 호출자 | `game/director.script`가 `msg.post("/background#background", "pan_to", ...)` |
| 상태 보고 | `visual_status.set("background", { location, target_y, position_y })` |
| 카메라 | `main.collection`의 orthographic auto-cover 카메라 — 사실상 이 스프라이트 전용 |

## 목표 설계

### 새 파일

1. `play/background/background.gui`
   - textures: `main` → `/main/main.atlas`
   - 단일 box node `backdrop`:
     - texture: `main/background`
     - size: `941 × 1672` (원본 픽셀), scale: `1.36` (현행 GO scale 이식)
     - position: `(640, -410, 0.1)`, pivot: center
     - `color.w = 1.0`
     - `adjust_reference: ADJUST_REFERENCE_PARENT`
2. `play/background/background.gui_script`
   - `gui.set_render_order(2)` (최하위 HUD인 player_carousel이 3), `visual_status.set("background", ...)` 초기 보고
   - `on_message("pan_to")`:
     - `LOCATION_Y` 테이블과 위치 보고 로직은 기존 `background.script`에서 그대로 이식
     - `game_bridge.is_web()`이면 `gui.set_position` 즉시 이동 (main loop throttling으로 tween이 멈추는 문제가 확인되어 있으므로 유지)
     - 데스크톱/에디터는 `gui.animate(node, "position.y", ..., gui.EASING_INOUTQUAD, 0.6)` + 완료 콜백
     - 두 경로 모두 완료 시 `msg.post(sender, "background_pan_complete", { location = location })` 회신
   - `visual_status` 보고 유지: `position_y`는 `gui.get_position(node).y`

### 컬렉션 변경

`main.collection`의 `background` GO에서:

- embedded sprite `backdrop` 제거
- `/background/background.script` 컴포넌트를 `/background/background.gui` 컴포넌트로 교체하되 **컴포넌트 id는 `background` 유지**

이렇게 하면 director의 대상 URL `/background#background`가 그대로 유효하여 `director.script`는 수정이 필요 없다. GO 자체의 position/scale은 GUI 렌더링에 영향이 없으므로 남겨도 무방하나, 혼동 방지를 위해 기본값으로 정리한다 (좌표·스케일은 GUI 노드로 이관됨).

### 좌표 이식 근거

에디터의 orthographic world 좌표와 GUI 좌표 모두 1280×720 논리 공간이므로 GO 위치 `(640, -410)`, scale `1.36`, `LOCATION_Y` 값(-410 / 720)이 GUI 노드에 1:1로 이식된다. 별도의 좌표 변환은 없다.

### 기존 파일 처리

- `play/background/background.script`: 컬렉션에서 참조가 사라졌으므로 검증 완료까지 한 사이클 유지한 뒤 삭제 검토.
- `play/background/background.script.md`: legacy pointer로 축소.
- `play/background/background.gui_script.md`: 활성 GUI script 문서로 추가.

## 마이그레이션 단계

1. `background.gui` / `background.gui_script` 작성 (`defold-proto-file-editing`, `defold-scripts-editing` 스킬 선행 확인)
2. `main.collection`에서 background GO의 컴포넌트 교체
3. **에디터 빌드 검증** (`defold-project-build`): reload / cup_shake / bidding 3개 페이즈에서 기존 스크린샷과 파노라마 슬라이스·팬 애니메이션 parity 확인. 특히:
   - 배경이 carousel(3), shake(4) 등 모든 HUD **아래**에 깔리는지
   - `bidding → shaking` 전환 시 0.6초 팬이 동일하게 동작하는지
4. `npm run defold:web:build`로 재번들+싱크 (stale bundle 주의 — Lua/컬렉션 변경은 재번들 필수)
5. **HTML5 검증**: `node tools/html5-phase-check.mjs --shots .tmp/html5-bg-hud-shots` 또는 focused Chrome 탭에서 `tools/html5-diagnosis-harness.js` 로드 후 `START_MATCH`(`localSimulator: true`) → `QA_COMMAND` 루프
   - `QA_STATUS.visual.background.position_y`가 페이즈별 기대값(-410 / 720)과 일치
   - reload/bidding에서 선술집, shake/duel에서 테이블 슬라이스가 에디터와 동일하게 보이는지
6. `shared/docs/HTML5_VISUAL_DIAGNOSIS.md`에 결과 기록, ROADMAP 갱신

## 검증 체크리스트

- [x] HTML5: reload 페이즈 = 선술집 파노라마 + reload UI, `position_y=-410`
- [x] HTML5: reload HUD 실제 canvas click 3회로 bullets 3발 장전 후 `cup_shake` 진입
- [x] HTML5: cup_shake = 테이블 + 컵, `position_y=720`
- [x] HTML5: bidding local turn = 선술집 + rail/bid_controls/dice tray, `position_y=-410`
- [x] HTML5: HUD가 background 위에 렌더됨 (`render_order(2)` + HUD orders 3+)
- [x] HTML5: `background_pan_complete`가 director 진행을 막지 않음 (harness가 reload → shake → bidding까지 진행)
- [x] 에디터: HTTP build 성공, no issues
- [ ] 에디터: reload/cup_shake/bidding 3개 페이즈 최종 육안 재확인
- [ ] 에디터: 페이즈 전환 팬 애니메이션 0.6s 동작 육안 재확인

## 리스크와 미해결 사항

| 리스크 | 평가 |
| --- | --- |
| 원인이 투영이 아니라 텍스처 레벨일 가능성 | 낮음 — bare page에서 배경 아트가 WebGL 렌더됨이 확인됨. 만약 GUI 이관 후에도 동일 증상이면 이 가설이 기각되므로 그 자체로 진단 가치가 있음 |
| GUI adjust/letterbox 상호작용 | HTML5 `scale_mode=fit`에서는 캔버스 내부가 1280×720 논리 공간이라 영향 없음. 데스크톱 리사이즈 시 auto-cover와 미세하게 다를 수 있으므로 에디터 검증 단계에서 창 크기 변경 확인 |
| GUI batch/텍스처 크기 | `main.atlas`는 ~1024×2048 수준으로 WebGL 한계(대부분 4096+) 내. 컵 등 대형 GUI 텍스처가 이미 정상 동작 중 |
| 롤백 | `main.collection` diff 복원 + 신규 파일 삭제로 즉시 복구 가능 |

**명시적 한계**: 이 마이그레이션은 world sprite 경로의 orthographic/high_dpi 불일치 **원인 자체를 규명하지 않는다**. 향후 world sprite를 다시 도입할 일이 생기면 `HTML5_VISUAL_DIAGNOSIS.md`의 미해결 항목부터 재조사할 것.

## 후속 정리

- `main.collection`의 camera GO 제거 검토 — world sprite가 사라지면 카메라를 그릴 대상이 없다. 단, 제거 전에 GUI-only 렌더에서 카메라 부재가 기본 render script와 문제없는지 에디터에서 확인
- `background.script` 삭제 및 `.md` 문서 갱신
- `.agents/skills/defold-html5-visual-parity-debugging/SKILL.md`의 world sprite 관련 절차는 유지 (일반론으로 여전히 유효)
