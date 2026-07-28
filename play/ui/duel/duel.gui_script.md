# 개요
duel topic을 구독하고 `결투 전 패 공개`와 `duel 집행` HUD를 그린다. 공개가 끝나면 `duel.execute`로 판정/HP 변화를 만든 뒤, roulette step 표시가 끝나면 `round.advance`로 다음 phase로 넘긴다.

# 의존성
- `game/model/store.lua`: state subscribe.
- `game/model/actions.lua`: `duel.execute`, `round.advance`.
- `game/core/i18n.lua`: 패 공개 문구.
- `ui/common/gui_util.lua`: GUI node 조작.
- `ui/common/dice_art.lua`: 컵 아래 공개 주사위의 table variant와 집계/tray의 정면 variant 선택.
- `ui/common/table_seat_layout.lua`: 플레이어 컵/주사위 좌석 배치.
- `ui/duel/duel_view.lua`: resolution role을 combat 좌/우 일러스트로 투영.
- `ui/duel/duel_view.lua`: resolution `slot_index`를 고정 marker 아래 회전각으로 투영하고 격발 전 전체 장전 배열에서 집행된 step의 탄만 제거.
- `duel.gui`
  - 반복 주사위는 `player_dice_template`, `grid_dice_template`, `tray_dice_template`를 `gui.clone()`해서 사용.

# I/O
- 입력:
  - `duel`, `turn`, `players`, `flow`, `ui` topic.
- 출력:
  - `reveal_group` / `combat_group` visibility 전환.
  - 컵 순차 lift.
  - 각 플레이어 컵 아래 주사위 더미 공개. shake 결과와 같은 `a1`–`a5` table angle을 round/player/die 기준으로 안정적으로 선택한다.
  - 공개 더미는 `gui.move_above()`로 위 행 `2, 4` 뒤에 아래 행 `1, 3, 5`를 배치한다. 로컬 더미는 안내 패널을 가리지 않도록 기존 duel 공개 anchor보다 20px 위쪽에 둔다.
- 중앙 `해골 + 콜한 눈` 집계 그리드.
- 하단 로컬 패 tray 유지. 집계 grid와 tray는 판독성을 위해 정면 `a0`를 유지한다.
- 모든 패가 공개된 뒤 약 3초간 공개 화면 hold.
- SHORT/OVER russian roulette step 표시.
  - 각 step은 0.66초 간격으로 표시.
  - 일반 결투는 `왼쪽=shooter_id`, `오른쪽=target_id`로 배치한다. 따라서 SHORT는 challenger가 왼쪽, previous bidder가 오른쪽이며 OVER는 그 반대다.
  - 중앙 cylinder는 `cylinder_slots_before`의 전체 장전 배열을 표시하고 각 step의 authoritative `slot_index`까지 ease-in-out으로 회전한다. `down_indicator` 아래 약실이 장전되어 있으면 격발 시 해당 탄만 소모하고, 비어 있으면 `tick`만 재생한다.
- EXACT perfect duel step 표시.
  - 왼쪽은 exact actor, 오른쪽은 현재 step target이다. 피격자 일러스트가 easing으로 들어오므로 일반 roulette보다 긴 간격을 사용.
- 명중 step에서는 피격자 일러스트를 짧게 흔들고, 해당 타이밍부터 HP를 1씩 감소 표시.
- 전투 완료 후 round advance.

# 메모
현재 화면은 `GAME_RULES.md`의 `결투 전 패 공개`와 `## duel` sequence의 첫 구현이다. 실제 character art/effect asset이 들어오면 같은 node id에 texture/effect를 교체한다.
