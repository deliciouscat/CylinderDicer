# 개요
결투 연출 단계 생성 모듈. revealDice, panToTable, judge, execute 순서를 데이터로 만든다.

# 의존성
- `game/model/rules/duel.lua`: resolution steps.
- `game/core/tween.lua`: timing descriptor.
- `game/core/audio.lua`: sound cue names.
- `duel.gui_script`: sequence 실행.
- `game/director.script`: background pan과 sequence 시작 연결.

# I/O
- 입력:
  - duel state.
  - judge/resolution data.
- 출력:
  - sequence steps: `{ name, duration, payload, sound? }[]`.
  - completion marker.

# 의사코드
```lua
-- Pattern: Builder. judge/resolution 데이터를 선언적 step 목록(Command sequence)으로 만든다.
-- 순수 모듈: 화면을 직접 그리지 않고 '무엇을 어떤 순서로'만 기술한다.
local M = {}

local T = { reveal = 0.6, pan = 0.6, judge = 0.8, shot = 0.5 }

function M.build(duel, judge, resolution)
    local steps = {}
    steps[#steps + 1] = { name = "reveal_dice", duration = T.reveal, payload = { groups = duel.players } }
    steps[#steps + 1] = { name = "pan_to_table", duration = T.pan }
    steps[#steps + 1] = { name = "judge", duration = T.judge, payload = judge, sound = "shot" }

    for _, shot in ipairs(resolution.steps or {}) do
        steps[#steps + 1] = {
            name = "shot", duration = T.shot, payload = shot,
            sound = shot.hit and "hit" or "miss",
            needs_choice = shot.needs_choice,         -- PerfectDuel 지목/응사 대기
        }
    end

    steps[#steps + 1] = { name = "complete" }          -- completion marker
    return steps
end

return M
```

