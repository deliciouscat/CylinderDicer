# 개요
명명 anchor를 화면 좌표로 변환하는 모듈. cylinder overlay가 `hud`, `focal`, `offscreen` 사이를 안정적으로 이동하게 한다.

# 의존성
- `game/director.script`: target anchor 선택.
- `ui/local_hud`: `hud` anchor 등록.
- `ui/cylinder_overlay`: anchor 좌표 조회.
- Defold window/gui coordinate APIs.

# I/O
- 입력:
  - `register(name, position, space)`.
  - `resolve(name)`.
  - `set_viewport(width, height, scale)`.
- 출력:
  - normalized screen position.
  - anchor missing fallback position.

# 의사코드
```lua
-- Pattern: Registry / Service Locator. 좌표 변환의 단일 진입점.
-- view는 anchor '이름'만 요청하고 좌표 계산은 모른다(cylinder overlay 흔들림 방지).
local M = {}
local registry = {}     -- name -> { pos, space = "gui" | "world" }
local viewport = { w = 1280, h = 720, scale = 1 }
local FALLBACK = vmath.vector3(-9999, -9999, 0)   -- offscreen Null Object

function M.set_viewport(w, h, scale) viewport = { w = w, h = h, scale = scale } end

function M.register(name, position, space)
    registry[name] = { pos = position, space = space or "gui" }   -- local_hud가 "hud" 등록
end

function M.resolve(name)
    local a = registry[name]
    if not a then return FALLBACK end                              -- 미등록 anchor 안전 처리
    return to_screen(a.pos, a.space, viewport)                     -- gui<->world 변환 일원화
end

return M
```

