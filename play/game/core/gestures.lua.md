# 개요
pointer/touch/keyboard/scroll 입력을 게임 action용 gesture로 정규화하는 모듈.

# 의존성
- `main/main.script`: raw input 전달.
- `ui/rail`: count drag/scroll/arrow.
- `ui/shake`: shake drag/space.
- `ui/bid_controls`: face up/down.

# I/O
- 입력:
  - Defold `on_input(action_id, action)`.
  - component bounds.
- 출력:
  - normalized events: `tap`, `drag`, `scroll`, `key_left`, `key_right`, `shake`.
  - optional action payload.

# 의사코드
```lua
-- Pattern: Adapter / Translator. raw Defold 입력을 의미 있는 gesture 이벤트로 정규화.
-- view는 좌표/키코드가 아니라 tap/drag/scroll/shake 같은 의미만 다룬다.
local M = {}
local G = {}
G.__index = G

function M.new(bounds)
    return setmetatable({ bounds = bounds, dragging = false, origin = nil }, G)
end

-- on_input에서 호출. 정규화된 이벤트 또는 nil 반환.
function G:feed(action_id, action)
    if action_id == hash("touch") or action_id == hash("pointer") then
        if action.pressed  then self.dragging, self.origin = true, vmath.vector3(action.x, action.y, 0); return { kind = "press" } end
        if action.released then self.dragging = false; return self:classify_release(action) end       -- tap or drag-end
        if self.dragging   then return { kind = "drag", dx = action.dx, dy = action.dy } end
    elseif action_id == hash("scroll") then
        return { kind = "scroll", amount = action.value }
    elseif action_id == hash("key_left")  and action.pressed then return { kind = "key_left" }
    elseif action_id == hash("key_right") and action.pressed then return { kind = "key_right" }
    elseif action_id == hash("shake")     and action.pressed then return { kind = "shake" }
    end
    return nil
end

return M
```

