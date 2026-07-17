# 개요

레일 drag/scroll/key 입력을 count 선택 action으로 변환하고, 선택 count가 항상 화면 중앙에 오도록 무한 스크롤 형태의 rail GUI를 갱신한다.

# 의존성

- `game/model/store.lua`: dispatch/subscribe.
- `game/model/actions.lua`: `bid.select_count`.
- `game/model/selectors.lua`: bidding HUD 표시 여부.
- `game/core/gestures.lua`: drag/scroll/key 정규화.
- `ui/rail/rail_layout.lua`: 셀 수, 중앙 index, 간격, 유효 값, 이동 step 계산.
- `rail.gui`

# I/O

- 입력:
  - pointer drag.
  - scroll.
  - left/right key.
  - `bidding`, `turn`, `flow`, `ui` topic.
  - `select_count` message.
- 출력:
  - `bid.select_count` action.
  - 중앙 정렬 rail 이동 및 셀 재사용.

# 동작 계약

- `rail_strip`에는 좌·중·우 3개의 `rail.png` tile과 13개의 숫자판이 들어 있다.
- 선택 count가 바뀌면 strip 전체를 셀 한 칸만큼 `gui.EASING_INOUTQUAD`로 이동한다.
- 이동 완료 후 strip을 원점으로 되돌리고 중앙 count 기준으로 label을 다시 채운다. 따라서 DOM/GUI node를 계속 생성하지 않는다.
- 1 미만 또는 36 초과 위치는 label과 숫자판 panel을 함께 숨긴다. rail track 배경은 이어지지만 빈 위치에 표지판은 표시하지 않는다.
- 숨김 phase에서 count가 바뀌면 animation 없이 최신 값으로 동기화한다.
- 연속 입력은 현재 animation을 끝낸 뒤 최신 target까지 이어서 처리한다.
- Defold 1.13.0 GUI runtime에는 `gui.cancel_animation` API가 없으므로, 진행 중 animation을 취소하지 않고 완료 callback에서 최신 target을 이어 처리한다.
