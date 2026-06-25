# CylinderDicer Defold 개발 가이드

이 문서는 CylinderDicer를 구현하며 확인한 Defold의 실행 특성, 재발하기 쉬운 실수, 내장 기능 우선 원칙을 정리한다.

게임 규칙의 정본은 `GAME_RULES.md`, 화면 계약은 `DISPLAY.md`와 `ui/GUI_NODE_CONTRACTS.md`, 구조 원칙은 `ARCHITECTURE.pre.md`를 따른다. 이 문서는 그 구조를 Defold에서 안전하게 구현하기 위한 엔진 지침이다.

## 1. 핵심 원칙

1. Defold API를 추측하지 않는다. 불확실하면 프로젝트의 `defold-api-fetch` 또는 `defold-docs-fetch` skill로 확인한다.
2. `gui.*`, `go.*` 같은 엔진 API는 해당 component의 lifecycle context 안에서만 호출한다.
3. GO와 GUI 사이의 실행 경계는 직접 callback보다 `msg.post()`를 우선한다.
4. 순수 도메인 state와 Defold presentation state를 분리한다.
5. 엔진에 이미 있는 animation, timer, template, layout 기능을 먼저 검토한다.
6. 필수 resource와 GUI node 오류를 조용히 삼키지 않는다.
7. `.gui`, `.collection`, `.atlas` 등 protobuf text asset은 Defold 형식과 필수 필드를 명시적으로 지킨다.

## 2. Component Context

### 2.1 Lifecycle context가 실행 권한을 결정한다

Lua 함수가 어느 파일에 정의됐는지가 아니라, 어떤 Defold lifecycle에서 호출됐는지가 중요하다.

예를 들어 GUI script가 store에 등록한 closure라도 다음처럼 GO script에서 시작된 동기 callback 경로라면 GUI context가 아니다.

```text
GO script on_input
  -> store:dispatch()
    -> event_bus:publish()
      -> GUI script가 등록한 closure
        -> gui.get_node() 호출 실패
```

`shared_state = 1`은 Lua state를 공유할 뿐 GUI scene context까지 전달하지 않는다.

### 2.2 허용되는 GUI 갱신 위치

GUI node 접근과 변경은 다음 GUI lifecycle 안에서 수행한다.

- `init(self)`
- `update(self, dt)`
- `on_message(self, message_id, message, sender)`
- `on_input(self, action_id, action)`
- GUI lifecycle에서 시작된 engine callback

Store 또는 event bus callback에서는 다음만 수행한다.

- 일반 Lua 값 저장
- `self.needs_render = true` 같은 dirty flag 설정
- GUI component에 `msg.post()` 전송

Store callback에서 직접 `gui.*`를 호출하거나 `render_signature`를 갱신하지 않는다.

### 2.3 권장 렌더 패턴

```lua
local function render(self, state)
	-- gui.* calls
	self.render_signature = make_signature(state)
	self.needs_render = false
end

function update(self, dt)
	local state = self.store:get_state()
	local signature = make_signature(state)
	if self.needs_render or signature ~= self.render_signature then
		render(self, state)
	end
end
```

잘못된 context에서 실패한 렌더가 signature를 먼저 기록하면, 정상적인 `update()` 렌더까지 영구적으로 건너뛸 수 있다.

## 3. GO와 GUI 통신

GUI script는 gameplay module을 직접 조작하기보다 message를 통해 game logic과 통신한다.

```text
GUI input
  -> msg.post(controller, command)
  -> controller/store dispatch
  -> state 변경
  -> msg.post(GUI component, state/render message)
  -> GUI lifecycle에서 node 갱신
```

현재 Redux-lite store와 순수 reducer는 유지한다. 이는 Defold 기능을 재구현한 것이 아니라 다음 요구를 위한 프로젝트 구조다.

- 게임 규칙 단위 테스트
- Vue bridge 연동
- 결정적인 action/state 기록
- Defold presentation과 도메인 규칙 분리

단, store/event bus가 Defold component context를 우회하는 호출 통로가 되어서는 안 된다.

## 4. Input

### 4.1 Input focus 획득

Defold input은 focus를 획득한 script 또는 GUI component에만 전달된다.

```lua
msg.post(".", "acquire_input_focus")
```

필요가 없어지면 다음 메시지로 해제한다.

```lua
msg.post(".", "release_input_focus")
```

`gui.acquire_input_focus()` 같은 undocumented API를 만들거나 가정하지 않는다.

### 4.2 Input stack과 소비

- Input은 focus stack 위에서 아래 순서로 전달된다.
- `on_input()`에서 `true`를 반환하면 해당 input을 소비한다.
- 비활성 화면이 focus를 계속 보유하면 입력 충돌과 중복 dispatch가 발생할 수 있다.

화면별 GUI가 모두 input을 감시하게 만들기보다, 필요하면 한 input router가 focus를 소유하고 active HUD에 command message를 보내는 구조를 사용한다.

## 5. GUI Node 계약

### 5.1 필수 node는 init에서 검증한다

필수 node를 매번 문자열로 조회하고 실패를 `pcall`로 숨기지 않는다.

```lua
function init(self)
	self.nodes = {
		root = gui.get_node("root"),
		cup = gui.get_node("cup"),
		hint = gui.get_node("hint"),
	}
end
```

필수 node가 없다면 build 또는 실행 시 즉시 실패해 계약 오류를 드러내야 한다. 정말 선택적인 node만 별도 optional helper를 사용한다.

### 5.2 Defensive no-op을 피한다

다음 패턴은 오류 원인을 숨기므로 필수 UI에는 사용하지 않는다.

```lua
local ok, node = pcall(gui.get_node, id)
if not ok then
	return nil
end
```

이 방식은 node 이름 불일치, component context 오류, stale scene을 모두 같은 “화면이 안 바뀜” 증상으로 만든다.

### 5.3 `.gui` 파일 작성

텍스트로 `.gui`를 수정할 때는 각 node의 numeric vector를 명시한다.

- `position`
- `size`
- `scale`
- `color`
- 필요한 경우 `rotation`, `pivot`, `slice9`

Texture는 GUI resource 목록에 등록하고 box node는 등록된 texture/animation ID를 참조한다. 임의 파일 경로를 runtime texture ID처럼 사용하지 않는다.

## 6. Animation과 Timer

### 6.1 내장 animation 우선

정해진 시작점과 끝점이 있는 연출은 `gui.animate()` 또는 `go.animate()`를 우선한다.

적합한 사례:

- cylinder HUD 진입과 퇴장
- cup 상승과 하강
- shade fade
- bullet fade
- scale bounce
- color/alpha transition

`"position.y"`처럼 property component를 지정할 수 있으며 easing과 completion callback을 사용할 수 있다.

### 6.2 `update()`를 써야 하는 경우

다음처럼 매 frame 입력이나 물리량과 직접 결합되는 동작에는 `update()`가 적합하다.

- drag 거리 누적
- 입력 강도에 따른 cup wobble
- 연속 추적
- 여러 값이 실시간으로 결합된 procedural motion

유한 tween까지 수동 보간하지 않는다.

### 6.3 Timer 우선

단순 지연과 반복 실행에는 `timer.delay()`를 먼저 검토한다.

- 짧은 phase 대기
- duel step 간 delay
- 안내 문구 timeout
- 반복 pulse

작은 scheduler를 `update()` 위에 다시 만들기 전에 timer의 lifecycle과 callback 요구를 확인한다. Context가 불확실하면 공식 API를 확인하고 component message로 경계를 명시한다.

## 7. Repeated GUI와 Layout

### 7.1 정적 pool과 동적 clone 선택

반복 node는 요구에 따라 두 방식 중 하나를 택한다.

정적 pool:

- 최대 개수가 작고 고정됨
- node ID 계약이 중요함
- 에디터에서 직접 배치해야 함

GUI template 또는 `gui.clone_tree()`:

- 개수가 runtime에 달라짐
- 같은 구조가 여러 화면에서 반복됨
- node proto 중복이 커짐

CylinderDicer는 최대 6명이므로 player/cup slot의 정적 pool은 실용적인 선택이다. 중복 구조가 계속 커지면 template 또는 clone으로 전환한다.

GUI template의 script는 독립 component처럼 실행되지 않는다. Parent GUI script가 template instance를 제어한다.

### 7.2 좌석 반원 배치

`ui/common/table_seat_layout.lua`의 반원 angle 배치는 유지한다.

Defold에는 Unity의 Layout Group이나 Unreal UMG의 범용 arc panel에 해당하는 내장 배치기가 없다. 2~6명 좌석을 보이지 않는 반원에 배치하는 계산은 프로젝트에 필요한 presentation module이다.

좌석 계산은 다음 정보만 반환한다.

- position
- scale
- angle 또는 depth order
- local/opponent role에 따른 slot

게임 규칙이나 player turn state를 변경하지 않는다.

### 7.3 Responsive layout

해상도별 화면 대응을 ad-hoc viewport 계산으로 계속 늘리지 않는다. 다음을 먼저 사용한다.

- GUI layouts
- display profiles
- node anchors/pivots
- adjust mode

Layout은 node 생성/삭제가 아니라 property override라는 점을 고려한다.

## 8. Resource와 Asset

### 8.1 컴파일된 resource를 전제로 한다

Atlas, font, texture, GUI scene은 Defold build resource다. Unity식으로 임의 문자열 파일 경로를 넣으면 자동으로 runtime resource가 되는 구조가 아니다.

- GUI texture는 `.gui`에 등록한다.
- Image sequence는 atlas animation ID로 선택한다.
- Resource path에는 Defold가 요구하는 절대 resource ID를 사용한다.
- 동적 다운로드가 필요할 때만 Live Update 또는 dynamic resource API를 별도로 설계한다.

### 8.2 Asset 우선 원칙

- 기존 `assets/` 목록을 먼저 확인한다.
- Asset이 없으면 구체적인 가짜 벡터 이미지를 만들지 않는다.
- 필요한 경우 box/label placeholder만 사용한다.
- 게임 화면용 일러스트는 PNG/atlas asset을 사용한다.

### 8.3 Font

Default font가 한글 glyph를 제공한다고 가정하지 않는다.

한글 UI에는 재배포 가능한 TTF/OTF와 `.font` resource를 등록하고 필요한 glyph 범위를 확인한다. 정식 font가 준비되기 전에는 ASCII fallback을 사용하되 locale key 자체를 화면에 노출하는 상태를 완료로 보지 않는다.

## 9. GUI와 World Rendering 선택

다음 기준으로 소유 계층을 결정한다.

GUI가 적합한 것:

- 화면 좌석에 정렬되는 character/cup/dice
- HUD, button, rail, indicator
- 해상도에 따라 고정되어야 하는 overlay

GO/sprite가 적합한 것:

- camera와 함께 움직이는 panorama background
- world transform이 필요한 object
- 물리 또는 world-space effect

같은 cup을 world sprite와 GUI node에서 동시에 소유하지 않는다. CylinderDicer의 player별 cup은 `shake.gui`가 소유하고, 배경은 GO/sprite가 담당한다.

## 10. Build와 Debugging

### 10.1 Build 상태를 먼저 구분한다

`.gui`, `.collection`, `.atlas`의 node/resource 변경은 script hot reload만으로 충분하지 않을 수 있다.

문제가 발생하면 다음 순서로 확인한다.

1. 현재 phase/state를 status file로 확인한다.
2. component와 GUI node가 실제로 resolve되는지 `init()`에서 확인한다.
3. GUI API 호출이 올바른 lifecycle context인지 확인한다.
4. clean build 후 scene/resource mismatch를 배제한다.
5. render order, enabled state, parent alpha, clipping을 확인한다.

Node가 `init()`에서는 resolve되고 store callback에서는 실패한다면 stale build보다 component context 문제를 먼저 의심한다.

### 10.2 상태와 화면을 분리해서 측정한다

화면이 변하지 않는다고 reducer 실패로 단정하지 않는다.

```text
input 수신
-> action dispatch
-> state 변경
-> phase 전이
-> GUI render 요청
-> lifecycle render
-> node property 변경
```

각 경계에 최소 로그를 두고 어디까지 성공했는지 확인한다. 원인이 확인되면 임시 진단 로그와 fallback 코드는 제거한다.

## 11. CylinderDicer에서 유지할 구조

다음은 Defold 내장 기능을 불필요하게 재구현한 것이 아니므로 유지한다.

- 순수 Lua reducer/store/rules
- action 기반 command 표준화
- Vue bridge adapter
- selector 기반 presentation 파생값
- `table_seat_layout.lua`
- phase별 GUI component 분리
- bounded player/cup node pool

다음은 축소하거나 내장 기능으로 대체한다.

- GUI API를 호출하는 event bus subscriber
- 실패를 숨기는 범용 `gui_util` wrapper
- 유한 animation의 수동 tween
- 단순 delay를 위한 custom update scheduler
- runtime 파일 경로를 texture처럼 해석하는 cosmetic 처리
- 비활성 HUD의 상시 input focus

## 12. 구현 전 체크리스트

새 Defold 기능을 구현하기 전에 확인한다.

- 이 API가 실제로 존재하는가?
- 호출 위치가 올바른 script/component lifecycle인가?
- GO와 GUI 경계를 `msg.post()`로 표현할 수 있는가?
- `gui.animate`, `go.animate`, `timer.delay`로 해결 가능한가?
- GUI template 또는 `gui.clone_tree()`가 필요한 반복 구조인가?
- GUI layout/display profile로 처리할 반응형 문제인가?
- Asset과 atlas animation이 이미 존재하는가?
- 필수 node/resource 실패가 조용히 무시되고 있지 않은가?
- 순수 모델에 HUD 이름이나 좌표가 새어 들어가고 있지 않은가?
- build 후 editor와 실제 runtime에서 검증했는가?

이 체크리스트를 통과하지 못하면 helper나 framework를 새로 만들기 전에 공식 Defold API와 프로젝트-local skill을 먼저 확인한다.
