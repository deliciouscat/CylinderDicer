# 개요
결투 판정과 데미지 resolution 규칙. SHORT/OVER/EXACT, 일반 결투, PerfectDuel state를 만든다.

# 의존성
- `game/model/rules/dice.lua`: face count.
- `game/model/rules/cylinder.lua`: trigger result.
- `game/model/reducers.lua`: `bid.challenge`, duel choice, duel complete 처리.
- `ui/duel`: sequence 표시.

# I/O
- 입력:
  - bid: `{ player_id, count, face }`.
  - challenger id.
  - previous bidder id.
  - players state.
  - duel choices.
- 출력:
  - judge: `{ verdict = "SHORT" | "OVER" | "EXACT", actual, delta }`.
  - resolution steps.
  - hp changes.
  - next round/match status.

# 의사코드
```lua
-- Pattern: 판정(순수) + Table-driven policy.
-- README의 A/B 데미지 매트릭스를 if 사슬 대신 표로 고정한다.
local dice     = require("game.model.rules.dice")
local cylinder = require("game.model.rules.cylinder")

local M = {}
M.VERDICT = { SHORT = "SHORT", OVER = "OVER", EXACT = "EXACT" }

function M.judge(bid, players)
    local actual = dice.count_face(players, bid.face)
    local delta  = actual - bid.count
    local verdict = (delta < 0 and M.VERDICT.SHORT)
                 or (delta > 0 and M.VERDICT.OVER)
                 or M.VERDICT.EXACT
    return { verdict = verdict, actual = actual, delta = math.abs(delta) }
end

-- challenge 진입 시 duel state 생성 (판정 전 단계).
function M.begin(state, challenger_id, previous_id) --[[ return duel snapshot ]] end

-- EXACT일 때 A(이전 턴=맞춘 사람)/B(나머지) 선택 조합 -> 결과. (README 데미지 표)
-- A축은 3상태: hit(방아쇠+탄있음) / empty(방아쇠+탄없음) / dodge(회피).
-- A가 방아쇠를 당기는 경우 hit/empty는 cylinder.trigger 결과로 갈린다.
local PERFECT_MATRIX = {
    hit   = { take = "b_damage", return_fire = "b_damage_then_b_waste" },  -- A탄O: B걍맞기→B뎀 / B응사→B뎀+(B탄있으면 낭비)
    empty = { take = "none",     return_fire = "a_damage_if_b_loaded" },   -- A탄X: B걍맞기→무 / B응사→B탄있으면 A가 1뎀
    dodge = { take = "none",     return_fire = "b_waste_if_b_loaded" },    -- A회피: B걍맞기→무 / B응사→B탄있으면 낭비
}

local function a_state(choice, a_cylinder)
    if choice.a == "dodge" then return "dodge" end
    local _, shots = cylinder.trigger(a_cylinder, 1)   -- A가 방아쇠를 당김(1발)
    return shots[1].hit and "hit" or "empty"
end

function M.resolve(duel, judge, choice)
    if judge.verdict ~= M.VERDICT.EXACT then
        -- SHORT/OVER: 차이 수만큼 challenger가 previous_bidder에게 격발.
        local _, shots = cylinder.trigger(duel.challenger.cylinder, judge.delta)
        return { kind = "duel_shots", shots = shots, hp_changes = damage_from(shots) }
    end
    -- EXACT: previous_bidder(A)가 나머지(B)를 순서대로 지목. A상태 x B선택 표로 결과 산출.
    local outcome = PERFECT_MATRIX[a_state(choice, duel.shooter.cylinder)][choice.b]  -- choice.b: take | return_fire
    return { kind = "perfect_duel", outcome = outcome, hp_changes = damage_from_outcome(outcome) }
end

return M
```

