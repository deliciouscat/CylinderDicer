# 개요
topic 기반 pub/sub 모듈. store 변경을 director와 view에 전달한다.

# 의존성
- `game/model/store.lua`: dispatch 이후 변경 topic publish.
- `game/director.script`, `ui/*`: topic subscribe.

# I/O
- 입력:
  - `subscribe(topic, handler)`.
  - `unsubscribe(token)`.
  - `publish(topic, payload)`.
- 출력:
  - 구독 handler 호출.
  - unsubscribe token.

# 의사코드
```lua
-- Pattern: Observer (topic 기반 pub/sub). store와 view를 느슨하게 결합한다.
local M = {}
local Bus = {}
Bus.__index = Bus

function M.new()
    return setmetatable({ topics = {}, seq = 0 }, Bus)   -- topics[topic] = { token -> handler }
end

function Bus:subscribe(topic, handler)
    self.topics[topic] = self.topics[topic] or {}
    self.seq = self.seq + 1
    local token = { topic = topic, id = self.seq }
    self.topics[topic][self.seq] = handler
    return token                                          -- unsubscribe용 핸들
end

function Bus:unsubscribe(token)
    local subs = token and self.topics[token.topic]
    if subs then subs[token.id] = nil end
end

function Bus:publish(topic, payload)
    for _, handler in pairs(self.topics[topic] or {}) do
        handler(payload)                                  -- 구독자 호출 (state 스냅샷 전달)
    end
end

return M
```

