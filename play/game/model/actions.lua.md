# 개요
action type 상수와 action 생성자 모듈. View와 bridge가 reducer 내부 구현을 모르고 명령을 만들게 한다.

# 의존성
- `game/model/reducers.lua`: action 소비.
- `game/net/match_adapter.lua`: match/cosmetics action 생성.
- `ui/*`: user input action 생성.

# I/O
- 입력:
  - 생성자 인자: match payload, bid 값, slot index, duel choice 등.
- 출력:
  - action table: `{ type = string, payload = table, meta = table? }`.

# 의사코드
```lua
-- Pattern: Action Creator (Command factory).
-- View/adapter는 type 문자열이나 payload shape를 직접 만들지 않고 이 생성자만 호출한다.
local M = {}

M.types = {
    MATCH_INIT         = "match.init",
    COSMETICS_APPLY    = "cosmetics.apply",
    SETUP_LOAD_INITIAL = "setup.load_initial",
    SHAKE_COMPLETE     = "shake.complete",
    SHAKE_TIMEOUT      = "shake.timeout",
    DICE_CHECK         = "dice.check",
    DICE_CHECK_TIMEOUT = "dice.check.timeout",
    BIDDING_TIMEOUT     = "bidding.timeout",
    BIDDING_OPEN       = "bidding.open",
    BULLET_LOAD        = "bullet.load",
    BID_SELECT_COUNT   = "bid.select_count",
    BID_SELECT_FACE    = "bid.select_face",
    BID_RAISE          = "bid.raise",
    BID_CHALLENGE      = "bid.challenge",
    DUEL_RESOLVE_CHOICE= "duel.resolve_choice",
    ROUND_ADVANCE      = "round.advance",
    MATCH_COMPLETE     = "match.complete",
    SERVER_SNAPSHOT_APPLY = "server_snapshot.apply",
}

local function action(type_, payload) return { type = type_, payload = payload or {} } end

function M.match_init(payload)        return action(M.types.MATCH_INIT, payload) end
function M.cosmetics_apply(cos)       return action(M.types.COSMETICS_APPLY, { cosmetics = cos }) end
function M.shake_complete(player_id, rng) return action(M.types.SHAKE_COMPLETE, { player_id = player_id, rng = rng }) end
function M.shake_timeout(rng) return action(M.types.SHAKE_TIMEOUT, { rng = rng }) end
function M.dice_check_timeout() return action(M.types.DICE_CHECK_TIMEOUT) end
function M.bidding_timeout() return action(M.types.BIDDING_TIMEOUT) end
function M.dice_check(player_id)      return action(M.types.DICE_CHECK, { player_id = player_id }) end
function M.bidding_open()             return action(M.types.BIDDING_OPEN) end
function M.bullet_load(slot_index)    return action(M.types.BULLET_LOAD, { slot_index = slot_index }) end
function M.bid_select_count(count)    return action(M.types.BID_SELECT_COUNT, { count = count }) end
function M.bid_select_face(face)      return action(M.types.BID_SELECT_FACE, { face = face }) end
function M.bid_raise(bid)             return action(M.types.BID_RAISE, { bid = bid }) end
function M.bid_challenge()            return action(M.types.BID_CHALLENGE) end
function M.duel_resolve_choice(c)     return action(M.types.DUEL_RESOLVE_CHOICE, { choice = c }) end
function M.round_advance()            return action(M.types.ROUND_ADVANCE) end
function M.server_snapshot_apply(s)   return action(M.types.SERVER_SNAPSHOT_APPLY, s or {}) end

return M
```
