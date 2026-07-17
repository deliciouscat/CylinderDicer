# 개요
흔들기 턴 화면 GUI. 각 플레이어 컵, 흔들기 안내, 주사위 확인 화면을 표시한다. 로컬 진행 상태는 내부에서만 관리하고 화면에는 표시하지 않는다.

컵 visual은 이 GUI가 소유한다. 로컬 컵은 중앙 전경에 크게 표시하고 상대 컵은 `table_seat_layout`의 반원 좌석에 표시한다. shake 계열 phase에서는 `player_carousel`을 함께 표시하지 않는다.

# 의존성
- `shake.gui_script`
- `game/core/i18n.lua`

# I/O
- 입력:
  - local shake gauge.
  - local dice values.
- 출력:
  - player cup positions.
  - hint text.
  - local cup lift.
  - reveal dice and dice tray.

# 의사코드
```text
# Pattern: 정적 node tree + 반원 좌석 배치.
root
├─ cup_seat_1..5
├─ cup_local
├─ reveal_dice_1..5
├─ dice_tray
│  └─ tray_dice_1..5
└─ hint
```
