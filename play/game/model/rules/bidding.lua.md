# 개요
베팅 유효성 규칙. 이전 bid보다 높은 bid인지 판단하고 rail/count/face 범위를 검증한다.

# 의존성
- `game/model/reducers.lua`: `bid.raise`, `bid.select_*` 처리.
- `game/model/selectors.lua`: pass button 활성화 판단.

# I/O
- 입력:
  - current bid: `{ count, face }?`
  - candidate bid: `{ count, face }`
  - limits: `{ min_count, max_count, min_face, max_face }`
- 출력:
  - `{ ok = true }`
  - `{ ok = false, reason = "too_low" | "count_range" | "face_range" }`

# 의사코드
```lua
-- Pattern: 순수 Policy 함수. 비교 규칙(상승 정의)을 한 곳에 고정해 교체를 쉽게 한다.
local M = {}

-- 사전식 상승 예시: (count, face) -> 단일 rank. 다른 비교를 원하면 이 함수만 바꾼다.
local function rank(bid) return bid.count * 10 + bid.face end

function M.validate(current, candidate, limits)
    if candidate.count < limits.min_count or candidate.count > limits.max_count then
        return { ok = false, reason = "count_range" }
    end
    if candidate.face < limits.min_face or candidate.face > limits.max_face then
        return { ok = false, reason = "face_range" }
    end
    if current and rank(candidate) <= rank(current) then
        return { ok = false, reason = "too_low" }   -- 직전 콜보다 높아야 함
    end
    return { ok = true }
end

return M
```

