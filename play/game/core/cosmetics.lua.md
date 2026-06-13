# 개요
스킨 id를 실제 asset 경로/atlas id로 해석하는 모듈. 잘못된 skin id가 와도 default asset으로 fallback한다.

# 의존성
- `game/net/match_adapter.lua`: `START_MATCH`, `SET_COSMETICS` payload 전달.
- `assets/images/dice/*`
- `assets/images/cup/*`
- `assets/images/revolver/*`
- `assets/images/rail/*`
- `assets/images/backgrounds/*`
- `ui/*`: asset lookup 사용.

# I/O
- 입력:
  - `apply(payload)`.
  - `resolve(kind, skin_id, name)`.
- 출력:
  - normalized cosmetics state.
  - asset descriptor: `{ path, atlas, animation, fallback }`.

# 의사코드
```lua
-- Pattern: Resolver + Null Object fallback. 잘못된 skin id가 와도 항상 default로 동작.
local M = {}
local DEFAULT = "default"
local state = { dice = DEFAULT, cup = DEFAULT, revolver = DEFAULT, rail = DEFAULT, background = DEFAULT }

-- 외부 payload를 내부 cosmetics state로 정규화(누락은 default).
function M.apply(payload)
    payload = payload or {}
    state.dice = payload.diceSkin or state.dice
    state.cup  = payload.cupSkin  or state.cup
    -- ...
    return shallow_copy(state)
end

-- (kind, skin_id, name) -> asset descriptor. 존재하지 않으면 default 경로로 fallback.
function M.resolve(kind, skin_id, name)
    local id   = skin_id or state[kind] or DEFAULT
    local path = ("/assets/images/%s/%s/%s.png"):format(kind, id, name)
    if not resource_exists(path) then
        id   = DEFAULT
        path = ("/assets/images/%s/%s/%s.png"):format(kind, DEFAULT, name)
    end
    return { path = path, atlas = atlas_for(kind, id), animation = name, fallback = (id == DEFAULT) }
end

return M
```

