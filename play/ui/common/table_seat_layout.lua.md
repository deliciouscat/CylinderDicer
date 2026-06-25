# 개요

테이블 화면에서 로컬 플레이어와 1~5명의 상대 플레이어를 반원 형태로 배치하는 순수 View 모듈이다.

# 책임

- `players.order`에서 로컬 플레이어를 제외한다.
- 상대 수에 따라 `20~160도` 범위를 균등 분할한다.
- 캐릭터와 컵이 공유할 좌석 좌표를 반환한다.
- 상단 중앙으로 갈수록 원근감을 위해 scale을 줄인다.

# 비책임

- turn/active player에 따른 재정렬.
- 게임 모델 상태 변경.
- GUI node 직접 조작.
- cylinder anchor 계산.

# 사용자

- `ui/player_carousel/player_carousel.gui_script`
- `ui/shake/shake.gui_script`
- 향후 duel 전 패 공개 화면
