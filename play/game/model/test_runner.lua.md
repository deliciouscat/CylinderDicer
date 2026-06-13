# 개요
순수 Lua 모델 테스트 runner. Defold API 없이 rules/reducer 동작을 검증한다.

# 의존성
- `game/model/tests/*.lua`: 테스트 케이스.
- `game/model/rules/*`
- `game/model/reducers.lua`
- `game/model/actions.lua`

# I/O
- 입력:
  - test module list.
- 출력:
  - pass/fail count.
  - failed assertion message.
  - non-zero exit 또는 Defold console error.

# 의사코드
```lua
-- Pattern: 최소 test harness. Defold API 미사용 -> 순수 Lua로도 실행 가능.
local M = {}

function M.run(modules)
    local pass, fail = 0, 0
    local t = {                                   -- assertion helper를 주입(의존성 역전)
        eq = function(a, b, msg)
            if a == b then pass = pass + 1
            else fail = fail + 1; print("FAIL:", msg, "expected", b, "got", a) end
        end,
    }
    for _, m in ipairs(modules) do m.run(t) end   -- 각 테스트 모듈 실행
    print(("PASS %d / FAIL %d"):format(pass, fail))
    return fail == 0
end

return M
```

