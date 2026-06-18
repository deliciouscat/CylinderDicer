# 개요
모델 전체 흐름 테스트. setup, shaking, bidding, challenge, duel, round reset이 reducer로 이어지는지 확인한다.

# 의존성
- `game/model/test_runner.lua`
- `game/model/actions.lua`
- `game/model/reducers.lua`
- `game/model/selectors.lua`
- `game/model/rules/*`

# I/O
- 입력:
  - deterministic mock match state.
  - scripted action sequence.
- 출력:
  - assertions:
    - turn transition.
    - pending load.
    - bid validity.
    - duel verdict.
    - match result payload.

# 의사코드
```lua
-- Pattern: scripted action sequence를 reducer에 흘려보내며 불변식 검증 (no view, no Defold).
local actions  = require("game.model.actions")
local reducers = require("game.model.reducers")
local selectors= require("game.model.selectors")

local M = {}

local function apply(state, action) return reducers.reduce(state, action) end

function M.run(t)
    local s = reducers.initial_state()
    s = apply(s, actions.match_init(MOCK_2P)).state          -- 결정적 mock match

    -- first shake -> bidding, 추가 장전 없음
    s = apply(s, actions.shake_roll("p1", FIXED_RNG)).state
    t.eq(s.turn.kind, "bidding", "first shake -> bidding")
    t.eq(s.pending_load, nil, "first shake has no pending load")

    -- 낮은 bid 거부 (state 불변)
    local r = apply(s, actions.bid_raise({ count = 0, face = 2 }))
    t.eq(r.error, "count_range", "low bid rejected")

    -- 유효 raise -> 다음 플레이어 + 넘긴 사람 pending load
    s = apply(s, actions.bid_raise({ count = 2, face = 3 })).state
    t.eq(s.turn.active_player_id, "p2", "turn advanced")
    t.eq(s.pending_load.source, "bid", "raiser gets pending load")

    -- challenge -> dualing, 장전 없음
    s = apply(s, actions.bid_challenge()).state
    t.eq(s.turn.kind, "dualing", "challenge -> dualing")

    -- duel 판정 후 라운드/결과 payload 생성 가능
    t.eq(type(selectors.match_result_payload(s)), "table", "result payload buildable")
end

return M
```

