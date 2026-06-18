# 개요
게임 화면 오케스트레이터. store 상태를 구독하고 `turn.kind`에 맞춰 `shaking`, `bidding`, `dualing` 화면 블럭을 전환한다. 배경 패닝, cylinder anchor 이동, 결투 시퀀스 시작, 매치 종료 emit을 조율한다.

# 의존성
- `game/model/store.lua`: 상태 구독, action dispatch.
- `game/model/selectors.lua`: 화면용 파생 상태 조회.
- `game/model/turn_machine.lua`: 턴 전이 결과 해석.
- `game/core/event_bus.lua`: 상태 변경 topic 수신.
- `game/core/anchors.lua`: cylinder 목표 anchor 계산.
- `game/core/tween.lua`: 화면/anchor 이동 요청.
- `game/core/audio.lua`: 턴/결투 사운드 요청.
- `game/net/match_adapter.lua`: 종료 결과 payload 생성.
- `main/game_bridge.lua`: `SUBMIT_MATCH_RESULT` emit.
- `background/background.script`: 배경 위치 변경.
- `ui/*`: 활성 UI block과 overlay 제어.

# I/O
- 입력:
  - store topics: `match`, `turn`, `bidding`, `duel`, `players`, `ui`.
  - messages: UI 컴포넌트 준비/완료 신호, duel sequence 완료 신호.
- 출력:
  - UI block 활성/비활성 메시지.
  - background pan 명령.
  - cylinder target anchor 명령.
  - duel sequence 시작 명령.
  - match result bridge emit.

# 의사코드
```lua
-- Pattern: Controller + State(블럭 교체). store를 '구독'만 하고 규칙은 계산하지 않는다.
-- 화면 오케스트레이션(블럭 전환/배경 패닝/cylinder anchor/결과 emit)만 담당.
local store_mod = require("game.model.store")
local selectors = require("game.model.selectors")

local BLOCKS = {                       -- turn.kind -> 활성 GUI component 주소들
    setup = { "/ui#shake", "/ui#local_hud" },
    shaking = { "/ui#shake", "/ui#local_hud" },
    bidding = {
        "/ui#player_carousel",
        "/ui#rail",
        "/ui#local_hud",
        "/ui#bid_controls",
    },
    dualing = { "/ui#duel" },
    complete = { "/ui#duel" },
}
local BG_LOCATION = { setup = "setup", bidding = "bidding", shaking = "shaking", dualing = "dualing" }

function on_message(self, message_id, message, sender)
    if message_id == hash("boot") then
        self.store = store_mod.get()
        -- Observer 등록: 관심 topic만 구독
        self.subs = {
            self.store:subscribe("turn",  function(s) self:on_turn(s) end),
            self.store:subscribe("duel",  function(s) self:on_duel(s) end),
            self.store:subscribe("match", function(s) self:on_match(s) end),
        }
    elseif message_id == hash("submit_result") then
        msg.post("/go#main", "submit_result")     -- adapter가 payload shape를 책임
    end
end

function on_turn(self, state)
    local kind = state.turn.kind
    self:activate_block(kind)                                            -- 1) State: 이전 끄고 현재 켜기
    msg.post("/background#background", "pan_to", { location = BG_LOCATION[kind] })  -- 2) Command
    msg.post("/cylinder#cylinder", "set_target", { anchor = cylinder_target(state) }) -- 3) Command
end

function on_duel(self, state)
    if state.duel and state.duel.phase == "ready" then
        self:activate_block("dualing")   -- duel.gui_script가 sequence를 실행
    end
end

function on_match(self, state)
    if state.match.status == "complete" then
        msg.post("#", "submit_result")
    end
end

-- 순수 정책은 selector에 위임 (director는 분기 결과만 사용)
function cylinder_target(state) return selectors.cylinder_anchor(state) end  -- hud | focal | offscreen
```
