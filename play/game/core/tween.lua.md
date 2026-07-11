# 개요
반복 easing 계산 모듈. world object 이동, cylinder anchor 이동, UI 등장/퇴장에 공통 사용한다.

# 의존성
- `game/director.script`
- `ui/cylinder_overlay/cylinder_overlay.script`
- Defold `go.animate` 또는 직접 interpolation.

# I/O
- 입력:
  - `to(target, property, value, duration, easing, on_complete)`.
  - `lerp(from, to, t)`.
  - `ease(name, t)`.
- 출력:
  - animation request.
  - interpolated value.
  - completion callback.

# 의사코드
```lua
-- Pattern: Facade over go.animate (+ 순수 lerp/ease helper).
-- director/cylinder 등 world object 이동 API를 통일한다.
local M = {}

function M.to(target, property, value, duration, easing, on_complete)
    go.animate(target, property, go.PLAYBACK_ONCE_FORWARD, value,
               easing or go.EASING_INOUTQUAD, duration, 0, on_complete)
end

function M.lerp(from, to, t) return from + (to - from) * t end

function M.ease(name, t) return EASINGS[name](t) end   -- 직접 보간이 필요한 경우용

return M
```
