# 개요
베팅 버튼 입력을 action으로 변환하고 버튼 활성 상태를 갱신한다.

# 의존성
- `game/model/store.lua`: dispatch/subscribe.
- `game/model/actions.lua`: `bid.select_face`, `bid.raise`, `bid.challenge`.
- `game/model/selectors.lua`: `is_my_turn`, `is_my_bid_valid`.
- `game/core/i18n.lua`: labels.
- `game/core/audio.lua`: click sound.
- `bid_controls.gui`

# I/O
- 입력:
  - button tap.
  - `bidding`, `turn` topics.
- 출력:
  - bid actions.
  - button enabled/disabled state.
  - selected face display (`f{face}_a0` dice image).

# 의사코드
```lua
-- Pattern: View = Observer(렌더) + Command(dispatch). 규칙 판정은 selector에 위임.
local store_mod = require("game.model.store")
local selectors = require("game.model.selectors")
local actions   = require("game.model.actions")
local audio     = require("game.core.audio")

function init(self)
    self.store = store_mod.get()
    msg.post(".", "acquire_input_focus")
    self.subs = {
        self.store:subscribe("bidding", function(s) self:render(s) end),
        self.store:subscribe("turn",    function(s) self:render(s) end),
    }
    self:render(self.store:get_state())
end

function render(self, s)
    local mine = (s.turn.kind == "bidding") and selectors.is_my_turn(s)
    set_visible(self, mine)                                    -- 내 턴에만 노출
    if not mine then return end
    set_enabled("pass",      selectors.is_my_bid_valid(s))     -- 직전 콜보다 높을 때만
    set_enabled("challenge", s.bidding.current_bid ~= nil)     -- 이전 bid 있을 때만
    set_face_display(s.bidding.my_bid.face)                    -- dice_face 템플릿(1=skull)
end

function on_input(self, action_id, action)
    if not action.pressed then return end
    local s = self.store:get_state()
    if tapped("pass") and selectors.is_my_bid_valid(s) then
        audio.play_sfx("click"); self.store:dispatch(actions.bid_raise(s.bidding.my_bid))
    elseif tapped("arrow_up") then
        self.store:dispatch(actions.bid_select_face(s.bidding.my_bid.face + 1))
    elseif tapped("arrow_down") then
        self.store:dispatch(actions.bid_select_face(s.bidding.my_bid.face - 1))
    elseif tapped("challenge") and s.bidding.current_bid then
        audio.play_sfx("click"); self.store:dispatch(actions.bid_challenge())
    end
end
```
