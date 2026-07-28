# 개요
로컬 플레이어 상태를 HUD에 반영하고 `hud` anchor 위치를 anchors 모듈에 등록한다.

# 의존성
- `game/model/store.lua`: `players`, `turn`, `ui`, `bidding` topics.
- `game/model/selectors.lua`: local player, hint key, local turn.
- `game/core/i18n.lua`: hint text.
- `game/core/anchors.lua`: `hud` anchor 등록.
- `game/core/cosmetics.lua`: portrait/dice asset.
- `local_hud.gui`

# I/O
- 입력:
  - store topics.
  - layout position.
- 출력:
  - HUD visual update.
  - `anchors.register("hud", position)`.

# 의사코드
```lua
-- Pattern: View = Observer + anchor 등록자(위치 indicator). cylinder를 소유하지 않는다.
local store_mod = require("game.model.store")
local selectors = require("game.model.selectors")
local i18n      = require("game.core.i18n")
local cosmetics = require("game.core.cosmetics")
local anchors   = require("game.core.anchors")

function init(self)
    self.store = store_mod.get()
    -- "hud" anchor 위치만 제공. cylinder overlay가 이 좌표로 tween해 온다.
    anchors.register("hud", world_pos(gui.get_node("cylinder_anchor")), "gui")
    self.subs = {
        self.store:subscribe("players", function(s) self:render(s) end),
        self.store:subscribe("turn",    function(s) self:render(s) end),
        self.store:subscribe("ui",      function(s) self:render(s) end),
    }
    self:render(self.store:get_state())
end

function render(self, s)
    local me = selectors.local_player(s)
    set_portrait(cosmetics.resolve("characters", me.skin, "front"))
    -- 일반 입찰 조작 안내를 우선 표시하고, 내 Skull 선택 때만
    -- 수량 절반(내림) 판정 안내로 바꾼다.
    gui.set_text(gui.get_node("hint"), hint_text(s))
    render_dice_tray(me.dice)                       -- dice_face 템플릿(face 1 -> skull)
end
```
