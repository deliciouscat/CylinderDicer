# 개요
players/turn topic을 구독해 캐러셀 노드를 갱신한다.

# 의존성
- `game/model/store.lua`: `players`, `turn` topics.
- `game/model/selectors.lua`: active/local flags.
- `game/core/cosmetics.lua`: portrait asset.
- `player_carousel.gui`

# I/O
- 입력:
  - players state.
  - active player id.
- 출력:
  - slot create/update/hide.
  - active highlight.
  - status badges.

# 의사코드
```lua
-- Pattern: View = Observer + Node pool(슬롯 재사용). display only.
local store_mod = require("game.model.store")
local selectors = require("game.model.selectors")
local cosmetics = require("game.core.cosmetics")

function init(self)
    self.store = store_mod.get()
    self.subs = {
        self.store:subscribe("players", function(s) self:render(s) end),
        self.store:subscribe("turn",    function(s) self:render(s) end),
    }
    self:render(self.store:get_state())
end

function render(self, s)
    for i, pid in ipairs(s.players.order) do
        local slot = self:slot(i)                       -- 풀에서 재사용(없으면 clone_tree)
        local p    = s.players.by_id[pid]
        set_portrait(slot, cosmetics.resolve("characters", p.skin, p.portrait_state))
        set_dimmed(slot, pid ~= s.turn.active_player_id)  -- 비활성 플레이어 디밍
        set_badges(slot, p.hp, p.bullets)                 -- badge 템플릿 재사용
    end
    self:hide_unused(#s.players.order)
end
```

