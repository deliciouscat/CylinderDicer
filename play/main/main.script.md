# 개요
엔트리 포인트이자 Composition Root. Defold가 부팅하면 가장 먼저 실행되어 인프라 singleton(event_bus, store, i18n, cosmetics)을 한 번 생성·주입하고, 외부 경계(game_bridge)를 설치한 뒤 Controller(director)를 깨운다. 매 프레임 bridge 큐를 펌프해 외부 메시지를 adapter로 위임한다. 게임 규칙은 직접 다루지 않는다.

# 의존성
- `main/game_bridge.lua`: Vue ↔ Defold 메시지 transport 설치/펌프.
- `game/net/match_adapter.lua`: bridge 메시지를 action으로 번역.
- `game/model/store.lua`, `game/model/reducers.lua`: 상태 저장소 생성.
- `game/core/event_bus.lua`: 변경 알림 버스 생성.
- `game/core/i18n.lua`, `game/core/cosmetics.lua`: 로케일/스킨 초기화.
- `game/director.script`: Controller 부팅 신호 수신자.

# I/O
- 입력:
  - Defold lifecycle: `init`, `update(dt)`, `on_input`.
  - bridge inbound 메시지 큐.
- 출력:
  - infra singleton 구성(주입).
  - `DEFOLD_READY` emit.
  - director boot 메시지.

# 의사코드
```lua
-- Pattern: Composition Root. 의존성은 여기서 단 한 번 생성하고 주입한다.
-- game.project 의 shared_state=1 이라 module-level singleton이 모든 스크립트에서 공유된다.
local bridge        = require "main.game_bridge"
local event_bus     = require "game.core.event_bus"
local store_mod     = require "game.model.store"
local reducers      = require "game.model.reducers"
local i18n          = require "game.core.i18n"
local cosmetics     = require "game.core.cosmetics"
local match_adapter = require "game.net.match_adapter"

function init(self)
    msg.post(".", "acquire_input_focus")

    -- 1) 인프라 구성 (Dependency Injection)
    local bus   = event_bus.new()
    local store = store_mod.create(reducers.initial_state(), reducers.reduce, bus)
    i18n.set_locale("ko")

    -- 2) 외부 경계 설치 (Bridge + Adapter / Anti-Corruption Layer)
    bridge.install()
    self.adapter = match_adapter.new(bridge, store, cosmetics)

    -- 3) Controller 기동. store/bus는 singleton이라 director가 require로 같은 인스턴스를 참조.
    msg.post("/director#director", "boot")

    bridge.emit("DEFOLD_READY", { state = "idle" })
end

function update(self, dt)
    -- Pattern: 외부 메시지 펌프. bridge 큐 -> adapter -> store.dispatch
    -- main은 메시지 의미를 해석하지 않고 adapter에 위임만 한다.
    while true do
        local message = bridge.poll()
        if not message then break end
        self.adapter:on_bridge_message(message)
    end
end

function on_input(self, action_id, action)
    -- 게임 입력은 focus를 잡은 각 GUI 컴포넌트가 직접 처리한다(View 책임).
    -- 여기서는 전역 단축키 등 최소한의 라우팅만 둔다.
end
```
