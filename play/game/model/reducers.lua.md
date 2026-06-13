# 개요
action과 현재 state를 받아 다음 state를 만드는 순수 reducer 모듈. 게임 규칙 적용 위치.

# 의존성
- `game/model/actions.lua`: action type.
- `game/model/turn_machine.lua`: 턴 전이.
- `game/model/rules/bidding.lua`
- `game/model/rules/cylinder.lua`
- `game/model/rules/dice.lua`
- `game/model/rules/duel.lua`

# I/O
- 입력:
  - `reduce(state, action)`.
- 출력:
  - `next_state`.
  - optional error: invalid bid, invalid slot, invalid turn.
  - changed topics metadata.

# 의사코드
```lua
-- Pattern: Pure Reducer + action.type 별 Strategy table.
-- 규칙 계산은 rules/*, 턴 전이는 turn_machine에 위임한다. 여기서 직접 mutate 금지.
local actions      = require "game.model.actions"
local turn_machine = require "game.model.turn_machine"
local bidding      = require "game.model.rules.bidding"
local cylinder     = require "game.model.rules.cylinder"
local dice         = require "game.model.rules.dice"
local duel         = require "game.model.rules.duel"

local M = {}

local function clone(t) --[[ shallow/deep copy helper ]] end

local handlers = {}

handlers[actions.types.MATCH_INIT] = function(state, a)
    local next = clone(state)
    -- payload -> players/turn 초기화 (setup 턴부터 시작)
    return next, { "match", "players", "turn", "ui" }
end

handlers[actions.types.SHAKE_ROLL] = function(state, a)
    local next = clone(state)
    next.players.by_id[a.payload.player_id].dice = dice.roll(count, a.payload.rng)  -- rules에 위임
    local t = turn_machine.next(next.turn, "shake_complete", next)                  -- FSM
    next.turn = apply_turn(next, t)                                                 -- pending_load 등 effect
    return next, { "players", "turn" }
end

handlers[actions.types.BID_RAISE] = function(state, a)
    local check = bidding.validate(state.bidding.current_bid, a.payload.bid, LIMITS)
    if not check.ok then return state, nil, check.reason end        -- 거부: 원본 state 반환
    local next = clone(state)
    next.bidding.current_bid = a.payload.bid
    local t = turn_machine.next(next.turn, "bid_raised", next)      -- 넘긴 사람만 장전 effect
    next.turn = apply_turn(next, t)
    return next, { "bidding", "turn", "players" }
end

handlers[actions.types.BULLET_LOAD] = function(state, a)
    local next = clone(state)
    local me = next.players.by_id[next.match.local_player_id]
    me.cylinder = (cylinder.load(me.cylinder, a.payload.slot_index)) -- 빈 칸만
    next.pending_load = cylinder.consume_pending(next.pending_load)
    return next, { "players", "ui" }
end

handlers[actions.types.BID_CHALLENGE] = function(state, a)
    local next = clone(state)
    local t = turn_machine.next(next.turn, "challenge", next)        -- -> dualing, 장전 없음
    next.turn = apply_turn(next, t)
    next.duel = duel.begin(next, next.turn.active_player_id, next.turn.previous_player_id)
    return next, { "turn", "duel" }
end

-- ... 나머지 action도 같은 형태(handler가 next state + changed topics 반환) ...

function M.reduce(state, action)
    local handler = handlers[action.type]
    if not handler then return { state = state, changed_topics = {} } end  -- 모르는 action 무시
    local next, topics, err = handler(state, action)
    if err then return { state = state, changed_topics = {}, error = err } end
    return { state = next, changed_topics = topics or {} }
end

function M.initial_state() return clone(DEFAULT_STATE) end

return M
```

