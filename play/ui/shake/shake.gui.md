# 개요
흔들기 턴 화면 GUI. 흔들기 안내, 진행 상태, 주사위 결과 reveal placeholder를 표시한다.

# 의존성
- `shake.gui_script`
- `game/core/i18n.lua`
- `ui/common/dice_face.gui`

# I/O
- 입력:
  - shake status.
  - local dice values.
- 출력:
  - hint text.
  - shake progress visual.
  - dice reveal nodes.

# 의사코드
```text
# Pattern: 정적 node tree. gui_script가 진행도/결과만 주입.
root (box)
├─ hint (label)                       # i18n: 흔들기 안내
├─ progress (sprite/box)              # 흔들기 진행 시각화
└─ dice_reveal (box) -> dice_face 템플릿들   # 굴림 결과 reveal
```

