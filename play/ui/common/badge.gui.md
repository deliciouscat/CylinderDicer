# 개요
작은 상태 배지 템플릿. HP, bullet count, bid count 등 반복 표시용.

# 의존성
- `assets/images/icons/*`
- `assets/images/ui/hud/*`
- player carousel, local HUD, rail marker.

# I/O
- 입력:
  - icon id.
  - numeric/text value.
  - state: normal/warning/danger.
- 출력:
  - badge visual nodes.

# 의사코드
```text
# Pattern: 재사용 template(prefab). 호출부가 icon/value/state만 주입.
root (box)
├─ icon  (sprite: icons/<id>)         # heart, cylinder_badge 등
└─ value (label)                      # 숫자/텍스트
# state(normal/warning/danger) -> tint 또는 frame 교체
```

