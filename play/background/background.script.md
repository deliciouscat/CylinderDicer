# 개요
세로 파노라마 배경 제어 모듈. 턴 상태에 따라 풍경 상단과 테이블 하단 사이를 tween 이동한다.

# 의존성
- `game/director.script`: 목표 배경 위치 요청.
- `game/core/tween.lua`: easing 계산.
- `assets/images/backgrounds/*`: 배경 이미지 리소스.

# I/O
- 입력:
  - message: `{ type = "pan_to", location = "bidding" | "shaking" | "dualing" }`
  - update `dt`.
- 출력:
  - background game object position.
  - optional 완료 message: `{ type = "background_pan_complete", location = string }`

# 의사코드
```lua
-- Pattern: Command receiver + 위치 State. director 명령만 받고 턴 규칙은 모른다.
local tween = require "game.core.tween"

local LOCATION_Y = { bidding = TOP_Y, shaking = BOTTOM_Y, dualing = BOTTOM_Y }  -- 위치 테이블
local PAN_TIME = 0.6

function on_message(self, message_id, message, sender)
    if message_id == hash("pan_to") then
        local y = LOCATION_Y[message.location]
        tween.to(".", "position.y", y, PAN_TIME, go.EASING_INOUTQUAD, function()
            msg.post(sender, "background_pan_complete", { location = message.location })
        end)
    end
end
```

