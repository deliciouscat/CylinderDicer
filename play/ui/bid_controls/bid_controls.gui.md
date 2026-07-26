# 개요
내 턴 베팅 조작 GUI. raise, face up/down, challenge 버튼을 제공한다. 선택 face는 숫자 텍스트 대신 `f{face}_a0` 정면 주사위 이미지로 표시한다. Space/Enter가 raise를, C가 challenge를 실행하며, 비활성 버튼은 alpha 0.5로 표시한다.

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
├─ pass_button
│  └─ pass_die       # dice_default/f{face}_a0, frame 안쪽으로 12 px 내림
├─ face_up / face_down # pass_die와 같은 x축, button 위/아래
└─ challenge_button # 버튼 PNG + label, 문자 icon placeholder 없음
```
