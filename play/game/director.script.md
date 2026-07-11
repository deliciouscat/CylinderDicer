# 개요
게임 화면 오케스트레이터. store 상태를 구독하고 `selectors.hud_kind(state)`에 맞춰 화면 블럭을 전환한다. 배경 패닝, cylinder anchor 이동, 결투 시퀀스 시작을 조율한다.

# 의존성
- `game/model/store.lua`: 상태 구독, action dispatch.
- `game/model/selectors.lua`: 화면용 파생 상태 조회.
- `game/model/turn_machine.lua`: 턴 전이 결과 해석.
- `game/core/event_bus.lua`: 상태 변경 topic 수신.
- `game/core/anchors.lua`: cylinder 목표 anchor 계산.
- `game/core/tween.lua`: 화면/anchor 이동 요청.
- `game/core/audio.lua`: 턴/결투 사운드 요청.
- `background/background.gui_script`: 배경 위치 변경.
- `ui/*`: 활성 UI block과 overlay 제어.

# I/O
- 입력:
  - store topics: `turn`, `ui`.
  - messages: UI 컴포넌트 준비/완료 신호, duel sequence 완료 신호.
- 출력:
  - UI block 활성/비활성 메시지.
  - background pan 명령.
  - cylinder target anchor 명령.
  - duel sequence 시작 명령.

# 의사코드
```lua
-- Pattern: Controller + State(블럭 교체). store를 '구독'만 하고 규칙은 계산하지 않는다.
-- 화면 오케스트레이션(블럭 전환/배경 패닝/cylinder anchor)만 담당.
local store_mod = require("game.model.store")
local selectors = require("game.model.selectors")

local BLOCKS = {                       -- selector.hud_kind -> 활성 GUI component 주소들
    revolver_reload = { "/ui#player_carousel", "/ui#local_hud" },
    cup_shake = { "/ui#shake", "/ui#local_hud" },
    bidding = {
        "/ui#player_carousel",
        "/ui#rail",
        "/ui#local_hud",
        "/ui#bid_controls",
    },
    duel = { "/ui#player_carousel", "/ui#duel" },
    complete = { "/ui#duel" },
}

function bind_store(self)
    self.store = store_mod.get()
    self.subs = {
        self.store:subscribe("turn", function() self.needs_turn_sync = true end),
        self.store:subscribe("ui", function() self.needs_turn_sync = true end),
    }
end

function update(self, dt)
    if not self.needs_turn_sync then return end
    self.needs_turn_sync = false
    local state = self.store:get_state()
    local kind = selectors.hud_kind(state)
    self:activate_block(kind)                                            -- 1) State: 이전 끄고 현재 켜기
    msg.post("/background#background", "pan_to", { location = selectors.background_location(state) })  -- 2) Command
    msg.post("/cylinder#cylinder", "set_target", { anchor = selectors.cylinder_anchor(state) }) -- 3) Command
end

-- 순수 presentation mapping은 selector에 위임 (director는 분기 결과만 사용)
```
