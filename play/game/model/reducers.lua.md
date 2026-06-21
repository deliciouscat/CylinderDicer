# 개요
action과 현재 state를 받아 다음 state를 만드는 순수 reducer 모듈. `GAME_RULES.md`의 진행 규칙을 적용하는 위치다.

현재 reducer의 진행 상태 SSOT는 `flow.phase`다.
- `flow.phase`: 실제 진행 단계 (`revolver_reload`, `cup_shake`, `dice_check`, `bidding_gap`, `bidding`, `duel`, `complete`)
- `turn.kind`: 기존 GUI/테스트 호환용 coarse lane (`setup`, `shaking`, `bidding`, `dualing`, `complete`). phase 변경 시 함께 갱신한다.
- HUD/배경/anchor 같은 presentation 값은 `selectors.lua`에서 phase로부터 파생한다.

# 의존성
- `game/model/actions.lua`: action type.
- `game/model/turn_machine.lua`: phase 전이표 + alive order/next player utility. reducer는 action별 side effect를 만든 뒤 전이표를 호출한다.
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
-- 규칙 계산은 rules/*, phase 전이는 turn_machine.transition_phase를 사용한다.
-- reducer는 pending_load, dice roll, bid 기록, duel resolve 같은 action side effect만 조립한다.
local actions      = require("game.model.actions")
local turn_machine = require("game.model.turn_machine")
local bidding      = require("game.model.rules.bidding")
local cylinder     = require("game.model.rules.cylinder")
local dice         = require("game.model.rules.dice")
local duel         = require("game.model.rules.duel")

local M = {}

local function clone(t) --[[ shallow/deep copy helper ]] end

local handlers = {}

handlers[actions.types.MATCH_INIT] = function(state, a)
    local next = clone(state)
    -- payload -> players/turn 초기화
    -- requires_setup_load면 local player에게 setup 3발 pending.
    -- 아니면 cup_shake부터 시작.
    -- transition: waiting -> start_reload/start_shake
    return next, { "match", "players", "turn", "flow", "shake", "ui" }
end

handlers[actions.types.SHAKE_ROLL] = function(state, a)
    local next = clone(state)
    -- shake.roll은 주사위 즉시 굴림이 아니라 shake 입력 1회.
    next.shake.counts[a.payload.player_id] = (next.shake.counts[a.payload.player_id] or 0) + 1
    if next.shake.counts[a.payload.player_id] < 6 then return next, { "shake", "ui" } end
    -- 6회 완료 시 전원 dice roll.
    -- 최초 shake면 dice_check로, 이후 shake면 active player 1발 reload 후 dice_check로.
    -- transition: cup_shake -> shake_complete_first/shake_complete_reload/shake_complete_no_reload
    return next, { "players", "turn", "flow", "shake", "ui" }
end

handlers[actions.types.DICE_CHECK] = function(state, a)
    local next = clone(state)
    -- local player가 본인 dice 확인. 현재 mock/dev path에서는 non-local check를 이미 완료 처리한다.
    -- all checked면 bidding_gap으로 전환. GUI timer나 테스트가 bidding.open을 보낸다.
    -- transition: dice_check -> all_checked
    return next, { "turn", "flow", "shake", "ui" }
end

handlers[actions.types.BIDDING_OPEN] = function(state, a)
    local next = clone(state)
    -- 마지막 dice check 후 3초 gap이 끝났을 때 bidding으로 전환.
    -- transition: bidding_gap -> open_bidding
    return next, { "turn", "flow", "ui" }
end

handlers[actions.types.BID_RAISE] = function(state, a)
    local check = bidding.validate(state.bidding.current_bid, a.payload.bid, LIMITS)
    if not check.ok then return state, nil, check.reason end        -- 거부: 원본 state 반환
    local next = clone(state)
    next.bidding.current_bid = a.payload.bid
    -- 넘긴 사람은 1발 reload pending. pending 중에는 다음 bid/challenge를 막는다.
    -- 빈 슬롯이 없으면 reload는 생략하고 곧장 bidding 유지.
    -- transition: bidding -> bid_reload/bid_no_reload
    return next, { "match", "bidding", "turn", "flow", "ui" }
end

handlers[actions.types.BULLET_LOAD] = function(state, a)
    local next = clone(state)
    local pending_player = next.players.by_id[next.pending_load.player_id]
    pending_player.cylinder = (cylinder.load(pending_player.cylinder, a.payload.slot_index)) -- 빈 칸만
    next.pending_load = cylinder.consume_pending(next.pending_load)
    -- setup -> cup_shake
    -- shake reload -> dice_check
    -- bid reload -> bidding
    -- exact_duel reload -> cup_shake
    -- transition: revolver_reload -> reload_complete_*
    return next, { "players", "turn", "flow", "shake", "ui" }
end

handlers[actions.types.BID_CHALLENGE] = function(state, a)
    local next = clone(state)
    -- pending reload가 남아 있으면 challenge 불가.
    -- duel.begin은 judge와 공개용 player snapshot만 만든다. resolution은 아직 계산하지 않는다.
    next.duel = duel.begin(next, next.turn.active_player_id, next.turn.previous_player_id)
    -- transition: bidding -> challenge
    return next, { "match", "turn", "duel", "flow", "ui" }
end

handlers[actions.types.ROUND_ADVANCE] = function(state, a)
    local next = clone(state)
    local resolution = duel.resolve(next, next.duel) -- cylinder consume + hp changes를 여기서 한 번만 수행
    -- SHORT/OVER: 바로 cup_shake.
    -- EXACT: 맞춘 사람(previous_bidder)만 3발 reload 후 cup_shake.
    -- 생존자가 1명 이하이면 complete.
    -- transition: duel -> match_complete/exact_reload/round_shake
    return next, { "match", "players", "turn", "bidding", "duel", "flow", "shake", "ui" }
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
