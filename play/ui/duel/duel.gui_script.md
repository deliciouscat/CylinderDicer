# 개요
duel topic을 구독하고 `duel_sequence.lua`를 실행해 결투 화면을 단계별로 갱신한다.

# 의존성
- `game/model/store.lua`: dispatch/subscribe.
- `game/model/actions.lua`: duel choice/advance action.
- `game/model/selectors.lua`: duel display summary.
- `game/core/i18n.lua`: verdict/result text.
- `game/core/audio.lua`: click/shot/hit/miss.
- `ui/duel/duel_sequence.lua`: sequence step 생성.
- `duel.gui`

# I/O
- 입력:
  - `duel` topic.
  - player choice tap.
  - sequence timer complete.
- 출력:
  - duel GUI updates.
  - duel choice/advance actions.
  - audio requests.

# 의사코드
```lua
-- Pattern: View = Observer + Sequencer(step 순차 실행). step 목록은 duel_sequence가 빌드.
local store_mod      = require("game.model.store")
local actions        = require("game.model.actions")
local i18n           = require("game.core.i18n")
local audio          = require("game.core.audio")
local duel_sequence  = require("ui.duel.duel_sequence")

function init(self)
    self.store = store_mod.get()
    gui.acquire_input_focus()
    self.sub = self.store:subscribe("duel", function(s) self:on_duel(s) end)
end

function on_duel(self, s)
    if s.duel and s.duel.phase == "ready" then
        self.steps = duel_sequence.build(s.duel, s.duel.judge, s.duel.resolution)  -- Builder
        self.i = 0
        self:advance()
    end
end

-- 한 step씩 실행하고 timer로 다음 step 진행 (Command sequence)
function advance(self)
    self.i = self.i + 1
    local step = self.steps[self.i]
    if not step or step.name == "complete" then
        self.store:dispatch(actions.round_advance()); return
    end
    apply_visual(step)                                  -- reveal/pan/judge/shot 화면 반영
    if step.sound then audio.play_sfx(step.sound) end
    if step.name == "judge" then
        gui.set_text(gui.get_node("verdict"), i18n.t("duel.verdict." .. step.payload.verdict))
    end
    if step.needs_choice then
        wait_for_choice(function(choice) self.store:dispatch(actions.duel_resolve_choice(choice)) end)
    else
        timer.delay(step.duration, false, function() self:advance() end)
    end
end
```

