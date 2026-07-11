# 개요
주사위 굴림과 face 집계 규칙. face `1`은 해골로 취급한다. 비-해골 콜 판정에서는 해골을 와일드로 포함하고, 해골 콜에서는 해골만 센다.

# 의존성
- `game/model/reducers.lua`: `shake.roll`.
- `game/model/selectors.lua`: `count_face`.
- `game/model/rules/duel.lua`: bid face 실제 개수 계산.
- `ui/common/dice_face`: face 표시 규칙.

# I/O
- 입력:
  - player dice count.
  - rng seed/source.
  - players dice list.
  - target face.
- 출력:
  - dice values: `{ 1..6 }`.
  - count result.
  - display face kind: `skull | pip`.

# 의사코드
```lua
-- Pattern: 순수 함수 + 집계 정책 캡슐화. face 1=skull 의미는 여기서만 정의한다.
local M = {}

M.SKULL_FACE = 1

-- rng는 주입받는다(테스트 결정성 확보). 굴림 결과 dice 배열 반환.
function M.roll(count, rng)
    local values = {}
    for i = 1, count do values[i] = rng:int(1, 6) end
    return values
end

-- 모든 플레이어 dice에서 target face 총 개수. (집계 규칙을 한 곳에 고정)
function M.count_face(players, face)
    local total = 0
    for _, p in pairs(players.by_id) do
        for _, v in ipairs(p.dice or {}) do
            if v == face then total = total + 1 end
        end
    end
    return total
end

-- 표시 종류 결정. dice_face 템플릿이 이 값으로 skull/pip을 토글.
function M.display_kind(face)
    return face == M.SKULL_FACE and "skull" or "pip"
end

return M
```
