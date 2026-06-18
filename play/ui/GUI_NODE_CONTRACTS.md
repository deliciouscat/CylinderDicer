# GUI Node Contracts

이 문서는 Defold 편집기에서 `.gui`를 만들 때 필요한 node id 계약이다. 실제 배치/스타일은 편집기에서 조정하고, script는 아래 id가 있으면 값을 주입한다. 없는 node는 무시한다. 게임 화면의 구체 visual은 실제 PNG/atlas asset만 사용한다. asset이 없는 heart/target/cylinder 같은 요소는 벡터/도형으로 그리지 않고 숨기거나 텍스트 상태값만 표시한다.

## 공통 메시지

- `activate`: 해당 GUI root 표시.
- `deactivate`: 해당 GUI root 숨김.

## turn_indicator.gui

- `root`: 전체 컨테이너.
- `label`: 현재 턴 문자열.

## shake.gui

- `root`: 전체 컨테이너.
- `hint`: 상태 안내.
- `dice_values`: 로컬 플레이어 주사위 값을 임시 텍스트로 표시.

컵은 `shake.gui` node 계약에 포함하지 않는다. 컵 visual은 background/table world prop으로 렌더링하고, shake/duel 시점 이동에 맞춰 등장한다.

## local_hud.gui

- `name`: 로컬 플레이어 이름.
- `hp`: HP 값.
- `bullets`: 장전된 탄 수.
- `hint`: 상태 안내.
- `dice_values`: 로컬 주사위 값.
- `cylinder_anchor`: cylinder overlay가 `hud` 위치로 이동할 기준점.

## player_carousel.gui

- `root`: 전체 컨테이너.
- `players`: 플레이어 목록 임시 텍스트. 이후 slot template으로 교체 가능.
- `slot{n}_body`: 캐릭터 atlas 초상 box. 현재 실제 atlas가 있는 캐릭터만 표시한다.
- `slot{n}_bullets`, `slot{n}_hp`, `slot{n}_name`, `slot{n}_marker`: 상태 텍스트.

## bid_controls.gui

- `root`: 전체 컨테이너.
- `pass_label`: 넘기기 버튼 label.
- `challenge_label`: 결투신청 버튼 label.
- `bid_value`: 현재 선택 bid.
- `pass_enabled`: pass 활성 상태 임시 텍스트.
- `challenge_enabled`: challenge 활성 상태 임시 텍스트.

외부에서 command message를 보내면 버튼 동작을 실행한다.

```lua
msg.post("#bid_controls", "command", { command = "face_up" })
msg.post("#bid_controls", "command", { command = "face_down" })
msg.post("#bid_controls", "command", { command = "pass" })
msg.post("#bid_controls", "command", { command = "challenge" })
```

## rail.gui

- `root`: 전체 컨테이너.
- `range`: 현재 visible rail range.
- `selected_count`: 선택 count.
- `selected_face`: 선택 face.
- `current_bid`: 직전 bid marker 임시 텍스트.

외부에서 count를 직접 선택할 수 있다.

```lua
msg.post("#rail", "select_count", { count = 7 })
```

## duel.gui

- `root`: 전체 컨테이너.
- `step`: 현재 duel sequence step.
- `dice_spread`: 공개된 dice 요약.
- `verdict`: SHORT/OVER/EXACT 판정.
- `fx`: HIT/MISS/COMPLETE 임시 표시.

## cylinder_overlay.collection

GO script `cylinder_overlay.script`는 아직 sprite node를 요구하지 않는다. 실제 `revolver/default/cylinder.png`와 `bullet.png` asset이 생기기 전까지는 구체 cylinder visual을 만들지 않는다. 입력은 현 단계에서 screen center 기준 6등분 임시 hit-test를 쓴다. 실제 slot hit area가 생기면 script의 `hit_slot()`만 교체한다.
