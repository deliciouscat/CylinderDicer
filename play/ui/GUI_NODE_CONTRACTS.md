# GUI Node Contracts

이 문서는 Defold 편집기에서 `.gui`를 만들 때 필요한 node id 계약이다. 실제 배치/스타일은 편집기에서 조정하고, script는 아래 id가 있으면 값을 주입한다. 없는 node는 무시한다. 게임 화면의 구체 visual은 실제 PNG/atlas asset만 사용한다. asset이 없는 heart/target/cylinder 같은 요소는 벡터/도형으로 그리지 않고 숨기거나 텍스트 상태값만 표시한다.

## 공통 메시지

- `activate`: 해당 GUI root 표시.
- `deactivate`: 해당 GUI root 숨김.

## Phase HUD 계약

최종 visibility 책임은 `game/director.script`가 가진다. 개별 gui_script는 값을 주입하고 입력을 action으로 변환하되, 임시 QA 코드를 제외하면 phase visibility를 독자적으로 결정하지 않는다.

| `flow.phase` | HUD kind | 활성 component | turn indicator |
| --- | --- | --- | --- |
| `revolver_reload` + local pending load | `revolver_reload` | `turn_indicator`, `player_carousel`, `cylinder_overlay` | `turn.reload` |
| `revolver_reload` + opponent pending load | `loading` | `turn_indicator` | `turn.loading` |
| `cup_shake` | `cup_shake` | `turn_indicator`, `player_carousel`, `shake` | `turn.shake` |
| `dice_check` | `cup_shake` | `turn_indicator`, `player_carousel`, `shake` | `turn.shake` |
| `bidding_gap` | `cup_shake` | `turn_indicator`, `player_carousel`, `shake` | `turn.shake` |
| `bidding` | `bidding` | `turn_indicator`, `player_carousel`, `rail`, `local_hud`, `bid_controls`, `cylinder_overlay` | `turn.mine` / `turn.opponent` |
| `duel` | `duel` | `turn_indicator`, `player_carousel`, `duel` | `turn.duel` |
| `complete` | `complete` | `turn_indicator`, `duel` 또는 result HUD | `hud.hint.complete` |

## turn_indicator.gui

- `root`: 전체 컨테이너.
- `label`: 현재 턴 문자열.

## shake.gui

- `root`: 전체 컨테이너.
- `cup_local`: 로컬 플레이어의 중앙 대형 컵.
- `cup_seat_{1..5}`: 반원 좌석의 상대 플레이어 컵.
- `reveal_dice_{1..5}`: 로컬 컵 아래 테이블에 공개되는 주사위.
- `dice_tray`: 로컬 패 요약 컨테이너.
- `tray_dice_{1..5}`: 하단 주사위 트레이.
- `hint`: 상태 안내.
- `progress`: 로컬 흔들기 진행도 임시 텍스트.

`cup_shake`에서는 모든 컵을 닫힌 상태로 표시하고 공개 주사위와 트레이를 숨긴다. `dice_check`와 `bidding_gap`에서는 로컬 컵만 위로 들어 올리고 로컬 주사위와 트레이를 표시한다. 상대 컵과 `player_carousel` 캐릭터는 `ui/common/table_seat_layout.lua`의 같은 좌석을 사용한다.

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

`cup_shake`, `dice_check`, `bidding_gap`에서는 shake arc 모드로 전환한다. 로컬 플레이어는 중앙 뒤쪽, 상대 플레이어는 반원 좌석에 표시하고 badge/name/marker는 숨긴다.

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
- `reveal_group`: 패 공개 화면 컨테이너. 공개 단계에서만 표시한다.
- `combat_group`: duel 집행 화면 컨테이너. 집행 단계에서만 표시한다.
- `template_group`: root 좌표계 runtime clone template 컨테이너.
- `title`: 패 공개 제목.
- `duel_cup_{1..6}`: 공개 연출용 컵.
- `grid_panel`: 해골과 bidding된 눈 집계 영역.
- `bid_summary`, `actual_summary`: 현재 콜과 공개된 실제 개수.
- `hint`: 패 공개 안내.
- `combat_shade`, `vignette_top`, `vignette_bottom`: duel 집행 중 shading/vignette.
- `combat_left_body`, `combat_right_body`: 결투 참여자 일러스트.
- `combat_left_name`, `combat_right_name`: 참여자 이름.
- `left_bullets`, `left_hp`, `right_bullets`, `right_hp`: 참여자 탄/HP.
- `combat_status`, `combat_shot`, `combat_result`: 판정, 현재 roulette step, hit/miss 결과.
- `hit_flash`: 명중 이펙트 placeholder.
- `player_dice_template`, `grid_dice_template`, `tray_dice_template`: 반복 주사위 runtime clone용 template. 에디터에 65개 반복 노드를 직접 두지 않는다. `grid_dice_template`과 `tray_dice_template`는 각각 `grid_panel`, `tray` 좌표계에 남긴다.

## cylinder_overlay.gui / cylinder_overlay.script

- `root`: 전체 GUI. `revolver_reload`, `bidding`에서 표시.
- `shade`: reload 중 player carousel 위에 깔리는 shading layer.
- `cylinder_group`: cylinder visual 그룹. reload에서는 중앙 대형, bidding에서는 우하단 소형.
- `ring`, `plate`, `hub`: 임시 cylinder placeholder. 실제 `revolver/default/cylinder.png`가 들어오면 교체한다.
- `slot_{1..6}_rim`, `slot_{1..6}`, `primer_{1..6}`: 실린더 구멍/장전 상태. 총알이 있으면 primer node가 보이고, 비어 있으면 숨긴다.
- `bullet_group`, `bullet_{1..3}`, `bullet_tip_{1..3}`: 남은 장전 bullet placeholder. asset이 들어오면 같은 id에 texture를 붙인다.
- `reload_title`, `reload_count`: reload 전용 상태 표시.

`cylinder_overlay.script`는 pending load 상태에서 빈 slot만 클릭 가능하게 action을 dispatch한다. Hit-test는 `slot_geometry.lua`가 담당하며, 위쪽 `slot_1`부터 시계방향으로 `slot_6`까지 GUI node 배치와 같은 순서를 사용한다. 장전 시 선택 slot만 채우고 회전하지 않는다. 결투 직전에 판정 대상 실린더를 1~6칸 무작위로 원형 회전한다.
