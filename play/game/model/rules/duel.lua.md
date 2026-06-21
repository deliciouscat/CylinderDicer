# 개요
결투 판정과 데미지 resolution 규칙. `begin`은 공개 스냅샷만 만들고, `resolve`가 ROUND_ADVANCE 시점에 russian roulette/PerfectDuel 결과를 한 번만 계산·적용한다.

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
  - duel choices. 현재 EXACT 선택형 UI는 미완이며, 기본 choice는 `actor_choice="trigger"`, `target_choice="take_hit"`로 생성한다.
- 출력:
  - judge: `{ verdict = "SHORT" | "OVER" | "EXACT", actual, delta }`.
  - `begin`: judge + 공개용 players snapshot.
  - `resolve`: resolution steps + hp changes + cylinder consume.
  - next round/match status.

# 의사코드
```lua
-- Pattern: 판정(순수) + resolution snapshot.
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

function M.begin(state, challenger_id, previous_id)
    -- challenge 진입 시 judge와 공개용 snapshot만 만든다.
    -- players snapshot에는 dice는 포함하지만 cylinder는 숨긴다.
end

function M.resolve(state, duel_state)
    if judge.verdict == M.VERDICT.SHORT then
        -- 실제 < 콜: 도전자 본인이 |actual-bid|회 russian roulette.
        -- target cylinder를 consume하고 hp_changes를 적용한다.
        return { kind = "duel_shots", roulette_subject_id = challenger_id, target_id = challenger_id, steps = steps }
    elseif judge.verdict == M.VERDICT.OVER then
        -- 실제 > 콜: 직전 콜러가 |actual-bid|회 russian roulette.
        -- previous bidder cylinder를 consume하고 hp_changes를 적용한다.
        return { kind = "duel_shots", roulette_subject_id = previous_id, target_id = previous_id, steps = steps }
    end

    -- EXACT: previous_bidder(A)가 맞춘 사람. challenger부터 alive order로 target을 돌려 6회 step 생성.
    -- 현재는 기본 선택만 구현: A trigger, B take_hit.
    -- 나중에 선택형 UI가 들어오면 duel_state.choice를 이 함수에서 읽어 결과에 반영한다.
    -- actor cylinder를 consume하고 hp_changes를 적용한다.
    return { kind = "perfect_duel", actor_id = previous_id, targets = targets, steps = six_steps, reload_player_id = previous_id }
end

return M
```
