# 개요
주사위 face 표시 템플릿. face `1`은 해골, `2..6`은 pip 이미지로 표시한다.

# 의존성
- `game/model/rules/dice.lua`: face 의미.
- `game/core/cosmetics.lua`: dice skin asset 조회.
- `assets/images/dice/*`
- `assets/images/icons/*`

# I/O
- 입력:
  - face number.
  - skin id.
  - selected/highlighted flag.
- 출력:
  - skull icon 또는 pip sprite.

# 의사코드
```text
# Pattern: 재사용 template + 상호배타 토글. rules.dice.display_kind(face)로 결정.
root (box)
├─ skull (sprite: icons/skull)              # face == 1 일 때만 visible
└─ pip   (sprite: dice/<skin>/f<face>_a0)   # 2..6 일 때 visible
```

