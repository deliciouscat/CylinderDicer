# 개요
shake 입력을 `shake.roll` action으로 변환하고, 굴림 결과를 화면에 표시한다.

# 의존성
- `game/model/store.lua`: dispatch/subscribe.
- `game/model/actions.lua`: `shake.roll`.
- `game/model/selectors.lua`: local dice 조회.
- `game/core/gestures.lua`: drag/space 정규화.
- `game/core/audio.lua`: shake sound.
- `shake.gui`

# I/O
- 입력:
  - gesture: drag, shake key.
  - `turn`, `players` topics.
- 출력:
  - `shake.roll` action.
  - dice/result GUI update.
  - audio request.

# 의사코드
```lua
-- Pattern: View = Observer + gesture Adapter. drag/space -> shake.roll (1회).
local store_mod = require "game.model.store"
local selectors = require "game.model.selectors"
local actions   = require "game.model.actions"
local gestures  = require "game.core.gestures"
local audio     = require "game.core.audio"

function init(self)
    self.store = store_mod.get()
    self.gest  = gestures.new(nil)
    gui.acquire_input_focus()
    self.subs = {
        self.store:subscribe("turn",    function(s) self:on_turn(s) end),
        self.store:subscribe("players", function(s) self:render(s) end),
    }
    self:render(self.store:get_state())
end

function on_turn(self, s)
    self.armed = (s.turn.kind == "shaking")   -- shaking 턴에만 입력 활성
    self:render(s)
end

function on_input(self, action_id, action)
    if not self.armed then return end
    local e = self.gest:feed(action_id, action)
    if e and e.kind == "shake" then
        self.armed = false
        audio.play_sfx("shake")
        self.store:dispatch(actions.shake_roll(self.store:get_state().match.local_player_id, new_rng()))
    end
end

function render(self, s)
    show_hint(); render_reveal(selectors.local_player(s).dice)   -- 굴림 결과 표시
end
```

