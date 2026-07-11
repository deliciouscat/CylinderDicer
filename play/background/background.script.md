# 개요
Legacy world-sprite 배경 제어 모듈 문서. `main.collection`은 더 이상 `/background/background.script`를 참조하지 않고, 활성 배경 구현은 `/background/background.gui` + `/background/background.gui_script`다.

# 현재 상태
- `background` GO의 컴포넌트 id는 계속 `background`라서 director 주소 `/background#background`는 유지된다.
- 위치/스케일은 GUI node `backdrop`으로 이관됐다.
- HTML5 시각 검증은 GUI 경로의 `visual_status.background.position_y`를 기준으로 한다.

# 관련 문서
- `play/background/background.gui_script.md`
- `shared/docs/HTML5_VISUAL_DIAGNOSIS.md`
