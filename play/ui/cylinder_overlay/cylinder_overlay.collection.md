# 개요
영구 cylinder overlay collection. 턴 block 교체와 무관하게 단일 인스턴스로 유지된다.

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
# Pattern: Singleton GO collection. 턴 블럭 교체와 무관하게 main.collection에 1회만 인스턴스화.
collection "cylinder_overlay"
└─ go "cylinder"
   ├─ script: cylinder_overlay.script        # 위치/장전 입력 제어
   ├─ sprite "cylinder_art"                   # revolver/<skin>/cylinder.png
   └─ slot[1..N] (box)                        # bullet sprite + invisible 버튼 hit area
```

