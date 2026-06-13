# 개요
현재 턴 상태를 보여주는 GUI 레이아웃. 내 턴, 상대 턴, 결투, 흔들기 상태를 배너로 표시한다.

# 의존성
- `turn_indicator.gui_script`: 노드 값 갱신.
- `assets/images/ui/turn_indicator/*`: 배너 리소스.
- `game/core/i18n.lua`: label 문자열.

# I/O
- 입력:
  - gui_script에서 text/style 갱신.
- 출력:
  - visible banner nodes.

# 의사코드
```text
# Pattern: 정적 node tree. gui_script가 값(텍스트/스타일)만 주입한다.
root (box: ui/turn_indicator/banner_frame)
└─ label "label"        # i18n.t(...) 결과를 gui_script가 set_text
```

