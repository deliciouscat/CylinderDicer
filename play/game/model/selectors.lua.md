# 개요
state 파생 조회 모듈. View가 raw state 구조에 강하게 묶이지 않게 한다.

# 의존성
- `game/model/rules/bidding.lua`: bid validity.
- `game/model/rules/dice.lua`: face count.
- `game/model/rules/duel.lua`: duel summary.
- `ui/*`, `game/director.script`, `game/net/match_adapter.lua`.

# I/O
- 입력:
  - state.
  - optional player id, bid, face.
- 출력:
  - `is_my_turn`.
  - `local_player`.
  - `visible_rail_range`.
  - `is_my_bid_valid`.
  - `count_face`.
  - `hint_key`.
  - `match_result_payload`.

# 의사코드
```lua
-- Pattern: Derived-read 계층 (selector). View/adapter가 raw state shape에 묶이지 않게 한다.
-- 읽기 전용. state를 변형하지 않는다.
local bidding = require("game.model.rules.bidding")
local dice    = require("game.model.rules.dice")

local M = {}

function M.is_my_turn(s)
    return s.turn.active_player_id == s.match.local_player_id
end

function M.local_player(s)
    return s.players.by_id[s.match.local_player_id]
end

function M.visible_rail_range(s)
    local r = s.bidding.rail
    return r.window_start, r.window_start + r.window_size - 1
end

function M.is_my_bid_valid(s)
    return bidding.validate(s.bidding.current_bid, s.bidding.my_bid, LIMITS).ok   -- rule 재사용
end

function M.count_face(s)
    return s.bidding.my_bid.count, s.bidding.my_bid.face
end

function M.hint_key(s) return s.ui.hint_key end

-- 내부 state -> 외부 계약 payload. adapter가 이것만 보고 emit.
function M.match_result_payload(s)
    return {
        matchId    = s.match.match_id,
        winnerId   = last_alive_player(s),
        turnCount  = s.match.turn_count,
        eventsHash = s.match.events_hash,
    }
end

return M
```

