# 개요
턴 상태 전이 규칙. `setup -> shaking -> bidding* -> dualing -> shaking` 흐름을 한 곳에 고정한다.

# 의존성
- `game/model/reducers.lua`: action 처리 중 전이 요청.
- `game/model/rules/cylinder.lua`: 장전 타이밍.
- `game/model/rules/duel.lua`: duel 종료 후 라운드/매치 판정.

# I/O
- 입력:
  - current turn state.
  - action/event: setup complete, shake complete, bid raised, challenge, duel complete.
  - alive player order.
- 출력:
  - next turn state.
  - side effect descriptors: pending load source, round advance, match complete.

# 의사코드
```lua
-- Pattern: Finite State Machine (transition table).
-- 턴 전이는 오직 이 표에서만 정의된다. reducer는 결과를 적용만 한다.
local M = {}

local TRANSITIONS = {
    setup   = { setup_complete = "shaking" },
    shaking = { shake_complete  = "bidding" },
    bidding = { bid_raised = "bidding", challenge = "dualing" },
    dualing = { duel_complete = "shaking" },
}

-- 전이에 수반되는 side-effect descriptor (장전 타이밍 등). 실제 적용은 reducer가.
local function effects_for(from, event, ctx)
    if event == "shake_complete" and not ctx.turn.is_first_shake then
        return { pending_load = { source = "shake", count = 1 } }   -- 최초 제외 매 shaking 1발
    end
    if event == "bid_raised" then
        return { pending_load = { source = "bid", count = 1, player = ctx.turn.active_player_id } }
    end
    return {}   -- challenge 등은 장전 없음
end

function M.next(turn, event, ctx)
    local to = (TRANSITIONS[turn.kind] or {})[event]
    if not to then
        return { kind = turn.kind, effects = {} }   -- 정의되지 않은 전이는 무시
    end
    return {
        kind             = to,
        active_player_id = rotate_active(turn, event, ctx),  -- bid_raised면 다음 플레이어로
        previous_player_id = turn.active_player_id,
        effects          = effects_for(turn.kind, event, ctx),
    }
end

return M
```

