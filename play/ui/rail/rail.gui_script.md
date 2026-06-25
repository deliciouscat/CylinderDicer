# 개요
레일 drag/scroll/key 입력을 count 선택 action으로 변환하고 rail GUI를 갱신한다.

# 의존성
- `game/model/store.lua`: dispatch/subscribe.
- `game/model/actions.lua`: `bid.select_count`.
- `game/model/selectors.lua`: visible rail range.
- `game/core/gestures.lua`: drag/scroll/key 정규화.
- `game/core/i18n.lua`: marker text 필요 시.
- `rail.gui`

# I/O
- 입력:
  - pointer drag.
  - scroll.
  - left/right key.
  - `bidding` topic.
- 출력:
  - `bid.select_count` action.
  - rail window/cell update.

# 의사코드
```lua
-- Pattern: View = Observer + gesture Adapter. drag/scroll/key -> bid.select_count.
local store_mod = require("game.model.store")
local selectors = require("game.model.selectors")
local actions   = require("game.model.actions")
local gestures  = require("game.core.gestures")

function init(self)
    self.store = store_mod.get()
    self.gest  = gestures.new(node_bounds("track"))
    msg.post(".", "acquire_input_focus")
    self.sub = self.store:subscribe("bidding", function(s) self:render(s) end)
    self:render(self.store:get_state())
end

function render(self, s)
    local lo, hi = selectors.visible_rail_range(s)
    for n = lo, hi do
        set_cell(n, { selected = (n == s.bidding.my_bid.count), skull = is_skull(n, s) })  -- window만 렌더
    end
    place_recent_markers(s.bidding.recent_bids)   -- badge + dice_face
    place_pointer(s.bidding.my_bid.count)
end

function on_input(self, action_id, action)
    local e = self.gest:feed(action_id, action)   -- 정규화된 의미 이벤트
    if not e then return end
    local cur = self.store:get_state().bidding.my_bid.count
    if e.kind == "drag" or e.kind == "scroll" then
        self.store:dispatch(actions.bid_select_count(count_from_delta(cur, e)))
    elseif e.kind == "key_left" then
        self.store:dispatch(actions.bid_select_count(cur - 1))
    elseif e.kind == "key_right" then
        self.store:dispatch(actions.bid_select_count(cur + 1))
    end
end
```
