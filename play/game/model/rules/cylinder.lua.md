# 개요
리볼버 실린더 장전/격발 규칙. pending load, slot 선택, trigger 결과를 계산한다.

# 의존성
- `game/model/reducers.lua`: `setup.load_initial`, `bullet.load`, duel shot 처리.
- `game/model/turn_machine.lua`: 장전 타이밍 결정.
- `ui/cylinder_overlay`: 빈 slot 활성화 표시.

# I/O
- 입력:
  - cylinder state: `{ slots, chamber_index }`.
  - load request: `{ slot_index }`.
  - trigger request: `{ count }`.
- 출력:
  - updated cylinder.
  - pending load update.
  - shot results: `{ hit = boolean, slot_index, consumed = boolean }[]`.

# 의사코드
```lua
-- Pattern: 순수 상태 변환 함수 모음 (immutable). UI/RNG/Defold 의존 없음.
local M = {}

local function clone(cyl) --[[ slots 복사 ]] end

-- 빈 칸에만 장전. 변경된 새 cylinder와 성공 여부 반환.
function M.load(cyl, slot_index)
    if cyl.slots[slot_index].loaded then return cyl, false end
    local next = clone(cyl)
    next.slots[slot_index].loaded = true
    return next, true
end

-- pending_load 1 감소(0이면 nil). reducer가 장전 후 호출.
function M.consume_pending(pending)
    if not pending then return nil end
    local left = pending.count - 1
    return left > 0 and { source = pending.source, count = left } or nil
end

-- 회전 위치(chamber_index)부터 count회 격발. hit/miss 시퀀스 반환(연출용 데이터).
function M.trigger(cyl, count)
    local next, results = clone(cyl), {}
    for i = 1, count do
        local slot = next.slots[next.chamber_index]
        results[#results + 1] = { hit = slot.loaded, slot_index = next.chamber_index, consumed = slot.loaded }
        slot.loaded = false
        next.chamber_index = wrap_next(next.chamber_index, #next.slots)
    end
    return next, results
end

return M
```

