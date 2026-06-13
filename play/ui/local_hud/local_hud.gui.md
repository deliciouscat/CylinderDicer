# 개요
로컬 플레이어 HUD 레이아웃. 내 초상, 힌트, dice tray, cylinder `hud` anchor를 제공한다.

# 의존성
- `local_hud.gui_script`
- `ui/common/dice_face.gui`
- `ui/common/badge.gui`
- `assets/images/characters/*`

# I/O
- 입력:
  - local player display data.
  - hint text.
  - dice values.
- 출력:
  - HUD nodes.
  - named anchor node for cylinder.

# 의사코드
```text
# Pattern: 레이아웃 + 빈 anchor 노드(위치 indicator). cylinder는 여기 자식이 아니다.
root (box, layout = horizontal)
├─ portrait (sprite)                  # 내 캐릭터(활성 강조)
├─ column (box)
│  ├─ hint (label)                    # i18n.t(hint_key)
│  └─ dice_tray (box) -> dice_face 템플릿들   # 굴림 결과(1=skull)
└─ cylinder_anchor (box, 비가시)       # anchors.register("hud", here)
```

