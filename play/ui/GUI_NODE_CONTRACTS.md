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
| `cup_shake` | `cup_shake` | `turn_indicator`, `shake` | `turn.shake` |
| `dice_check` | `cup_shake` | `turn_indicator`, `shake` | `turn.shake` |
| `bidding_gap` | `cup_shake` | `turn_indicator`, `shake` | `turn.shake` |
| `bidding` | `bidding` | `turn_indicator`, `player_carousel`, `rail`, `local_hud`, `bid_controls`, `cylinder_overlay` | `turn.mine` / `turn.opponent` |
| `duel` | `duel` | `turn_indicator`, `player_carousel`, `duel` | `turn.duel` |
| `complete` | `complete` | `turn_indicator`, `duel` 또는 result HUD | `hud.hint.complete` |

## turn_indicator.gui

- `root`: 전체 컨테이너.
- `label`: 현재 턴 문자열.

`root`는 화면 최상단 safe area에 유지한다. bidding의 중앙 portrait 및 HP/탄환 indicator는 banner 하단과 겹치지 않는 좌석 영역을 사용한다.

## shake.gui

- `root`: 전체 컨테이너.
- `cup_local`: 로컬 플레이어의 중앙 대형 컵.
- `cup_seat_{1..5}`: 반원 좌석의 상대 플레이어 컵.
- `reveal_dice_{1..5}`: 로컬 컵 아래 테이블에 공개되는 주사위. 각 결과 face의 `a1`–`a5` 각도 variant를 사용한다.
- `dice_tray`: 로컬 패 요약 컨테이너.
- `tray_dice_{1..5}`: 하단 주사위 리스트. face를 읽기 쉬운 정면 `a0` 이미지를 사용한다.
- `hint`: 상태 안내.
`cup_shake`에서는 모든 컵을 닫힌 상태로 표시하고 공개 주사위와 트레이를 숨긴다. 각 입력은 보이지 않는 로컬 게이지를 24 올리고 초당 12 감쇠시키며, 100이 되면 `shake.complete`를 한 번 제출한다. 게이지 숫자나 bar는 어느 phase에서도 표시하지 않는다. `dice_check`와 `bidding_gap`에서는 로컬 컵만 위로 들어 올려 로컬 주사위와 트레이를 표시한다. shake 계열 phase에서는 `player_carousel`을 표시하지 않는다.

## local_hud.gui

- `name`: 로컬 플레이어 이름.
- `bullet_badge` / `bullets`: `status/bullet_indicator` 위의 장전된 탄 수.
- `hp_badge` / `hp`: `status/hp_indicator` 위의 HP 값.
- `hint`: 상태 안내.
- `dice_{1..5}_box`: bidding 하단의 로컬 주사위 리스트. 정면 `a0` 이미지를 사용하며 같은 값의 텍스트 중복 표시는 하지 않는다.
- `cylinder_anchor`: cylinder overlay가 `hud` 위치로 이동할 기준점.

`revolver_reload` 화면은 `local_hud`가 아니라 `cylinder_overlay`가 전담한다. local HUD 안에 reload 전용 panel/node를 다시 추가하지 않는다.

HP와 탄환은 carousel과 동일하게 각 indicator icon 위 숫자만 표시한다. `HP`, `B` 같은 별도 텍스트 label은 두지 않는다.

## player_carousel.gui

- `root`: 전체 컨테이너.
- `slot{n}_body`: 캐릭터 atlas 초상 box이자 위치·크기·진동의 기준 node. 현재 실제 atlas가 있는 캐릭터만 표시한다. 삭제된 구형 `slot{n}_head` placeholder를 다시 참조하거나 추가하지 않는다.
- `slot{n}_bullets`, `slot{n}_hp`, `slot{n}_name`, `slot{n}_marker`: 상태 텍스트.

HP와 탄환은 badge 안의 숫자만 표시한다. 별도의 `HP:n B:n` 요약 텍스트는 두지 않는다. bidding에서 비활성 portrait alpha는 0.72, active/previous portrait는 1.0이다.

bidding의 현재 turn 플레이어 `body`는 화면 가로 중앙(`x = 0`)에 놓고, 직전 turn 플레이어는 바로 왼쪽 slot에 놓는다. turn이 바뀌면 player id가 아니라 authoritative `active_player_id` / `previous_player_id`에 따라 slot을 다시 배정한다.

`player_carousel`은 reload/bidding HUD가 소유한다. `cup_shake`, `dice_check`, `bidding_gap`에서는 `shake.gui`만 테이블 연출을 표시한다.

Skull bid의 자기 roulette가 실제 탄환을 격발하면 `player_carousel`은 해당 플레이어의 `slot*_body` 일러스트만 짧게 좌우 진동시킨다. HP와 장탄 수는 같은 authoritative snapshot에서 갱신한다.

## bid_controls.gui

- `root`: 전체 컨테이너.
- `pass_label`: 넘기기 버튼 label.
- `challenge_label`: 결투신청 버튼 label.
- `pass_die`: 현재 선택 face의 정면 주사위 이미지(`f{face}_a0`).
- `pass_enabled`: pass 활성 상태 임시 텍스트.
- `challenge_enabled`: challenge 활성 상태 임시 텍스트.

`challenge_button`에는 별도 문자 icon placeholder를 두지 않는다. 버튼 PNG와 label만 표시한다.

`pass_die`는 button 중앙보다 12 px 아래에 놓아 image가 frame 내부에 완전히 들어온다. `face_up` / `face_down`은 pass die의 x축에 맞추고 button의 위·아래에 배치한다.

외부에서 command message를 보내면 버튼 동작을 실행한다.

```lua
msg.post("#bid_controls", "command", { command = "face_up" })
msg.post("#bid_controls", "command", { command = "face_down" })
msg.post("#bid_controls", "command", { command = "pass" })
msg.post("#bid_controls", "command", { command = "challenge" })
```

## rail.gui

- `root`: 전체 컨테이너.
- `rail_strip`: 이동하는 rail 컨테이너. count 변경 시 `position.x`를 ease-in-out으로 이동한 뒤 원점에서 셀을 재사용한다.
- `track_left`, `track_center`, `track_right`: `rail.png`를 이어 붙인 3개 배경 tile. 이동 중에도 양쪽 끝이 비지 않는다.
- `cell_{1..13}_panel`: `bid_normal` 숫자판. 기존 크기의 70%이며 유효 숫자(1–36)가 없는 위치에서는 panel도 숨긴다.
- `cell_{1..13}`: 선택 count를 7번 중앙 셀에 맞춘 숫자 label. 유효 count 범위는 1–36이다.
- `pointer_top`, `pointer_bottom`: 중앙 선택 위치 marker.
- `current_bid`: 직전 bid marker 임시 텍스트.

과거 회색 placeholder인 `rail_top`, `rail_bottom`, `divider_*`는 실제 `rail.png`와 중복되므로 사용하지 않는다.

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
- `plate`: `revolver/default/cylinder.png` 실린더 본체. 별도의 slot/rim wireframe placeholder는 두지 않는다.
- `primer_{1..6}`: 장전된 약실의 `revolver/default/bullet_bottom.png`. 총알이 있으면 보이고, 비어 있으면 숨긴다.
- `bullet_group`, `bullet_{1..3}`: 남은 재장전 탄환 `revolver/default/bullet_unloaded.png`.
- `reload_title`, `reload_count`: reload 전용 상태 표시.

`cylinder_overlay.script`는 pending load 상태에서 빈 slot만 클릭 가능하게 action을 dispatch한다. Hit-test는 `slot_geometry.lua`가 담당하며, 위쪽 `slot_1`부터 시계방향으로 `slot_6`까지 GUI node 배치와 같은 순서를 사용한다. 장전 시 선택 slot만 채우고 회전하지 않는다. 결투 직전에 판정 대상 실린더를 1~6칸 무작위로 원형 회전한다.
