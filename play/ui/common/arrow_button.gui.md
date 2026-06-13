# 개요
위/아래/좌/우 화살표 버튼 템플릿. face 변경, rail 이동 등에 사용한다.

# 의존성
- `assets/images/ui/arrows/*`
- `ui/bid_controls`
- `ui/rail`
- `game/core/gestures.lua`

# I/O
- 입력:
  - direction.
  - enabled.
  - pressed state.
- 출력:
  - arrow button visual.
  - tap hit area.

# 의사코드
```text
# Pattern: 재사용 template. direction/enabled/pressed만 주입.
root (box)
├─ arrow    (sprite: ui/arrows/<dir>, normal|pressed|disabled)
└─ hit_area (box)                     # tap 판정 영역
```

