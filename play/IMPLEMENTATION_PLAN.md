# CylinderDicer Defold Implementation Plan

이 문서는 `play/ARCHITECTURE.pre.md`를 실제 구현 순서로 내린 계획이다. 목표는 Defold 내부에 게임 규칙, 상태 흐름, 화면 전환, Vue 브릿지 연동을 단계적으로 세우고, 각 단계가 독립적으로 검증되도록 만드는 것이다.

## 1. 목표 범위

### 이번 계획에서 만든다

- Defold 로컬 플레이 엔진
  - 매치 시작, 플레이어/주사위/실린더 상태, 턴 전이, 베팅, 장전, 결투 판정, 매치 종료 결과 생성.
- Redux-lite 단방향 상태 흐름
  - `dispatch(action) -> reducer -> store -> event_bus -> view` 구조.
- Defold 화면 골격
  - `shaking`, `bidding`, `dualing` 턴 블럭 전환.
  - 배경 패닝, 플레이어 캐러셀, 베팅 레일, 내 HUD, 단일 cylinder overlay.
- Vue 래퍼 연동
  - `START_MATCH`, `SET_COSMETICS`, `MATCH_READY`, `SUBMIT_MATCH_RESULT`.
- i18n/스킨 경로
  - 화면 문자열은 `assets/locale/*.json` 키로만 접근.
  - dice/cup/bg/rail 등 스킨 id를 asset id로 해석하는 최소 어댑터.

### 이번 계획에서 미룬다

- 서버 권위 실시간 멀티플레이.
- 정식 결제/상점/랭킹/인벤토리.
- 모든 캐릭터별 고유 전투 컷신.
- Live Update 기반 동적 에셋 다운로드.
- 랭크 부정행위 판정 고도화. 이번 범위에서는 `eventsHash`를 포함한 사후 검증 payload만 만든다.

## 2. 구현 원칙

- 순수 도메인 규칙은 `play/game/model/**`에 두고 Defold API를 호출하지 않는다.
- View는 store를 직접 변경하지 않는다. 모든 입력은 `actions.lua` 생성자를 통해 `store.dispatch()`로 들어간다.
- Director는 화면 오케스트레이션만 맡는다. 규칙 계산은 reducer/rules가 맡는다.
- `cylinder_overlay`는 생성/삭제하지 않는 단일 인스턴스로 유지하고, 앵커 좌표만 바꿔 이동한다.
- 새 문자열은 locale json에 먼저 추가한 뒤 `i18n.t(key, params)`로 사용한다.
- 첫 구현은 실제 아트와 placeholder를 섞어 세로 슬라이스를 통과시키고, 이후 polish 단계에서 교체한다.

## 3. 기준 상태 모델

초기 구현의 상태 shape는 아래를 기준으로 잡는다. Lua에서는 snake_case를 사용한다.

```lua
state = {
  match = {
    session_id = nil,
    match_id = nil,
    mode = "casual",
    local_player_id = nil,
    status = "idle", -- idle | ready | playing | complete
    turn_count = 0,
  },
  players = {
    order = {},
    by_id = {},
  },
  turn = {
    kind = "setup", -- setup | shaking | bidding | dualing
    active_player_id = nil,
    previous_player_id = nil,
    round_index = 0,
    is_first_shake = true,
  },
  bidding = {
    current_bid = nil, -- { player_id, count, face }
    recent_bids = {},
    my_bid = { count = 1, face = 2 },
    rail = { selected_count = 1, window_start = 1, window_size = 10 },
  },
  duel = nil, -- { phase, bid, challenger_id, previous_bidder_id, judge, resolution }
  pending_load = nil, -- { player_id, count, source = "setup" | "shake" | "bid" | "exact_duel" }
  ui = {
    locale = "ko",
    hint_key = "hud.hint.waiting",
    cosmetics = {},
  },
}
```

## 4. 단계별 계획

### Phase 0. 문서 고정과 뼈대 확인

산출물:

- `play/ARCHITECTURE.md`
  - `play/ARCHITECTURE.pre.md`의 내용을 최종 문서로 승격한다.
  - 턴 FSM과 결투 FSM mermaid를 추가한다.
- `play/IMPLEMENTATION_PLAN.md`
  - 이 문서를 기준 계획으로 둔다.

완료 기준:

- 핵심 디렉토리 구조, 상태 모델, 액션 이름, 브릿지 메시지 범위가 문서에서 서로 충돌하지 않는다.
- `README.md`, `play/README.md`, `play/DISPLAY.md`, `shared/protocol/game-bridge.ts`의 규칙과 용어가 같은 방향을 가리킨다.

### Phase 1. 순수 Lua 도메인 코어

추가 파일:

- `play/game/model/actions.lua`
- `play/game/model/store.lua`
- `play/game/model/reducers.lua`
- `play/game/model/selectors.lua`
- `play/game/model/turn_machine.lua`
- `play/game/model/rules/bidding.lua`
- `play/game/model/rules/cylinder.lua`
- `play/game/model/rules/dice.lua`
- `play/game/model/rules/duel.lua`
- `play/game/model/test_runner.lua`
- `play/game/model/tests/*.lua`

구현 작업:

- 액션 생성자 정의
  - `match.init`
  - `cosmetics.apply`
  - `setup.load_initial`
  - `shake.roll`
  - `bullet.load`
  - `bid.select_count`
  - `bid.select_face`
  - `bid.raise`
  - `bid.challenge`
  - `duel.resolve_choice`
  - `round.advance`
  - `match.complete`
- 베팅 규칙
  - 이전 콜이 없으면 `count >= 1`, `face in 1..6`.
  - 이전 콜보다 높은 콜만 유효. 우선 `(count, face)` 사전식 상승으로 시작하고, 게임 디자인에서 다른 비교법을 원하면 이 파일만 바꾼다.
- 실린더 규칙
  - 시작 시 각 플레이어 3발 장전.
  - 최초 shaking 이후 shaking마다 1발 장전.
  - bidding으로 넘긴 사람만 1발 장전.
  - challenge는 장전 없음.
  - EXACT 결투 집행 후 previousBidder(정확히 맞춘 사람)만 3발 장전(`source = "exact_duel"`) 후 shaking 시작.
  - 빈 슬롯에만 장전 가능.
- 주사위 규칙
  - 흔들기 시 플레이어별 dice를 랜덤 배정.
  - face `1`은 해골로 취급하되 집계 규칙은 `rules/dice.lua`에 고정한다.
- 결투 규칙
  - `SHORT`, `OVER`, `EXACT` 판정.
  - `SHORT/OVER`: `abs(actual - bid.count)`만큼 russian roulette. 이 분기는 "누가 누구를 쏜다"가 아니라 `roulette_subject`가 자기 실린더로 피격 판정을 받는 구조로 모델링한다.
    - `SHORT`: 실제 개수가 콜보다 적으므로 도전자가 틀림. `roulette_subject_id = challenger_id`.
    - `OVER`: 실제 개수가 콜보다 많으므로 직전 콜러가 틀림. `roulette_subject_id = previous_bidder_id`.
    - resolution shape: `{ kind = "duel_shots", verdict, challenger_id, previous_bidder_id, roulette_subject_id, steps, hp_changes }`.
  - `EXACT`: previousBidder가 맞춘 사람(A)이 되며, 도전자부터 순서대로 6번의 actor/target interaction을 만든다. 이 분기는 `duel_shots`와 섞지 않고 `{ kind = "perfect_duel", actor_id, targets, steps, hp_changes }`로 분리한다.
- selector
  - `is_my_turn`
  - `local_player`
  - `visible_rail_range`
  - `is_my_bid_valid`
  - `count_face`
  - `hint_key`

검증:

- Lua 테스트로 rules와 reducers를 먼저 고정한다.
- 최소 테스트 케이스:
  - 낮은 bid는 거부된다.
  - bid.raise 후 active player가 다음 플레이어로 이동한다.
  - bid.raise를 한 플레이어에게 pending load가 생긴다.
  - bid.challenge는 pending load를 만들지 않는다.
  - first shake는 추가 장전을 요구하지 않는다.
  - second shake부터 pending load가 생긴다.
  - 빈 슬롯 장전 후 pending load가 감소/해제된다.
  - duel 판정이 SHORT/OVER/EXACT로 나뉜다.
  - SHORT는 `roulette_subject_id`가 challenger이고, OVER는 previous bidder다.
  - SHORT/OVER resolution step은 `roulette_subject_id`, `slot_index`, `hit`, `consumed`를 가진다.
  - EXACT 결투 후 previousBidder만 `pending_load(3, exact_duel)`이 생기고, 다른 플레이어는 생기지 않는다.
  - SHORT/OVER 결투 후에는 추가 pending load 없이 shaking으로 전환된다.
  - 매치 종료 시 `winner_id`, `turn_count`, `events_hash`를 만들 수 있다.

완료 기준:

- Defold 화면 없이 순수 Lua 테스트에서 한 라운드가 `setup -> shaking -> bidding -> dualing -> shaking`으로 돈다.
- reducer는 입력 state를 직접 mutate하지 않고 다음 state를 반환한다.

### Phase 2. Core 인프라와 composition root

추가/수정 파일:

- `play/game/core/event_bus.lua`
- `play/game/core/i18n.lua`
- `play/game/core/cosmetics.lua`
- `play/game/core/anchors.lua`
- `play/game/core/tween.lua`
- `play/game/core/audio.lua`
- `play/game/core/gestures.lua`
- `play/game/net/match_adapter.lua`
- `play/main/main.script`

구현 작업:

- `main/main.script`를 composition root로 리팩터링한다.
  - bridge install.
  - store 생성.
  - event_bus 연결.
  - director 부팅.
  - input focus 획득.
- `match_adapter.lua`
  - `START_MATCH` payload를 `match.init` 액션으로 변환.
  - 개발용 mock players를 생성할 수 있는 fallback 제공.
  - `SUBMIT_MATCH_RESULT` payload 생성.
- `i18n.lua`
  - locale json 로드.
  - `t(key, params)` 제공.
  - 누락 키는 개발 중 식별 가능한 fallback 문자열로 표시.
- `cosmetics.lua`
  - `diceSkin`, `cupSkin` 기본값 처리.
  - 현 assets 디렉토리 기준 최소 스킨 경로 해석.
- `event_bus.lua`
  - topic별 subscribe/unsubscribe/publish.
  - store 변경 시 `match`, `turn`, `bidding`, `players`, `duel`, `ui` topic 발행.

검증:

- Vue에서 `START_MATCH`를 보내면 Defold가 store를 초기화하고 `MATCH_READY`를 emit한다.
- `PING`/`PONG`, `SET_COSMETICS`/`COSMETICS_APPLIED` 기존 동작이 유지된다.
- non-web 실행에서는 bridge emit이 print fallback으로 동작한다.

완료 기준:

- `main.script`가 bridge message를 직접 게임 규칙으로 처리하지 않고 adapter/store로 위임한다.
- Defold 콘솔에서 mock match 초기화 로그와 현재 턴 상태를 확인할 수 있다.

### Phase 3. Director와 화면 전환 골격

추가 파일:

- `play/game/director.script`
- `play/background/background.script`
- `play/ui/turn_indicator/turn_indicator.gui`
- `play/ui/turn_indicator/turn_indicator.gui_script`
- `play/ui/common/button.gui`
- `play/ui/common/dice_face.gui`
- `play/ui/common/badge.gui`

구현 작업:

- director
  - store topic 구독.
  - `turn.kind` 변화에 맞춰 active block 전환.
  - `bg_location`과 background pan 요청.
  - `cylinder_target()` 계산을 overlay에 전달.
- background
  - `bidding`: 풍경 상단 위치.
  - `shaking`, `dualing`: 테이블 하단 위치.
  - tween 기반 이동.
- turn indicator
  - `turn.mine`, `turn.opponent`, `turn.duel`, `turn.shake` locale key 사용.

검증:

- mock action으로 `turn.kind`를 바꾸면 배경 위치와 indicator label이 바뀐다.
- 화면 문자열이 locale key를 통해 나온다.

완료 기준:

- 실제 베팅 UI 없이도 `setup/shaking/bidding/dualing` 블럭 placeholder 전환이 가능하다.

### Phase 4. Shaking + Cylinder 세로 슬라이스

추가 파일:

- `play/ui/shake/shake.gui`
- `play/ui/shake/shake.gui_script`
- `play/ui/local_hud/local_hud.gui`
- `play/ui/local_hud/local_hud.gui_script`
- `play/ui/cylinder_overlay/cylinder_overlay.collection`
- `play/ui/cylinder_overlay/cylinder_overlay.script`

구현 작업:

- shake 입력
  - 모바일 touch drag, 데스크탑 space 입력을 `shake.roll`로 정규화.
  - 굴림 완료 후 dice 결과를 local HUD에 표시.
- cylinder overlay
  - 단일 인스턴스로 유지.
  - `hud`, `focal`, `offscreen` 앵커 사이 tween 이동.
  - pending load 상태에서 빈 슬롯만 입력 활성화.
- local HUD
  - 내 캐릭터, 힌트, dice tray, cylinder `hud` anchor 제공.

검증:

- 첫 shaking은 dice만 생성하고 추가 장전을 요구하지 않는다.
- 이후 shaking은 cylinder가 `focal`로 들어오고, 슬롯 선택 후 pending load가 해제된다.
- bidding turn에서는 cylinder가 `hud` 위치에 머문다.
- duel turn에서는 cylinder가 `offscreen`으로 이동한다.
- EXACT 결투 종료 후 previousBidder만 `pending_load(3, exact_duel)`이 생기고 cylinder가 `focal`로 등장한다.

완료 기준:

- `START_MATCH -> setup load -> shake.roll -> bullet.load -> bidding` 흐름을 Defold 안에서 수동으로 진행할 수 있다.

### Phase 5. Bidding UI 세로 슬라이스

추가 파일:

- `play/ui/player_carousel/player_carousel.gui`
- `play/ui/player_carousel/player_carousel.gui_script`
- `play/ui/bid_controls/bid_controls.gui`
- `play/ui/bid_controls/bid_controls.gui_script`
- `play/ui/rail/rail.gui`
- `play/ui/rail/rail.gui_script`

구현 작업:

- player carousel
  - 모든 플레이어를 순서대로 표시.
  - active player 강조.
  - hp/bullet badge 표시.
- bid controls
  - 내 턴일 때만 pass/challenge 표시.
  - face up/down 조작.
  - 현재 선택 bid가 유효할 때만 pass 활성화.
  - 이전 bid가 있을 때만 challenge 활성화.
- rail
  - 0..36 count 범위 중 visible window만 렌더링.
  - drag, scroll, arrow, keyboard left/right를 `bid.select_count`로 정규화.
  - recent bid marker 표시.

검증:

- count/face 조작 후 유효성 표시가 즉시 바뀐다.
- pass를 누르면 current bid와 active player가 갱신된다.
- pass 직후 해당 플레이어에게 pending load가 생기고 cylinder가 장전 가능한 상태가 된다.
- challenge를 누르면 추가 장전 없이 duel turn으로 이동한다.

완료 기준:

- 최소 2인 mock match에서 여러 차례 bid.raise 후 challenge까지 진행할 수 있다.

### Phase 6. Duel 판정과 전투 연출

추가 파일:

- `play/ui/duel/duel.gui`
- `play/ui/duel/duel.gui_script`
- `play/ui/duel/duel_sequence.lua`

구현 작업:

- duel 진입
  - 모든 플레이어 dice 공개.
  - bid face 실제 개수 집계.
  - SHORT/OVER/EXACT label 표시.
- SHORT/OVER
  - 차이 수만큼 `roulette` step 생성.
  - `roulette_subject_id`를 기준으로 실린더 장전 슬롯과 회전 위치에 따라 hit/miss 계산.
  - `SHORT`는 도전자, `OVER`는 직전 콜러가 `roulette_subject_id`가 된다.
  - UI 문구와 sequence payload도 "shooter가 target을 쏨"이 아니라 "roulette subject가 판정받음"을 기준으로 작성한다.
  - hp 감소와 사운드/이펙트 동기화.
- EXACT
  - previous bidder를 맞춘 사람/actor(A)로 설정.
  - 도전자부터 순서대로 6번의 target(B) interaction을 만드는 PerfectDuel state machine 구현.
  - EXACT step은 `actor_id`, `target_id`, `actor_choice`, `target_choice`, `hit/miss/consume`를 가진다.
  - 첫 버전은 자동 선택 기본값으로 통과시키고, 후속 polish에서 선택 UI를 강화한다.
- round reset
  - 생존자 확인.
  - 매치 종료면 `SUBMIT_MATCH_RESULT`.
  - 계속 진행이면 `shaking`으로 복귀.
  - EXACT verdict이면 previousBidder에게 `pending_load(3, exact_duel)` 설정 → 3발 충전 완료 후 shaking.
  - SHORT/OVER verdict이면 추가 장전 없이 바로 shaking.

검증:

- 부족/초과/정확 판정이 rules 테스트와 화면 결과에서 일치한다.
- SHORT 화면/sequence에서 도전자가 roulette subject로 표시된다.
- OVER 화면/sequence에서 직전 콜러가 roulette subject로 표시된다.
- EXACT 화면/sequence는 actor/target interaction으로 표시되고 SHORT/OVER의 roulette subject 모델과 섞이지 않는다.
- hp가 0이 된 플레이어는 이후 turn order에서 제외된다.
- winner가 1명 남으면 result payload가 bridge로 emit된다.

완료 기준:

- mock match를 시작해서 승자 발생과 `SUBMIT_MATCH_RESULT` emit까지 한 판을 끝낼 수 있다.

### Phase 7. Vue wrapper 통합

수정 대상:

- `shared/protocol/game-bridge.ts`
- `web/src/play-wrapper/gameBridge.ts`
- `web/src/play-wrapper/DefoldCanvas.vue`
- `web/src/custom-game/CustomGameScreen.vue`
- `play/main/game_bridge.lua`

구현 작업:

- 공유 protocol 타입에 Defold에서 실제 사용하는 payload를 반영한다.
- Vue wrapper에서 mock/custom game 설정을 `START_MATCH` payload로 보낸다.
- Defold `MATCH_READY`, `SUBMIT_MATCH_RESULT`, `UNKNOWN_MESSAGE`를 화면/로그에서 확인 가능하게 한다.
- play build 산출물을 web에서 로드하는 기존 복사 스크립트 흐름을 확인한다.

검증:

- `web` dev server에서 Custom Game 진입 시 Defold가 match를 시작한다.
- match 종료 payload가 Vue로 돌아온다.
- 브릿지 메시지 type이 `shared/protocol/game-bridge.ts`와 불일치하지 않는다.

완료 기준:

- 웹 래퍼에서 플레이 시작, Defold 매치 진행, 결과 수신까지 end-to-end로 확인된다.

### Phase 8. UX polish, assets, QA

작업:

- locale 정리
  - `play/assets/locale/ko.json`
  - `play/assets/locale/en.json`
  - `play/assets/locale/ja.json`
- asset 매핑 정리
  - dice, cup, rail, bg, portrait 기본 스킨.
- 사운드 훅
  - click, shake, load, click-empty, shot, hit, miss.
- 반응형 레이아웃
  - 모바일 portrait 기준.
  - 데스크탑 web canvas 기준.
- QA 시나리오
  - 시작 직후 setup 3발 장전.
  - 첫 shaking.
  - bidding pass 장전.
  - challenge 무장전.
  - SHORT duel: 도전자가 roulette subject.
  - OVER duel: 직전 콜러가 roulette subject.
  - EXACT PerfectDuel → 맞춘 사람 3발 충전 → shaking.
  - SHORT/OVER duel → 바로 shaking(1발 장전 규칙).
  - 플레이어 탈락.
  - 매치 종료.
  - locale 전환.
  - cosmetics fallback.

완료 기준:

- 주요 턴에서 UI 요소가 겹치지 않는다.
- 모든 노출 문자열은 locale key를 통해 나온다.
- 기본 스킨이 없거나 잘못된 skin id가 와도 fallback으로 플레이 가능하다.

## 5. 권장 작업 순서

현재 구현은 Phase 1-2 도메인/store/bridge가 먼저 올라와 있고, 화면은 E2E QA에 필요한 HUD가 부족한 상태다. 이후 순서는 `turn.kind`가 아니라 `flow.phase`를 기준으로 고정한다.

1. Phase HUD 계약 정리.
   - 대상 phase: `revolver_reload`, `cup_shake`, `dice_check`, `bidding_gap`, `bidding`, `duel`, `complete`.
   - 각 phase에서 켜질 GUI/component와 turn indicator 문구를 명시한다.
   - 구조 원칙: 최종 visibility 책임은 director가 가진다. 개별 GUI가 root visibility를 직접 결정하는 임시 코드는 HUD가 안정된 뒤 정리한다.
2. `revolver_reload` HUD 먼저 구현.
   - `setup`: 초기 장전.
   - `bid`: 방금 입찰한 플레이어 장전.
   - `exact_duel`: 정확 판정 보상 장전.
   - 필수 표시: 장전 대상 player, 남은 장전 수, clickable cylinder 안내, 완료 후 다음 phase.
3. Shake / Dice Check HUD 정리.
   - `cup_shake`: `player_carousel`의 반원 player arc와 `shake.gui`의 플레이어별 컵 표시, 흔들기 진행도.
   - `dice_check`: 로컬 컵 상승, 내 주사위 공개와 하단 트레이, 확인 입력.
   - `bidding_gap`: 입찰 시작 전 짧은 대기 안내.
   - 캐릭터와 컵은 `ui/common/table_seat_layout.lua`의 플레이 인원별 반원 좌석 배치를 공유한다.
   - 기존 world `/cup`은 제거하고 컵 visual 소유권을 `shake.gui`로 일원화한다.
4. Bidding HUD 완성.
   - rail, count/face 선택, 넘기기/pass, 결투신청/challenge.
   - 현재 bid, 직전 caller, 현재 player 표시.
   - 실제 제품 UI는 local turn만 직접 조작한다. dev-controlled opponent 조작은 QA CLI/adapter로 격리한다.
5. Duel HUD 구현.
   - verdict: SHORT / OVER / EXACT.
   - attacker/target 또는 roulette subject 표시.
   - damage count, russian roulette step, resolve/advance.
6. Result HUD 구현.
   - winner, match result payload, restart/dev reset 명령.
7. QA CLI 정리.
   - `state`, `advance`, `bidding`, `reload`, `shake`, `bid 6 3`, `challenge`, `resolve`.
   - status file은 유지한다.
   - UI script 안의 dev 조작 권한은 CLI/adapter로 이동한다.
8. 구조 청소.
   - director 단일 visibility 책임 복원.
   - `state.match.mode == "dev"` 분기는 view에서 제거.
   - QA hotkey/input binding은 실제 UX로 남길 것만 보존한다.
   - carousel asset mapping은 cosmetics/asset registry 쪽으로 이동한다.
9. Phase 7 Vue wrapper end-to-end.
10. Phase 8 polish와 QA.

이 순서를 지키면 화면 구현 중 규칙 변경이 생겨도 `rules/*`와 reducer 테스트에서 먼저 확인할 수 있고, Defold GUI는 store selector를 보는 얇은 레이어로 유지된다.

## 6. 주요 리스크와 대응

- Defold Lua 테스트 실행 환경이 애매할 수 있다.
  - 대응: 규칙 모듈은 Defold API를 쓰지 않게 유지하고, 로컬 Lua runner를 얇게 둔다.
- GUI와 GO 좌표계가 섞이면서 cylinder anchor 계산이 흔들릴 수 있다.
  - 대응: `anchors.lua`가 좌표 변환의 단일 진입점이 되게 하고, view는 anchor 이름만 요청한다.
- PerfectDuel 선택지가 초기 구현에서 과하게 복잡해질 수 있다.
  - 대응: Phase 6에서는 state machine과 자동 기본 선택으로 먼저 완주시키고, 선택 UI는 polish 단계에서 강화한다.
- 브릿지 payload가 Vue와 Defold에서 따로 변할 수 있다.
  - 대응: `shared/protocol/game-bridge.ts`를 기준으로 message type과 payload 이름을 맞춘다.
- 스킨/아트 경로가 초기 구현을 막을 수 있다.
  - 대응: `cosmetics.lua`에서 항상 default asset으로 fallback한다.

## 7. 첫 번째 구현 PR의 추천 범위

첫 PR은 Phase 1과 Phase 2 일부까지만 포함하는 것이 좋다.

포함:

- `game/model/**` 순수 Lua 도메인.
- 액션, reducer, selector, rules.
- 최소 test runner와 핵심 규칙 테스트.
- `game/core/event_bus.lua`.
- `game/net/match_adapter.lua`의 START_MATCH 변환.
- `main.script`의 store 초기화 연결.

제외:

- Defold GUI 대량 추가.
- duel animation.
- Vue wrapper 변경.
- polish asset 작업.

이 범위로 먼저 병합하면 이후 화면 작업은 안정된 상태/액션 계약 위에서 진행할 수 있다.
