# 개요
cylinder 상태 표시와 slot 장전 입력 처리. target anchor가 바뀌면 tween으로 이동한다.

# 의존성
- `game/model/store.lua`: `players`, `turn`, `pending_load` 관련 topic.
- `game/model/actions.lua`: `bullet.load`.
- `game/model/selectors.lua`: local cylinder 상태.
- `game/core/anchors.lua`: `hud`, `focal`, `offscreen` 좌표.
- `game/core/tween.lua`: 이동.
- `game/core/audio.lua`: load/click sound.
- `game/core/cosmetics.lua`: revolver skin.

# I/O
- 입력:
  - store topics.
  - director target anchor message.
  - slot tap.
- 출력:
  - cylinder position.
  - slot loaded visuals.
  - `bullet.load` action.

# 의사코드
```lua
-- Pattern: Singleton overlay. 생성/삭제/reparent 없이 단일 인스턴스로 영구 존재.
-- 데이터(state)와 위치(anchor)를 분리: anchor 사이를 tween 이동만 한다.
local store_mod = require "game.model.store"
local selectors = require "game.model.selectors"
local actions   = require "game.model.actions"
local anchors   = require "game.core.anchors"
local tween     = require "game.core.tween"
local audio     = require "game.core.audio"

function init(self)
    self.store  = store_mod.get()
    self.target = "offscreen"
    msg.post(".", "acquire_input_focus")
    self.subs = {
        self.store:subscribe("players", function(s) self:render(s) end),
        self.store:subscribe("ui",      function(s) self:render(s) end),
    }
    self:render(self.store:get_state())
end

function on_message(self, message_id, message)
    if message_id == hash("set_target") then        -- director Command
        self.target = message.anchor
        tween.to(".", "position", anchors.resolve(self.target), 0.4, go.EASING_INOUTQUAD)
    end
end

function render(self, s)
    local me = selectors.local_player(s)
    render_slots(me.cylinder, cosmetics_revolver(s))                 -- loaded/empty 시각화
    self.can_load = s.pending_load ~= nil and selectors.is_my_turn(s)
    enable_empty_slot_buttons(me.cylinder, self.can_load)            -- 빈 칸 + 장전 대기일 때만
end

function on_input(self, action_id, action)
    if not (action.pressed and self.can_load) then return end
    local i = hit_empty_slot(action)
    if i then
        audio.play_sfx("load"); self.store:dispatch(actions.bullet_load(i))  -- 장전 후 pending 해제
    end
end
```

