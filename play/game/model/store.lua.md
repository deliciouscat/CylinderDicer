# 개요
단일 상태 저장소. `dispatch`로 reducer를 실행하고 변경 topic을 event_bus에 publish한다.

# 의존성
- `game/model/reducers.lua`: next state 계산.
- `game/core/event_bus.lua`: 변경 알림.
- `game/model/selectors.lua`: 외부 read helper와 함께 사용.
- `game/director.script`, `ui/*`: dispatch/subscribe 사용.

# I/O
- 입력:
  - `create(initial_state, reducer, bus)`.
  - `dispatch(action)`.
  - `get_state()`.
  - `subscribe(topic, handler)`.
- 출력:
  - next state.
  - changed topic notifications.
  - dispatch result: `{ ok, error?, state }`.

# 의사코드
```lua
-- Pattern: Single Source of Truth + 단방향 dispatch (Flux/Redux-lite).
-- store는 규칙을 모른다. reduce에 위임하고 결과를 bus로 publish할 뿐이다.
local Store = {}
Store.__index = Store

local _instance   -- module singleton (shared_state=1). director/view가 동일 인스턴스를 본다.

function Store.create(initial_state, reduce, bus)
    _instance = setmetatable({ state = initial_state, reduce = reduce, bus = bus }, Store)
    return _instance
end

function Store.get() return _instance end

function Store:get_state() return self.state end

function Store:dispatch(action)
    -- reduce는 순수 함수: 입력 state를 mutate하지 않고 next state를 돌려준다.
    local result = self.reduce(self.state, action)   -- { state, changed_topics, error? }
    if result.error then
        return { ok = false, error = result.error, state = self.state }  -- 거부: 상태 불변
    end
    self.state = result.state
    -- Pattern: Observer. 바뀐 topic만 통지해 불필요한 렌더를 막는다.
    for _, topic in ipairs(result.changed_topics) do
        self.bus:publish(topic, self.state)
    end
    return { ok = true, state = self.state }
end

-- View 구독은 bus로 위임 (store가 유일한 진입점 역할).
function Store:subscribe(topic, handler) return self.bus:subscribe(topic, handler) end
function Store:unsubscribe(token)        return self.bus:unsubscribe(token) end

return Store
```

