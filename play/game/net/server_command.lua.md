# 개요
Defold local UI intent를 Web bridge의 `PLAYER_COMMAND` 메시지로 변환하는 얇은 송신 모듈.
Convex Web 경로에서는 semantic action을 서버 권위형 Convex 루프로 우선 전송한다.
Native/editor 또는 `localSimulator` match에서는 no-op으로 동작해 기존 local reducer simulator를 유지한다.

# 의존성
- `main/game_bridge.lua`: HTML5 bridge 감지 및 Defold → Vue message emit.
- `shared/protocol/game-bridge.ts`: `PLAYER_COMMAND` payload contract.

# I/O
- 입력:
  - local state.
  - command type: `bid.raise`, `bullet.load`, `shake.complete` 등.
  - optional payload.
- 출력:
  - Web 환경에서만 `PLAYER_COMMAND` bridge message.
  - Native/editor local simulator에서는 no-op.
  - Web local simulator route에서는 no-op.

# 의사코드
```lua
function emit(state, command_type, payload)
    if not bridge.is_web() or state.match.local_simulator then return false end
    bridge.emit("PLAYER_COMMAND", {
        commandId = generated_id(),
        matchId = state.match.match_id,
        type = command_type,
        payload = payload or {},
    })
    return true
end
```
