# 개요
turn topic을 구독하고 indicator GUI를 갱신한다. bidding에서는 local turn이면
`내 턴`, 상대 turn이면 active opponent 이름을 표시한다.

# 의존성
- `game/model/store.lua`: topic subscribe.
- `game/model/selectors.lua`: 내 턴 여부.
- `game/core/i18n.lua`: label 조회.
- `turn_indicator.gui`: 표시 노드.

# I/O
- 입력:
  - `turn` topic payload.
  - `players` topic payload.
- 출력:
  - banner text.
  - active visual state.

# 의사코드
```lua
-- Pattern: View = Observer (display only, dispatch 없음).
local store_mod = require("game.model.store")
local selectors = require("game.model.selectors")
local i18n      = require("game.core.i18n")

function init(self)
    self.store = store_mod.get()
    self.subs = {
        self.store:subscribe("turn",    function(s) self:render(s) end),
        self.store:subscribe("players", function(s) self:render(s) end),
    }
    self:render(self.store:get_state())
end

function final(self)
    for _, t in ipairs(self.subs) do self.store:unsubscribe(t) end
end

function render(self, s)
    if s.turn.kind == "bidding" and not selectors.is_my_turn(s) then
        local active = s.players.by_id[s.turn.active_player_id]
        gui.set_text(gui.get_node("label"), active.name)
        return
    end
    -- 그 외 phase/local turn label 갱신.
end
```
