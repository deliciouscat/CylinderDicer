# 개요
Vue bridge payload와 Defold store action 사이 adapter. 외부 message shape가 모델 내부 shape로 새지 않게 막는다.

# 의존성
- `main/game_bridge.lua`: inbound/outbound message.
- `shared/protocol/game-bridge.ts`: message contract.
- `game/model/actions.lua`: action 생성.
- `game/core/cosmetics.lua`: cosmetics 정규화.
- `game/model/selectors.lua`: result payload 생성용 상태 조회.

# I/O
- 입력:
  - `START_MATCH` payload.
  - `SET_COSMETICS` payload.
  - final state.
- 출력:
  - `match.init` action.
  - `cosmetics.apply` action.
  - `MATCH_READY` payload.
  - `SUBMIT_MATCH_RESULT` payload: `{ matchId, winnerId, turnCount, eventsHash }`.

# 의사코드
```lua
-- Pattern: Adapter / Anti-Corruption Layer.
-- 외부(Vue) message shape가 내부 store shape로 새지 않도록 번역만 담당한다.
local actions   = require "game.model.actions"
local selectors = require "game.model.selectors"

local M = {}
M.__index = M

function M.new(bridge, store, cosmetics)
    return setmetatable({ bridge = bridge, store = store, cosmetics = cosmetics }, M)
end

-- Pattern: message type -> handler 매핑 (Strategy table). if/elseif 사슬 제거.
local HANDLERS = {
    START_MATCH = function(self, payload)
        local cos = self.cosmetics.apply(payload.cosmetics)        -- 외부 skin id 정규화
        self.store:dispatch(actions.match_init(to_internal(payload, cos)))
        self.bridge.emit("MATCH_READY", { matchId = payload.matchId, mode = payload.mode })
    end,
    SET_COSMETICS = function(self, payload)
        self.store:dispatch(actions.cosmetics_apply(self.cosmetics.apply(payload)))
        self.bridge.emit("COSMETICS_APPLIED", { cosmetics = payload })
    end,
    PING = function(self) self.bridge.emit("PONG") end,
}

function M:on_bridge_message(message)
    local handler = HANDLERS[message.type]
    if handler then
        handler(self, message.payload or message)
    else
        self.bridge.emit("UNKNOWN_MESSAGE", { type = message.type })
    end
end

-- 내부 -> 외부 변환은 selector를 통해서만. director가 호출.
function M:submit_result()
    local state = self.store:get_state()
    self.bridge.emit("SUBMIT_MATCH_RESULT", selectors.match_result_payload(state))
end

return M
```

