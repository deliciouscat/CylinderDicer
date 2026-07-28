# 개요
0..36 베팅 count 레일 GUI. visible window만 표시하고 `ui/down_indicator`/`ui/up_indicator` pointer를 얹는다.

# 의존성
- `rail.gui_script`
- `ui/common/badge.gui`
- `ui/common/dice_face.gui`
- `assets/images/rail/*`

# I/O
- 입력:
  - visible range.
  - selected count.
- authoritative current bid.
- 출력:
  - rail cells.
  - selected pointer.
  - bid markers.

# 의사코드
```text
# Pattern: Clipping window + template 재사용. 보이는 구간(window)만 렌더.
root (box, clipping = stencil)        # 화면 밖 칸은 잘림
├─ track (sprite: rail/<map>/track)
├─ cell_template (box)                # window 칸 수만큼 재사용 (normal / previous-bid check)
├─ marker_template -> badge + dice_face   # recent bids
└─ pointer_top / pointer_bottom       # ui/down_indicator, ui/up_indicator
```
