# 개요
플레이어 목록 표시 GUI. 모든 플레이어를 순서대로 배치하고 active player를 강조한다.

# 의존성
- `player_carousel.gui_script`
- `ui/common/badge.gui`
- `assets/images/characters/*`

# I/O
- 입력:
  - player display list.
- 출력:
  - portrait slots.
  - HP/bullet badges.
- active/dimmed visual state.

`bidding`에서는 turn banner가 최상단을 독점한다. authoritative active player의 `slot*_body`를 정확한 가로 중앙에, previous player의 `slot*_body`를 바로 왼쪽에 배치한다. `slot*_body`가 portrait의 위치·크기·진동 기준이며 삭제된 구형 `slot*_head` placeholder는 사용하지 않는다. HP/bullet badge는 banner 아래 safe area에 배치하고, badge가 이미 표현하는 HP/탄환을 별도의 텍스트 행으로 반복하지 않는다.

# 의사코드
```text
# Pattern: Template + Node pool. gui_script가 slot_template을 플레이어 수만큼 복제/재사용.
root (box, layout = horizontal SPACE_BETWEEN)
└─ slot_template (box)            # clone_tree로 복제되는 prefab
   ├─ portrait (box)              # cosmetics.resolve("characters", ...)
   ├─ badge_hp     -> template: ui/common/badge.gui
   └─ badge_bullets-> template: ui/common/badge.gui
```
