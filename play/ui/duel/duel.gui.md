# 개요
결투 화면 GUI. 주사위 공개와 좌/우 전투 일러스트, HP/탄환 indicator, trigger 연출을 표시한다.

# 의존성
- `duel.gui_script`
- `assets/atlases/dices/dice_default.atlas`
- `assets/atlases/props_default.atlas`
- `assets/atlases/charcters/*`
- `assets/atlases/cylinder_default.atlas`
- `assets/atlases/revolver_default.atlas`
- `assets/atlases/ui.atlas`의 `down_indicator`

# I/O
- 입력:
  - duel state.
  - sequence step.
- 출력:
  - cup lift + dice reveal.
  - called-face/skull count grid.
  - combat portraits.
  - HP/bullet badges.
  - authoritative chamber rotation + hit/miss trigger cue.

# 의사코드
```text
# Pattern: 고정 HUD node + 반복 주사위 runtime clone.
root (box)
├─ reveal_group
│  ├─ duel_cup_{1..6}                              # reveal 단계 컵
│  ├─ grid_panel                                   # 집계 영역
│  │  └─ grid_dice_template                        # grid 좌표계 clone template
│  └─ tray                                         # 로컬 패 요약
│     └─ tray_dice_template                        # tray 좌표계 clone template
├─ combat_group
│  ├─ combat_left_body / combat_right_body         # 집행 단계 일러스트
│  ├─ left/right HP·bullet badges                  # 집행 단계 상태
│  ├─ duel_cylinder_group / duel_primer_{1..6}      # 회전 약실과 전체 장전 배열
│  └─ duel_cylinder_marker                         # 회전하지 않는 down indicator
└─ template_group
   └─ player_dice_template                         # root 좌표계 clone template
```

# 메모
반복되는 주사위 노드는 `.gui`에 직접 65개를 두지 않는다. `player_dice_template`, `grid_dice_template`, `tray_dice_template`만 두고 `duel.gui_script`가 런타임에 clone한다. `reveal_group`과 `combat_group`은 phase별 visibility 경계다. 로컬 공개 주사위 anchor는 안내문구와 겹치지 않도록 상대 좌석보다 위(`LOCAL_REVEAL_DICE_ANCHOR_OFFSET_Y`)에 둔다. 공개 더미의 행 겹침은 node `z`가 아니라 runtime draw order로 결정한다.
