# 개요
phase 상태 전이표와 alive player 순회 유틸. `flow.phase`의 유효 전이는 이 모듈이 소유하고, reducer는 action별 side effect를 만든 뒤 `transition_phase`/`enter_phase`를 호출한다.

# 의존성
- `game/model/reducers.lua`: action 처리 중 phase 전이와 next alive lookup에 사용.
- `game/model/rules/cylinder.lua`: 장전 타이밍.
- `game/model/rules/duel.lua`: duel 종료 후 라운드/매치 판정.

# I/O
- 입력:
  - current state.
  - phase event: `start_reload`, `shake_complete_first`, `reload_complete_bid`, `challenge`, `exact_reload` 등.
  - alive player order.
- 출력:
  - next `flow.phase`.
  - 호환용 `turn.kind`.
  - alive order/next alive id.

# 의사코드
```lua
-- Pattern: Table-driven phase FSM + alive order utility.
local M = {}

local PHASE_TRANSITIONS = {
    waiting = {
        start_reload = "revolver_reload",
        start_shake = "cup_shake",
        preview_bidding = "bidding",
    },
    revolver_reload = {
        reload_complete_setup = "cup_shake",
        reload_complete_shake = "dice_check",
        reload_complete_bid = "bidding",
        reload_complete_exact_duel = "cup_shake",
    },
    cup_shake = {
        shake_complete_first = "dice_check",
        shake_complete_reload = "revolver_reload",
        shake_complete_no_reload = "dice_check",
    },
    dice_check = { all_checked = "bidding_gap" },
    bidding_gap = { open_bidding = "bidding" },
    bidding = {
        bid_reload = "revolver_reload",
        bid_no_reload = "bidding",
        challenge = "duel",
    },
    duel = {
        match_complete = "complete",
        round_shake = "cup_shake",
        exact_reload = "revolver_reload",
    },
    complete = {},
}

function M.transition_phase(state, event, options)
    local from = M.phase(state)
    local to = (PHASE_TRANSITIONS[from] or {})[event]
    if not to then
        return { ok = false, reason = "invalid_phase_transition", from = from, event = event }
    end
    M.enter_phase(state, to, options)
    return { ok = true, from = from, to = to, event = event }
end

function M.enter_phase(state, phase, options) --[[ set flow.phase + compatible turn.kind ]] end
function M.alive_order(players) --[[ return alive ids in table order ]] end
function M.next_alive_after(players, player_id) --[[ wrap around alive order ]] end

return M
```
