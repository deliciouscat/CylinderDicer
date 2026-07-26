# 개요
사운드 재생 façade. UI와 director가 구체 sound component를 모르고 이벤트 이름만 요청하게 한다.

# 의존성
- `game/audio/audio_controller.script`: match/reload/result snapshot cue 재생.
- `game/core/audio_events.lua`: start/reload/clasp/dice reveal/result cue의 중복 없는 순수 판정. `drop`은 입력 시점이 아니라 `dice_check` phase 진입에 맞춘다.
- `ui/shake`, `ui/duel`, `ui/bid_controls`: 입력 및 연출 타이밍 cue.
- `assets/sounds/bgm`
- `assets/sounds/sfx`
- `assets/sounds/voice`

# I/O
- 입력:
  - `play_sfx(name, opts)`.
  - `play_bgm(name, opts)`.
  - `stop_bgm(name)`.
  - `play_voice(name, opts)`.
- 출력:
  - sound component playback.
  - optional playback id/status.

# 의사코드
```lua
-- Pattern: Facade. 호출자는 sound component url을 모르고 '이벤트 이름'만 요청한다.
local M = {}

local SFX = {   -- 이벤트 이름 -> sound component url 매핑
    start_bell = "/audio#start_bell",
    roll = "/audio#roll", drop = "/audio#drop",
    reload = "/audio#reload", clasp = "/audio#clasp",
    tick = "/audio#tick", bang = "/audio#bang",
    victory = "/audio#victory", placement = "/audio#placement",
    button_click = "/audio#button_click",
}

function M.play_sfx(name, opts)
    local url = SFX[name]
    if url then sound.play(url, opts) end       -- 미등록 이름은 조용히 무시
end

function M.play_bgm(name, opts)  sound.play("/audio#bgm_" .. name, opts) end
function M.stop_bgm(name)        sound.stop("/audio#bgm_" .. name) end
function M.play_voice(name, opts) sound.play("/audio#voice", opts) end

return M
```
