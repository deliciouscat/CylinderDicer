# 개요

로컬 Defold client가 직접 입력할 수 있는 actor 범위를 계산한다.

# 원칙

- `dev` mode도 상대 player 입력 권한을 주지 않는다.
- bidding control과 rail 입력은 local player turn에서만 허용한다.
- cylinder 장전은 `pending_load.player_id`가 local player일 때만 허용한다.
- opponent controller와 bot 입력은 `vertual-server/`와 QA protocol을 통해 들어온다.
