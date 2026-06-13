# 개요
turn topic을 구독하고 indicator GUI를 갱신한다.

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
local store_mod = require "game.model.store"
local selectors = require "game.model.selectors"
local i18n      = require "game.core.i18n"

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
    local key = ({
        bidding = selectors.is_my_turn(s) and "turn.mine" or "turn.opponent",
        dualing = "turn.duel",
        shaking = "turn.shake",
    })[s.turn.kind]
    gui.set_text(gui.get_node("label"), i18n.t(key))   -- 문자열은 항상 locale key 경유
end
```

