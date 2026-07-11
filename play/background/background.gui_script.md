# 개요
세로 파노라마 배경 GUI 제어 모듈. `/background/background.gui`의 단일 `backdrop` box node가 `/main/main.atlas`의 `background` animation을 렌더링하며, `gui.set_render_order(2)`로 carousel(3)+ HUD 아래에 배치한다. 기존 world sprite의 `1.36` scale은 GUI node scale로 그대로 옮겼고, node position이 기존 screen-space `LOCATION_Y` 값을 직접 가진다.

# 의존성
- `game/director.script`: 목표 배경 위치 요청.
- `game/dev/visual_status.lua`: HTML5/editor QA 상태 보고.
- `main/game_bridge.lua`: HTML5 여부 판별.
- `assets/images/backgrounds/*`: 배경 이미지 리소스.

# I/O
- 입력:
  - message: `{ type = "pan_to", location = "setup" | "bidding" | "shaking" | "dualing" }`
- 출력:
  - `backdrop` GUI node position.
  - `visual_status.background = { location, target_y, position_y }`.
  - 완료 message: `{ type = "background_pan_complete", location = string }`

# 동작
- `setup` / `bidding`: node position `(640, -410, 0.1)`
- `shaking` / `dualing`: node position `(640, 720, 0.1)`
- HTML5에서는 main loop throttling 영향을 줄이기 위해 즉시 `gui.set_position`으로 snap한다.
- 에디터/데스크톱에서는 `gui.animate(self.backdrop, "position.y", y, gui.EASING_INOUTQUAD, 0.6)`로 기존 팬 연출을 유지한다.
- HTML5에서 배경 위에 흰/회색 막이 생기지 않도록 다른 HUD `.gui`의 alpha-zero structural box nodes는 `0×0` 크기로 유지한다. 실제로 보여야 하는 panel/shade nodes만 면적을 가진다.

# 의사코드
```lua
local LOCATION_Y = { setup = -410, bidding = -410, shaking = 720, dualing = 720 }

function init(self)
    self.backdrop = gui.get_node("backdrop")
    gui.set_render_order(2)
    report_background(self, LOCATION_Y.bidding)
end

function on_message(self, message_id, message, sender)
    if message_id ~= hash("pan_to") then return end
    local location = message.location or "shaking"
    local y = LOCATION_Y[location] or LOCATION_Y.shaking

    if game_bridge.is_web() then
        gui.set_position(self.backdrop, vmath.vector3(640, y, 0.1))
        msg.post(sender, "background_pan_complete", { location = location })
        return
    end

    gui.animate(self.backdrop, "position.y", y, gui.EASING_INOUTQUAD, 0.6, 0.0, function()
        msg.post(sender, "background_pan_complete", { location = location })
    end)
end
```
