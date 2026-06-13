# 개요
공통 버튼 GUI 템플릿. normal/disabled/danger 상태를 지원한다.

# 의존성
- `assets/images/ui/buttons/*`
- 각 gui_script: label, icon, enabled state 설정.
- `game/core/i18n.lua`: label text.

# I/O
- 입력:
  - label.
  - icon.
  - enabled.
  - style.
- 출력:
  - button visual nodes.
  - hit area node.

# 의사코드
```text
# Pattern: 재사용 template + 상태 프레임. 호출 gui_script가 label/icon/enabled/style 주입.
root (box: normal | pressed | disabled 프레임)
├─ icon  (box)
├─ label (label)                      # i18n.t(label)
└─ hit_area (box)                     # 입력 판정 영역
```

