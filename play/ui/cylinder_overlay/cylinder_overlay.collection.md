# 개요
영구 cylinder overlay 구조. 현재 E2E slice에서는 `main.collection`에 `/cylinder` game object로 직접 임베드한다. 턴 block 교체와 무관하게 단일 인스턴스로 유지된다.

# 의존성
- `cylinder_overlay.script`
- `assets/images/revolver/*`
- `game/core/anchors.lua`
- `game/core/tween.lua`

# I/O
- 입력:
  - script가 sprite/slot nodes 제어.
- 출력:
  - visible cylinder object.
  - slot hit areas.

# 의사코드
```text
# Pattern: Singleton GO. 턴 블럭 교체와 무관하게 main.collection에 1회만 인스턴스화.
main.collection
└─ go "/cylinder"
   ├─ component "#cylinder": cylinder_overlay.script  # 위치/장전 입력 제어
   └─ component "#cylinder_gui": cylinder_overlay.gui # placeholder 표시
```
