# 개요
duel topic을 구독하고 `결투 전 패 공개`와 `duel 집행` HUD를 그린다. 공개가 끝나면 `duel.execute`로 판정/HP 변화를 만든 뒤, roulette step 표시가 끝나면 `round.advance`로 다음 phase로 넘긴다.

# 의존성
- `game/model/store.lua`: state subscribe.
- `game/model/actions.lua`: `duel.execute`, `round.advance`.
- `game/core/i18n.lua`: 패 공개 문구.
- `ui/common/gui_util.lua`: GUI node 조작.
- `ui/common/table_seat_layout.lua`: 플레이어 컵/주사위 좌석 배치.
- `duel.gui`
  - 반복 주사위는 `player_dice_template`, `grid_dice_template`, `tray_dice_template`를 `gui.clone()`해서 사용.

# I/O
- 입력:
  - `duel`, `turn`, `players`, `flow`, `ui` topic.
- 출력:
  - `reveal_group` / `combat_group` visibility 전환.
  - 컵 순차 lift.
  - 각 플레이어 주사위 더미 공개.
- 중앙 `해골 + 콜한 눈` 집계 그리드.
- 하단 로컬 패 tray 유지.
- 모든 패가 공개된 뒤 약 3초간 공개 화면 hold.
- SHORT/OVER russian roulette step 표시.
  - 각 step은 0.66초 간격으로 표시.
- EXACT perfect duel step 표시.
  - 피격자 일러스트가 easing으로 들어오므로 일반 roulette보다 긴 간격을 사용.
- 명중 step에서는 피격자 일러스트를 짧게 흔들고, 해당 타이밍부터 HP를 1씩 감소 표시.
- 전투 완료 후 round advance.

# 메모
현재 화면은 `GAME_RULES.md`의 `결투 전 패 공개`와 `## duel` sequence의 첫 구현이다. 실제 character art/effect asset이 들어오면 같은 node id에 texture/effect를 교체한다.
