# 개요
shake 입력을 기존 `shake.roll` action으로 변환하고, 컵 배치와 주사위 확인 화면을 표시한다.

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
  - cup shake/lift animation.
  - dice/result GUI update.

# 의사코드
```lua
-- Pattern: View = Observer + gesture Adapter. space 또는 drag 거리 임계 -> shake.roll.
local store_mod = require("game.model.store")
local selectors = require("game.model.selectors")
local actions   = require("game.model.actions")
local gestures  = require("game.core.gestures")
local audio     = require("game.core.audio")

function init(self)
    self.store = store_mod.get()
    self.gest  = gestures.new(nil)
    msg.post(".", "acquire_input_focus")
    -- subscribe callback은 dirty flag만 설정하고 실제 gui.* 호출은 update에서 수행.
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
        audio.play_sfx("shake")
        self.store:dispatch(actions.shake_roll(self.store:get_state().match.local_player_id))
    end
end

function render(self, s)
    layout_cups(table_seat_layout.build(...))
    render_progress(selectors.shake_status(s, s.match.local_player_id))
    render_phase(s.flow.phase)
end
```
