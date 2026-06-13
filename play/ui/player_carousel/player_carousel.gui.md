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

# 의사코드
```text
# Pattern: Template + Node pool. gui_script가 slot_template을 플레이어 수만큼 복제/재사용.
root (box, layout = horizontal SPACE_BETWEEN)
└─ slot_template (box)            # clone_tree로 복제되는 prefab
   ├─ portrait (box)              # cosmetics.resolve("characters", ...)
   ├─ badge_hp     -> template: ui/common/badge.gui
   └─ badge_bullets-> template: ui/common/badge.gui
```

