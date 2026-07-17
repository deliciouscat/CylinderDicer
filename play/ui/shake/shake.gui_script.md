# 개요
shake 입력을 보이지 않는 로컬 0–100 gauge로 집계하고, 100에 도달했을 때 `shake.complete`를 한 번만 제출한다. 컵 배치와 주사위 확인 화면은 표시하지만 gauge 숫자나 bar는 표시하지 않는다.

# 의존성
- `game/model/store.lua`: dispatch/subscribe.
- `ui/shake/shake_gauge.lua`: impulse/decay/bounds 순수 계산.
- `game/model/actions.lua`: local simulator용 `shake.complete`.
- `game/model/selectors.lua`: local dice 조회.
- `game/core/gestures.lua`: drag/space 정규화.
- `game/core/audio.lua`: shake sound.
- `shake.gui`

# I/O
- 입력:
  - gesture: drag, shake key.
  - `turn`, `players` topics.
- 출력:
  - local gauge update.
  - 완료 시 `shake.complete` command/action 1회.
  - cup shake/lift animation.
  - dice/result GUI update. 컵 앞 테이블 주사위는 face별 `a1`–`a5` cosmetic angle, 하단 리스트는 정면 `a0`를 사용한다.

# 의사코드
```lua
-- Pattern: View = Observer + local gesture Aggregator.
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
        gauge = shake_gauge.add(gauge)
        if shake_gauge.complete(gauge) then submit_once("shake.complete") end
    end
end

function render(self, s)
    layout_cups(table_seat_layout.build(...))
    -- gauge is intentionally not rendered
    render_phase(s.flow.phase)
end
```
