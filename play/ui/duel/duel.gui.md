# 개요
결투 화면 GUI. 주사위 공개, 판정 결과, 좌/우 전투 일러스트, trigger 결과를 표시한다.

# 의존성
- `duel.gui_script`
- `ui/common/dice_face.gui`
- `ui/common/badge.gui`
- `assets/images/characters/*`

# I/O
- 입력:
  - duel state.
  - sequence step.
- 출력:
  - dice spread.
  - judge label.
  - combat portraits.
  - hit/miss effects.

# 의사코드
```text
# Pattern: 단계별 노출 node tree. duel.gui_script의 step에 따라 부분 노출/애니메이션.
root (box)
├─ dice_spread (box) -> 플레이어별 dice_face 그룹   # reveal 단계
├─ verdict (label)                                 # i18n: duel.verdict.SHORT/OVER/EXACT
├─ portrait_left (sprite)                          # 전 턴(또는 맞춘 사람)
├─ portrait_right (sprite)                         # 도전자/지목 대상
└─ fx (box)                                        # 철컥/탕 hit/miss 이펙트
```

