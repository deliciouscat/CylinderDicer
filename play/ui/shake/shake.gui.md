# 개요
흔들기 턴 화면 GUI. 흔들기 안내, 진행 상태, 주사위 결과 reveal placeholder를 표시한다.

컵 visual은 이 GUI가 소유하지 않는다. 컵은 세로 파노라마 테이블 레이어의 world prop이며, `background` game object의 pan과 함께 화면 아래에서 shake/duel 시점으로 등장한다. `shake.gui`는 컵 입력 상태와 안내 텍스트만 맡는다.

# 의존성
- `shake.gui_script`
- `game/core/i18n.lua`

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
├─ hint (text)        # i18n: 흔들기 안내
└─ dice_values (text) # 굴림 결과 placeholder
```
