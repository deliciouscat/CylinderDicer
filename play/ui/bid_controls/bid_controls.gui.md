# 개요
내 턴 베팅 조작 GUI. pass, face up/down, challenge 버튼을 제공한다.

# 의존성
- `bid_controls.gui_script`
- `ui/common/button.gui`
- `ui/common/arrow_button.gui`
- `ui/common/dice_face.gui`

# I/O
- 입력:
  - current selected bid.
  - validity flags.
- 출력:
  - pass button.
  - face controls.
  - challenge button.

# 의사코드
```text
# Pattern: 재사용 template 조합(prefab composition). 가시성은 gui_script가 토글.
root (box, visible = 내 턴일 때만)
├─ pass_button     -> template: ui/common/button.gui      # sub = "{count}개 · {face}"
├─ face_arrows (box)
│  ├─ arrow_up   -> template: ui/common/arrow_button.gui  # dir = up
│  └─ arrow_down -> template: ui/common/arrow_button.gui  # dir = down
└─ challenge_button-> template: ui/common/button.gui       # style = danger
```

