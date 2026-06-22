# GUI Node Contracts

이 문서는 Defold 편집기에서 `.gui`를 만들 때 필요한 node id 계약이다. 실제 배치/스타일은 편집기에서 조정하고, script는 아래 id가 있으면 값을 주입한다. 없는 node는 무시한다. 게임 화면의 구체 visual은 실제 PNG/atlas asset만 사용한다. asset이 없는 heart/target/cylinder 같은 요소는 벡터/도형으로 그리지 않고 숨기거나 텍스트 상태값만 표시한다.

## 공통 메시지

- `activate`: 해당 GUI root 표시.
- `deactivate`: 해당 GUI root 숨김.

## Phase HUD 계약

최종 visibility 책임은 `game/director.script`가 가진다. 개별 gui_script는 값을 주입하고 입력을 action으로 변환하되, 임시 QA 코드를 제외하면 phase visibility를 독자적으로 결정하지 않는다.

| `flow.phase` | HUD kind | 활성 component | turn indicator |
| --- | --- | --- | --- |
| `revolver_reload` | `revolver_reload` | `turn_indicator`, `player_carousel`, `cylinder_overlay` | `turn.reload` |
| `cup_shake` | `cup_shake` | `turn_indicator`, `shake`, `local_hud`, world cup | `turn.shake` |
| `dice_check` | `cup_shake` | `turn_indicator`, `shake`, `local_hud` | `turn.shake` |
| `bidding_gap` | `cup_shake` | `turn_indicator`, `shake`, `local_hud` | `turn.shake` |
| `bidding` | `bidding` | `turn_indicator`, `player_carousel`, `rail`, `local_hud`, `bid_controls`, `cylinder_overlay` | `turn.mine` / `turn.opponent` |
| `duel` | `duel` | `turn_indicator`, `duel` | `turn.duel` |
| `complete` | `complete` | `turn_indicator`, `duel` 또는 result HUD | `hud.hint.complete` |

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

`revolver_reload` 화면은 `local_hud`가 아니라 `cylinder_overlay`가 전담한다. local HUD 안에 reload 전용 panel/node를 다시 추가하지 않는다.

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

## cylinder_overlay.gui / cylinder_overlay.script

- `root`: 전체 GUI. `revolver_reload`, `bidding`에서 표시.
- `shade`: reload 중 player carousel 위에 깔리는 shading layer.
- `cylinder_group`: cylinder visual 그룹. reload에서는 중앙 대형, bidding에서는 우하단 소형.
- `ring`, `plate`, `hub`: 임시 cylinder placeholder. 실제 `revolver/default/cylinder.png`가 들어오면 교체한다.
- `slot_{1..6}_rim`, `slot_{1..6}`, `primer_{1..6}`: 실린더 구멍/장전 상태. 총알이 있으면 primer node가 보이고, 비어 있으면 숨긴다.
- `bullet_group`, `bullet_{1..3}`, `bullet_tip_{1..3}`: 남은 장전 bullet placeholder. asset이 들어오면 같은 id에 texture를 붙인다.
- `reload_title`, `reload_count`: reload 전용 상태 표시.

`cylinder_overlay.script`는 pending load 상태에서 빈 slot만 클릭 가능하게 action을 dispatch한다. 현재 hit-test는 reload 중앙 cylinder와 bidding 우하단 cylinder의 screen-space 중심을 기준으로 6등분한다. 실제 slot hit area asset이 들어오면 `hit_slot()`만 교체한다.
