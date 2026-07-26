이 문서는 `Custom Game`(공방)까지 실행 가능한 단계에 도달하기 위한 Roadmap임.

리팩토링 계획, 개발 원칙, skill 정비, 진행 우선순위의 근거는 [REVIEW.md](REVIEW.md)에 정리한다. 이 문서는 Phase별 목표/작업/진행 상태의 SSOT로 유지한다.

Opponent Controller 사용 절차는 [shared/docs/OPPONENT_CONTROLLER.md](shared/docs/OPPONENT_CONTROLLER.md)에 별도 runbook으로 정리한다.

---

진행 상태 (2026-07-26, bidding 가독성 / bot raise variation):

- carousel과 결투 HUD의 생존자는 portrait와 HP/탄환 indicator를 alpha 1.0으로 표시한다. 탈락자는 portrait와 두 indicator만 alpha 0.5로 낮추며, 치명타 연출에서는 표시 HP가 0이 되는 시점에 함께 전환한다.
- gameplay bot은 seeded personality 값을 사용해 직전 count에서 1–3칸을 올린다. 같은 revision/seed에서는 deterministic하고 aggression/bluff/randomness가 큰 profile일수록 큰 raise 확률이 높다.
- local 입찰 버튼은 유효한 face 변경만으로 활성화되지 않는다. 직전 입찰보다 rail count가 실제로 한 칸 이상 올라간 뒤에만 활성화된다.
- 검증: Convex domain 26/26, Defold Lua 49/49, Ladder 19/19, Custom Game 3/3, Vue production build, release HTML5 bundle/sync freshness check, `phase4:deploy`, `phase4:check` 통과.
- 다음 리팩터링 착수 순서와 완료 gate는 [REVIEW.md](REVIEW.md)에 고정했다. 첫 wave는 command boundary validator와 admin claim 축소이며, 이후 capability 전달과 versioned bridge coordinator를 진행한다.

진행 상태 (2026-07-26, Custom Game 명시적 bot composition):

- Custom Game 방 생성 시 기본 bot 3명을 자동 삽입하던 fallback을 제거했다. 새 방은 방장 1명으로 시작하며 host의 `봇 추가` 버튼 click마다 enabled gameplay catalog에서 아직 없는 bot 한 명을 빈 좌석에 추가한다.
- bot 추가는 `addMyCustomGameOpponent` transaction이 room ownership/composing 상태, 6인 상한, enabled catalog와 중복 identity를 검증한다. 이미 human이 차지한 player id/seat는 건너뛰며 추가된 bot은 ready 상태로 들어가 기존 `server_bot` 승격·match start 계약을 그대로 사용한다.
- `shared/custom-game/composition.ts`에 6인 구성 계획을 공용화하고 빈 방, human 좌석 충돌, catalog 소진/6인 상한을 3개 focused test로 고정했다. `ko`/`en`/`ja` 버튼·상태 문구를 추가했다.
- 검증: `custom-game:test`, Convex typecheck/codegen, Vue production build, `phase4:deploy`, `phase4:check`를 통과했다. 인증 브라우저 `http://localhost:5173/play/custom-game`에서 새 방 1/6, bot 1명씩 추가, 6/6에서 버튼 disabled, 추가된 5 bot으로 `/play/dev?matchId=...` handoff를 확인했다.

진행 상태 (2026-07-26, gameplay bot bidding pacing / observer sync):

- 서버 bot의 `bid.raise`/`bid.challenge` 결정만 별도 사고 구간으로 분류해 1.8–4.2초의 deterministic delay를 적용했다. Shake/check/reload 같은 routine action의 기존 profile reaction 값은 유지한다.
- `bidding` HUD는 상대 턴에도 비활성 controls를 표시하고, 주사위와 rail은 speculative local draft 대신 authoritative `current_bid`를 표시한다. 상대 입찰이 승인되면 모든 구독자에게 같은 count/face가 보인다.
- 다음 local turn의 draft는 서버가 제안한 다음 raise가 아니라 직전 `current_bid`의 count/face에서 시작한다. 사용자가 여기서 count 또는 face를 올려 legal raise를 만든다.
- 검증: Convex domain 24/24, Defold Lua 46/46, release HTML5 observer fixture를 통과했다. 인증된 4인 Custom Game에서 local `1×2` 입찰부터 첫 bot 입찰까지 2.923초 간격과 상대 턴 disabled controls/face 2 표시를 확인했다.

진행 상태 (2026-07-26, parameterized gameplay bot runtime):

- QA용 수동 virtual opponent와 실제 플레이용 server bot을 `matchParticipants.controlMode` (`human` / `qa_manual` / `server_bot`)로 분리했다. `/admin/opponents`와 admin mutation은 QA env gate 뒤에서만 열리며 `server_bot` command를 대신 제출할 수 없다.
- `botProfiles`에 strategy key/version, difficulty, 기준 MMR, reaction 범위와 honesty/aggression/bluff/challenge/risk/skull/caution/randomness parameter를 저장한다. 매치 참가 시 profile/version/parameter를 participant row에 고정해 진행 중 tuning 변경이 기존 매치를 바꾸지 않는다.
- 서버 bot은 자신에게 허용된 private 정보와 public 정보만으로 observation을 만들고, reducer가 제공한 legal capability 안에서 load, shake, check, bid, challenge 중 하나를 deterministic seed로 고른다. Convex internal scheduler는 match revision/phase/epoch guard를 확인한 뒤 기존 authoritative `applyMatchCommand` 경로로 한 command씩 제출한다.
- Custom Game의 선택된 virtual opponent는 자동 ready이며 Start 시 `casual` server bot participant가 된다. 사람은 Opponent Controller 없이도 bot 3명과 실제 매치를 시작할 수 있다.
- Ladder는 6 human을 우선해 40초 동안 기다리고 45초 hard max를 유지한다. 2–5 human으로 시작 결정을 내리면 현재 roster를 gameplay bot으로 6명까지 채우며 bot 혼합 match는 `casual`/unrated, 6 human match만 `ranked`다. Bot은 fake queue entry로 넣지 않는다.
- schema 변경은 optional widen-only여서 backfill 없이 legacy participant/catalog row를 기본값으로 dual-read한다. `botProfiles.by_virtual_opponent`, `botProfiles.by_enabled_and_base_mmr` indexes를 사용하며 queue/profile scan은 추가하지 않았다.
- 검증: Convex domain 24, Ladder 19, Defold Lua 46 tests와 Vue production build, `convex:typecheck`, `phase4:deploy`, `phase4:check`를 통과했다. 인증된 Custom Game에서 3 server bots가 controller 없이 `shake.complete`와 `dice.check`를 제출하는 것을 command log로 확인했고, Ladder waiting/cancel을 1440×900 및 375×812에서 확인했다. Production Ladder bot-fill은 두 authenticated human 세션이 필요한 경로여서 policy/domain test까지 확인했으며 실제 multi-user match-found E2E로 과장하지 않는다.
- 운영/QA 절차: [shared/docs/GAMEPLAY_BOTS.md](shared/docs/GAMEPLAY_BOTS.md), [shared/docs/OPPONENT_CONTROLLER.md](shared/docs/OPPONENT_CONTROLLER.md), [shared/docs/LADDER_QA.md](shared/docs/LADDER_QA.md).

진행 상태 (2026-07-24, Ladder 탈락/결과 HUD 및 Elo 집계):

- 결투에서 실제 탄환이 소모된 다음 라운드 순서를 서버/Defold 양쪽에서 `즉시 재장전 → 전원 shake → 패 확인`으로 교정했다. 재장전이 필요 없는 결투는 곧바로 shake로 진행하며, TypeScript/Lua parity test가 두 경로와 탈락자 다음 좌석 승계를 함께 고정한다. release HTML5 phase check에서도 `revolver_reload → cup_shake → dice_check`와 6초 shake timeout, console error 없음까지 확인했다.
- HTML5 엔진 로더를 프로젝트 `background.png` + `logo.png` 기반 custom CSS로 교체했다. Defold 기본 light-theme 배경/내장 SVG 대신 빌드 전 원본을 web bundle resource로 자동 복사하며, release bundle/sync와 지연 로딩 브라우저 캡처에서 두 asset 200 응답 및 console error 없음을 확인했다.
- authoritative reducer가 탈락 순서를 기록해 탈락 즉시 확정 가능한 등수를 public snapshot의 `match.result`로 내보낸다. 최종 생존자가 정해지면 전체 1–6위 결과를 확정한다.
- ranked match 완료 transaction에서만 `ladderStats`와 `matchParticipants`에 placement/MMR을 한 번 기록한다. Elo는 시작 rating을 고정한 pairwise-average 방식(K=32, scale=400)이며 `matches.ratingAppliedAt`으로 중복 반영을 막는다. dev/virtual-opponent match는 unrated다.
- Defold `result` HUD를 추가했다. 1위는 locale별 승리/축하 문구와 금색 plaque, 2–3위는 은색, 4–6위는 동색 plaque를 사용한다. Elo reel은 이전 점수를 0.5초 유지한 뒤 ease-in-out으로 움직이고, 변화량 절댓값 8 이하는 0.75초, 96 이상은 4초, 사이는 정규화 sigmoid duration을 사용한다.
- 로컬 플레이어가 탈락하면 진행 중 gameplay 위에 결과 HUD가 즉시 뜬다. `로비로 나가기`는 `EXIT_TO_LOBBY` GameBridge 이벤트로 Vue wrapper의 기존 back 흐름을 사용하고, `관전하기`는 같은 authoritative snapshot subscription과 Defold instance를 유지한 채 HUD만 닫는다. 실제 match complete snapshot이 오면 최종 Elo 결과 HUD가 다시 열린다.
- HTML5의 캔버스 focus가 관전 뒤 바뀌어도 버튼이 동작하도록 bridge의 정규화된 `DOM_POINTER`를 result HUD로 라우팅하고 로비 handoff는 one-shot으로 보호했다. Defold locale 전체 글리프도 font character set에 포함했다.
- result의 `deactivate`가 공용 `/ui` game object input focus를 해제해 shake Space/drag와 bidding keyboard 입력을 막던 회귀를 수정했다. 개별 result component는 focus를 소유하지 않으며 `html5-shake-input-check.mjs`가 실제 Space 5회 → gauge 100 → `shake.complete`를 검증한다.
- 검증: Convex domain/Ladder/Lua focused tests, release HTML5 bundle/sync, 1280×720 및 375×812 standalone dev result fixture에서 탈락 선택 → 관전 → 최종 승리 reel → `EXIT_TO_LOBBY`를 확인했다. fixture는 production matchmaking/rating write 검증이 아니다.

진행 상태 (2026-07-23, gameplay / web SFX):

- 제공된 SFX 원본을 `play/art-source/sounds/sfx/`에 보존하고 Defold용 16-bit PCM WAV + `.sound` 리소스를 `play/assets/sounds/sfx/`에 추가했다.
- Defold bootstrap의 `/audio` game object와 `game/core/audio.lua` façade를 연결했다. 시작 종, shake/확인, 장전/마지막 장전, 결투 miss/hit, 승리/비승리 종료 음을 각 authoritative state/연출 시점에 재생한다. `drop`은 Space 입력이 아니라 컵이 올라가 실제 패가 보이는 `dice_check` phase 진입에 재생한다.
- `audio_events.lua`가 이전/현재 snapshot을 비교해 start/result/reload/dice reveal cue를 한 번만 생성한다. 마지막 pending bullet은 `reload` 대신 `clasp`, 완료된 match refresh는 종료 음을 다시 재생하지 않는다.
- 결투 전 패 공개의 컵 아래 주사위도 shake 결과와 동일한 `a1`–`a5` table angle을 사용한다. 판정 grid와 하단 패 목록은 판독용 `a0`를 유지한다.
- 결투 집행 일러스트를 고정 previous/challenger 순서가 아니라 resolution 역할 기준으로 정렬했다. 일반 결투는 왼쪽 공격자/오른쪽 피격자이며 SHORT와 OVER의 방향이 화면에서도 authoritative `shooterId`/`targetId`와 일치한다.
- `buttonClick`은 Defold bidding controls와 Vue SPA의 enabled button activation 양쪽에서 사용한다. Vue는 짧은 4-slot audio pool로 빠른 연속 클릭도 처리한다.
- 검증: release HTML5 bundle/sync, Convex 18 + Ladder 17 + Lua 41 tests, Vue production build를 통과했다. dev-only HTML5 phase harness의 `duel_reveal`/`duel_combat` checkpoint와 screenshot에서 컵 아래 angled dice, 정면 grid/tray, 역할 기준 결투 일러스트, 빈 canvas/asset 오류 없음도 확인했다.

진행 상태 (2026-07-19, web background music):

- SPA 전역 background music controller를 추가했다. lobby/custom game/Ladder 대기·roster/admin/auth 화면은 `lobby_1`/`lobby_2`, 실제 `ConvexPlayScreen`·local play wrapper는 `battle_1`/`battle_2`를 순서대로 반복한다.
- 화면 모드 전환과 좌하단 music toggle은 650ms ease-in/out fade를 사용한다. 토글 상태는 localStorage에 유지하며, 브라우저 autoplay 차단 시 첫 pointer/keyboard 입력으로 재생을 다시 시도한다.
- 비동기 fade에는 generation guard를 적용해 빠른 화면 전환이나 unmount가 이전 곡을 다시 활성화하거나 중복 재생하지 않게 했다.
- `en`/`ko`/`ja` 접근성 label을 추가했다. 브라우저 QA에서 lobby/battle 음원 요청, 토글 persistence, play wrapper 전환을 확인했다.
- Ladder production matchmaking은 6인 구성을 우선하기 위해 2–5인 partial roster의 최소 대기를 10초에서 40초로 늘렸다. 6인은 즉시 시작하고, 40초 이후에만 arrival-rate projection을 적용하며 45초에는 hard start한다.
- Opponent Controller Ladder QA도 1.5초 click debounce 대신 player 입장 기준 40초 동안 bot 추가를 받도록 맞췄다. Human + bot 6명은 즉시 시작하고 2–5명은 40초 시점에 확정한다.
- 인증된 Chrome QA에서 fresh player + bot 1명은 3초 뒤에도 searching을 유지했고, bot을 총 5명까지 채우자 6인 roster가 즉시 생성되어 단 한 번 handoff됐다. 같은 match를 `dice_check`까지 진행해 새 HTML5 bundle의 2열/3열 reveal dice 위치와 앞뒤 순서가 에디터 GUI대로 반영된 것도 확인했다.
- Defold editor가 만든 최신 bundle을 `web/public/play`로 다시 sync했다. source/output `CylinderDicer_wasm.js` SHA-256 일치와 freshness check를 확인했다.

진행 상태 (2026-07-17, local shake gauge / timeout / font):

- Defold shake 입력을 서버 `shake.roll` 누적에서 보이지 않는 0–100 local gauge로 변경했다 (`+24/input`, `-12/second`, bounded). 100에서 `shake.complete`를 한 번만 제출하며 숫자나 bar는 HUD에 표시하지 않는다.
- Convex와 local simulator에 phase 진입 기준 6초 `shake.timeout`을 추가했다. 부분 완료 revision으로 타이머를 재시작하지 않고 미완료 생존 플레이어만 자동 roll/완료한다.
- Opponent Controller의 bot shake는 `Complete Shake` 한 번으로 즉시 checkpoint를 제출한다.
- gameplay GUI 공통 폰트를 OFL `NotoSerifCJKkr-SemiBold` distance-field resource로 교체해 한·영·일 HUD glyph를 포함했다.
- Convex domain/Lua tests에 gauge bounds/decay, one-shot capability, partial completion, phase-wide timeout parity를 추가했다.
- Web locale 선택을 `SET_LOCALE` / `LOCALE_APPLIED` GameBridge 계약으로 Defold HTML5 HUD까지 전달한다. `en` / `ko` / `ja`만 허용하며 현재 phase를 유지한 채 인게임 문자열을 다시 렌더한다.

좋아. 나는 이 roadmap을 “플레이 가능한 vertical slice를 먼저 만들고, 그 다음 admin/opponent, 그 다음 dirty code 정리, 마지막에 custom game asset pipeline 완성” 순서로 잡는 게 맞다고 봐. 멀티플레이어 게임은 너무 빨리 정리부터 하면 기준점이 사라져서, 먼저 실제 한 판이 돌아가는 뼈대를 세우는 쪽이 안전해.

## Roadmap

### Phase 0. 기준선 고정

목표: 리팩토링 중 무엇이 깨졌는지 판단할 기준 만들기.

작업:

- 현재 Defold local simulator가 통과하는 테스트 기록.
- Convex domain reducer smoke test를 정식 테스트 파일로 이동.
- “한 판 플레이 가능”의 최소 시나리오 정의:
  - match 생성
  - setup load
  - shake complete
  - dice check
  - bidding
  - challenge
  - duel execute
  - round advance
  - 다음 round 진입

완료 기준:

- `npm run convex:typecheck`
- `cd web && npm run build`
- Convex reducer/domain test 통과
- 기존 Lua model test 통과

---

### Phase 1. Convex 배포/코드젠 준비

목표: 실제 Convex deployment와 generated API를 붙인다.

작업:

- root Convex 설정 확정:
  - `package.json`
  - `convex/`
  - `convex/auth.config.ts`
  - `convex/schema.ts`
- `.env.local` 준비:
  - `web/.env.local`
  - Convex deployment env의 `CLERK_JWT_ISSUER_DOMAIN`
- `npx convex dev` 실행.
- `convex/_generated/api` 생성.
- `makeFunctionReference(...)` 임시 코드를 generated `api` 기반으로 교체.
- local Convex deployment 기준으로 dev/QA 연결.

완료 기준:

- `npx convex dev`가 schema/functions를 정상 인식.
- `convex/_generated/` 생성.
- Web에서 Convex mutation/query 호출 가능.
- Clerk 로그인 사용자가 Convex `users` row로 매핑됨.

---

### Phase 2. 비용 안전형 match backend 완성

목표: 문서에 맞춘 서버 권위형 구조를 실제로 안정화.

이미 일부 완료된 방향:

- `matchParticipants`
- `matchStates`
- public view / private delta 분리
- `shake.complete`
- `matches.collect()` 제거

추가 작업:

- `submitMatchCommand`에 payload size guard 추가.
- `matchCommands` retention 설계:
  - dev match는 짧게
  - ranked/casual은 replay window 이후 compact
- `matchEvents` compaction mutation 추가.
- complete match 처리 시 participant status 갱신 검증.
- stale revision 처리 정책 확정:
  - 현재는 strict reject
  - 필요하면 latest snapshot 반환 포함

진행 상태 (2026-06-30):

- 완료: `submitMatchCommand` command id/payload size guard.
- 완료: `matchCommands`/`matchEvents` retention용 `expiresAt`와 index.
- 완료: host-only `compactMatchLogs` mutation.
- 완료: complete match 시 participant status 갱신 후 검증값 반환.
- 완료: stale revision reject에 latest public snapshot/private delta 포함.
- 완료: frontend service에서 compaction mutation을 generated API registry로 노출.

완료 기준:

- 매 command당 write 수가 제한적임.
- private delta가 public snapshot을 복제하지 않음.
- lobby/match list가 index 기반.
- high-frequency input이 Convex mutation으로 직접 가지 않음.

---

### Phase 3. Web ↔ Convex ↔ Defold 플레이 루프 연결

목표: 실제 브라우저에서 한 판 플레이 가능.

작업:

- `web/src/services/convex/matchService.ts`
  - generated `api` 사용
  - `createDevMatch`
  - `submitCommand`
  - `subscribePublicView`
  - `getPrivateDelta`
- Vue 쪽에서 public view + private delta merge.
- Defold로 `SERVER_SNAPSHOT` 전달.
- Defold는 local reducer 대신 server snapshot render cache를 우선 사용.
- Defold input은 `PLAYER_COMMAND`만 emit.
- local simulator는 dev flag 뒤로 이동:
  - `VITE_USE_LOCAL_DEFOLD_SIMULATOR=true`
  - Convex path와 분리

진행 상태 (2026-06-30):

- 완료: `matchService`가 generated `api` registry 기반으로 `createDevMatch`, `submitCommand`, `subscribePublicView`, `getPrivateDelta` 제공.
- 완료: Vue `ConvexPlayScreen`에서 Clerk auth token을 Convex client에 연결하고 dev match 생성/재사용.
- 완료: public snapshot + private delta merge 후 `SERVER_SNAPSHOT`으로 Defold iframe에 전달.
- 완료: command reject를 `COMMAND_REJECTED`로 Defold에 되돌려 보내는 prop-driven bridge.
- 완료: Defold `match_adapter`가 `SERVER_SNAPSHOT`/`COMMAND_REJECTED`를 unknown 처리하지 않고 cache + ack.
- 완료: Defold semantic inputs가 `PLAYER_COMMAND`를 emit하도록 1차 연결.
  - `bullet.load`
  - `shake.complete`
  - `dice.check`
  - `bid.raise`
  - `bid.challenge`
- 완료: Convex Web 경로에서 semantic actions는 local reducer dispatch보다 `PLAYER_COMMAND`를 우선 사용.
  - local simulator가 아닐 때 `bid.raise`, `bid.challenge`, `bullet.load`, `setup.load_initial`, `dice.check`는 서버 command를 먼저 보낸다.
  - `shake.roll`은 local gesture/progress 표현용으로만 남고, 서버에는 `shake.complete`만 전송한다.
- 완료: `SERVER_SNAPSHOT`을 Defold local store에 투영해 HUD/players/turn/bidding/private dice/cylinder가 서버 snapshot으로 갱신됨.
- 완료: `VITE_USE_LOCAL_DEFOLD_SIMULATOR=true`일 때 `/play/dev`가 Convex를 거치지 않는 local simulator route를 사용.
- 완료 (2026-07-10): phase progression ownership 리팩터링.
  - player/admin command는 `setup.load_initial`, `shake.complete`, `dice.check`, `bullet.load`, `bid.raise`, `bid.challenge` intent만 허용한다.
  - `bidding.open`, `bid.reload_timeout`, `duel.execute`, `round.advance`는 Convex internal scheduler가 phase/revision/flow epoch guard로 자동 실행한다.
  - standalone simulator는 `/game/flow_coordinator.script`가 같은 전환을 담당하며 shake/duel HUD와 director에서 progression command를 제거했다.
  - `/game/presentation.lua`가 HUD component/background/cylinder anchor descriptor의 단일 소스다.
  - `availableActions`는 `convex/match/capabilities.ts`에서만 계산하며 automatic transition은 노출하지 않는다.
  - 검증: `phase0:test`, `phase4:deploy`, `phase4:check`, release HTML5 bundle, full-round HTML5 checker(reload → 6 shakes → bidding → challenge reveal → combat → next round) 통과.
- 완료 (2026-07-12): SHORT/OVER 공격 소유권 교정.
  - `SHORT(actual < bid)`는 challenge가 성공한 것이므로 challenger가 previous bidder에게 차이만큼 격발한다.
  - `OVER(actual > bid)`는 challenge가 실패한 것이므로 previous bidder가 challenger에게 차이만큼 격발한다.
  - resolution은 `shooterId`, `targetId`, `rouletteSubjectId`를 분리하며 공격자 실린더를 소모하고 피격자 HP만 감소시킨다. 실제 총알을 소모한 공격자가 즉시 재장전한 뒤 다음 shake를 시작한다.
- 완료 (2026-07-14): bidding 장전과 다음 입찰을 pipeline으로 전환.
  - 직전 입찰자가 1발을 장전하는 동안 다음 active player는 bidding HUD에서 다음 입찰을 제출할 수 있다. 장전이 먼저 끝나면 모두 bidding HUD를 유지한다.
  - 다음 입찰이 먼저 제출되면 추가 입찰/결투를 잠그고, 장전자는 3초 카운트다운, 다른 플레이어는 회전 실린더 loading HUD를 본다. `bid.reload_timeout`이 첫 빈 슬롯을 서버 권위로 자동 장전하고 후속 장전을 승격한다.
  - Convex scheduler와 standalone `flow_coordinator`가 같은 timeout을 소유하며 수동 장전이 먼저 반영되면 revision guard로 예약 timeout을 폐기한다.
  - 검증: Convex domain 15/15, Lua model 21/21, `phase0:test`, `phase4:deploy`, `phase4:check`, release HTML5 bundle/sync 및 focused Chrome 상태별 캡처 통과.
- 완료 (2026-07-26): bidding 입력 및 timeout 안전장치.
  - active bidding turn마다 40초 `bidding.timeout`을 Convex와 Defold local simulator가 함께 예약한다. 새 bid가 revision을 바꾸면 이전 timer는 폐기된다.
  - timeout 시 현재 수량보다 1 높은 Skull 입찰을 자동 제출해 입찰자 본인의 Russian roulette를 수행한다. 최대 수량에서는 reload 대기가 없을 때 challenge로 전환한다.
  - Custom Game의 `생성`은 host-only composing room만 만들며, bot은 `봇 추가`를 누른 횟수만큼만 참가한다. 초기 room 조회 중에는 생성 동작을 잠가 이전 started-room 응답과의 race를 막는다.
  - 결투 HUD의 탄환 수는 결투 시작 값에서 실제 탄환이 소비되는 연출 단계마다 감소하며, 서버가 이미 계산한 최종 탄환 수를 연출 시작부터 미리 표시하지 않는다.
  - bidding `Space` 입력을 추가하고 기존 `Enter`도 호환 유지했으며, `C` challenge 입력은 기존 action binding을 사용한다.
  - bid/challenge 버튼의 enabled/disabled 텍스트 노드를 제거하고 disabled 상태를 alpha 0.5로 표현한다.
  - 검증: Convex domain 25/25, Lua model 47/47, `phase0:test` 통과.
- 남음: local reducer 자체를 완전히 제거하는 장기 리팩터링. 현재 local store는 server snapshot render cache와 local animation/progress cache 역할을 겸한다.

완료 기준:

- 브라우저에서 match 생성 후 Defold 화면 진입.
- local player가 setup/shake/bid/challenge를 서버 command로 수행.
- 서버 snapshot이 Defold HUD를 갱신.
- Convex 경로의 semantic gameplay command가 서버 판정을 거쳐 진행됨.
- local reducer는 authoritative rule owner가 아니라 render/animation cache로 격하됨.

---

### Phase 4. Admin opponent controller

목표: 가상의 상대 플레이어를 만들고 조종할 수 있는 admin 기능.

구조:

```text
admin UI
  -> Convex admin mutation
  -> same match reducer
  -> public/private view update
  -> play client receives snapshot
```

작업:

- Clerk role/metadata 기반 admin guard 추가.
- `adminMatches.ts` 또는 `admin.ts` Convex 함수 추가:
  - `createDevMatchWithBots`
  - `listAdminDevMatches`
  - `getAdminMatchState`
  - `submitOpponentCommand`
- admin은 특정 opponent player를 선택 가능.
- 선택한 opponent의 `availableActions` 표시.
- admin command도 일반 reducer를 통과해야 함.
- admin action audit log 추가:
  - admin user id
  - target player id
  - command type
  - timestamp

중요 원칙:

- admin이 DB state를 직접 patch하지 않음.
- opponent 조작도 `submitMatchCommand`와 같은 reducer 경로 사용.
- production에서는 admin 기능을 role guard + dev/ranked 제한으로 묶음.

완료 기준:

- admin 화면에서 opponent 선택 가능.
- opponent의 현재 가능한 action 표시.
- opponent bid/challenge/load/shake/check 가능.
- play 화면과 admin 화면이 같은 Convex match state를 공유.

진행 상태 (2026-07-01):

- 완료: `convex/adminMatches.ts` 추가.
  - `createDevMatchWithBots`
  - `listAdminDevMatches`
  - `getAdminMatchState`
  - `submitOpponentCommand`
- 완료: Clerk JWT identity 기반 admin guard 1차 구현.
  - guard는 `role`, `roles`, `permission`, `permissions`, `org_role`, `organizationRole` 및 metadata류 nested object를 검사한다.
  - boolean admin flag류도 허용한다: `admin`, `isAdmin`, `is_admin`, `cylinderdicerAdmin`, `cylinderdicer_admin`.
  - 최소 Clerk Convex JWT template 예시:

```json
{
  "role": "admin"
}
```

  또는:

```json
{
  "roles": ["admin"]
}
```

- 완료: `adminAudit` table 추가.
  - 성공 command뿐 아니라 reject도 audit된다.
  - 현재 audit 대상 reject:
    - non-dev match
    - target player missing
    - target not bot
    - reducer reject
- 완료: `submitMatchCommand`와 `submitOpponentCommand`가 같은 `applyMatchCommand` 내부 helper를 사용하도록 refactor.
  - `applyMatchCommand`는 auth/actor가 이미 결정된 뒤 reducer/write path를 공유하는 내부 helper다.
  - 외부 호출자는 여전히 일반 유저는 `submitMatchCommand`, admin은 `submitOpponentCommand`를 써야 한다.
  - admin command는 `actorVirtualOpponentId`를 target virtual opponent로, `submittedByUserId`를 admin user로 기록한다.
  - `matchCommands.source`에는 `"admin"`이 저장된다.
- 완료: `/admin/opponents` route와 1차 admin UI 추가.
  - dev match list 조회.
  - virtual opponent 선택.
  - 선택된 virtual opponent의 private delta/availableActions 조회.
  - load/shake/check/open/bid/challenge/duel/round command 제출.
- 완료: generated Convex API registry에 `api.adminMatches.*` 노출.

중요한 현재 제한:

- non-participant human은 `/play/dev?matchId=...`로 observe/play 불가 (`MATCH_NOT_AVAILABLE`). 참가는 Custom Game invite join 또는 match participant row 필요.
- `submitOpponentCommand`는 dev match만 허용한다.
- target player는 virtual opponent participant여야 한다.
  - 판별은 `matchParticipants.virtualOpponentId` 존재 여부로 한다.
  - participant가 없으면 `TARGET_PLAYER_NOT_FOUND`.
  - target이 virtual opponent가 아니면 `TARGET_NOT_VIRTUAL_OPPONENT`.
- virtual opponent(bot)는 **Clerk 계정/JWT가 없다**.
  - Convex `virtualOpponents` row + `matchParticipants` + authoritative match state에만 존재한다.
  - `users` table은 human/Clerk identity 전용으로 유지한다.
  - bot용 Clerk user, bot용 JWT template, `users.clerkId = bot:*` synthetic user는 만들지 않는다.
  - bot command는 bot이 직접 로그인하지 않고, opponent controller entrypoint(`submitOpponentCommand`, `setCustomGameOpponentReady`)로만 대리 제출한다.
- `/admin/opponents` smoke check는 UI shell 200 확인 수준이다.
  - admin 권한 통과, command 제출, audit row 생성까지의 manual E2E는 Clerk admin claim이 있는 환경에서 `npm run phase4:check` 체크리스트로 검증한다.
- 배포 push는 `npm run convex:codegen`만으로 부족할 수 있다. **실제 push는 `npm run phase4:deploy` (`npx convex dev --once`)** 를 사용한다.
- `npm run phase4:check`가 live deployment에 admin 함수 존재 여부를 검증한다.

가장 중요한 미검증/보강 지점:

- `createDevMatchWithBots`는 admin user를 `local-player`로 하는 dev match를 만든다.
- 현재 `/play/dev`는 로그인한 현재 user 기준으로 `createDevMatch`/reuse를 수행한다.
- 따라서 “admin tab + play tab이 같은 match를 공유한다”가 자동 보장되지 않는다.
  - admin이 만든 match를 일반 play client가 볼 수 있는지 확인 필요.
  - 같은 match를 보려면 match id 공유 route나 명시적 selection이 필요할 가능성이 크다.
- 다음 작업 우선순위:
  - `/play/dev?matchId=...`
  - `/admin/opponents?matchId=...`
  - `ConvexPlayScreen`이 existing matchId를 받아 observe/use
  - 또는 admin UI가 current user's active dev match를 찾아 control

추가 진행 상태 (2026-07-01):

- 완료: `/play/dev?matchId=...` 1차 지원.
  - query param이 있으면 새 match 생성 대신 해당 match의 public snapshot/private delta를 읽고 subscription을 붙인다.
  - 현재 로그인 사용자가 match participant가 아니거나 match가 없으면 `MATCH_NOT_AVAILABLE` 상태를 보여준다.
  - non-participant observer 권한은 아직 열지 않았다.
- 완료: `/admin/opponents?matchId=...` 1차 지원.
  - query param을 초기 selected match로 사용한다.
  - admin match 선택 시 URL의 `matchId`를 갱신한다.
  - `Open Play` 버튼으로 같은 match를 `/play/dev?matchId=...` 새 탭에서 열 수 있다.
- 현재 same-match E2E는 “같은 로그인 사용자/admin이 그 match의 participant인 경우”를 우선 지원한다.
  - admin-created match는 admin user가 `local-player` participant이므로 같은 admin 계정의 play tab에서는 같은 match를 열 수 있다.
  - 별도 일반 user가 admin-created match를 observe/play하려면 Custom Game invite join 등으로 `matchParticipants` row가 필요하다 (spectator mode는 Phase 4 범위 밖).

추가 완료 (2026-07-01 Phase 4 close-out):

- 완료: `probeAdminAccess` query — admin claim 도달 여부를 UI/CLI에서 확인.
- 완료: `listRecentAdminAudit` query — match/room별 최근 audit 조회.
- 완료: `/admin/opponents` admin claim missing 배너 + Recent Admin Audit 패널.
- 완료: `npm run phase4:deploy` / `npm run phase4:check` scripts.
- 완료: live deployment function-spec 검증 (`adminMatches.*` 포함).
- 완료: match/room detail live subscription (Phase 5 UX와 공유, Phase 4 live-follow 요구 충족).

권장 manual E2E:

1. Clerk Convex JWT template에 admin claim 추가.
2. sign out/in 후 admin JWT가 새 claim을 포함하게 갱신.
3. `/admin/opponents` 진입.
4. `Create / Reuse` 클릭.
5. `/play/dev`도 같이 열기.
6. 두 화면이 같은 `matchId`를 보고 있는지 확인.
7. admin에서 opponent 선택.
8. 가능한 action 표시 확인.
9. opponent bid/challenge/load/shake/check 실행.
10. play tab HUD/snapshot 갱신 확인.
11. `adminAudit` row 생성 확인.
12. non-admin 계정에서 `UNAUTHORIZED` 확인.

Phase 4 완료 기준 (달성):

- admin 화면에서 opponent 선택 가능.
- opponent의 현재 가능한 action 표시.
- opponent bid/challenge/load/shake/check 가능.
- play 화면과 admin 화면이 같은 Convex match state를 공유 (`?matchId=...`).
- admin audit + access probe + deploy preflight script 존재.

Phase 4에서 의도적으로 미룬 것:

- non-participant spectator/observe mode.
- Phase 5+ automation layer.

---

### Phase 4.5. Custom Game opponent composition bridge

목표: `Custom Game` 화면의 placeholder/mock 가상 유저를 실제 Convex match participant/opponent 생성 흐름으로 승격한다.

현재 상태:

- `CustomGameScreen`의 room/player UI는 Convex virtual opponent catalog 기반으로 전환됐다.
- 화면에 보이는 가상 상대는 실제 Convex `virtualOpponents` row에서 로드된다.
- Start 후에는 실제 Convex `matches`, `matchParticipants`, authoritative match state와 연결된다.
- Phase 4에서 만든 opponent controller는 실제 Convex dev match의 `virtualOpponents` participant를 조작할 수 있지만, 아직 Custom Game의 room composition과 직접 연결되어 있지 않다.
- Phase 4.5 시작 상태:
  - `virtualOpponents` table을 추가했다.
  - `matchParticipants`는 human `userId` 또는 virtual `virtualOpponentId`를 가질 수 있다.
  - `matchCommands`/`matchEvents`는 `actorVirtualOpponentId`를 기록할 수 있다.
  - dev match 생성은 `ensureVirtualOpponent`로 Convex-only opponent profile을 보장한다.
  - `ensureDefaultVirtualOpponentsLoaded` / `listVirtualOpponents`로 Custom Game이 사용할 수 있는 Convex virtual opponent catalog 진입점을 열었다.
  - web service wrapper: `web/src/services/convex/virtualOpponentService.ts`.
  - old `bot:*` synthetic user 기반 active dev match는 새 reuse 경로에서 제외한다.
- 추가 진행 상태:
  - `createCustomMatchWithOpponents` mutation을 추가했다.
  - `CustomGameScreen`은 mock room/player service 대신 Convex virtual opponent catalog를 로드한다.
  - Custom Game에서 selected virtual opponents를 확인/토글할 수 있다.
  - `customGameRooms` / `customGameParticipants` schema를 추가했다.
  - Custom Game의 composition/ready 상태는 Convex room state에 저장된다.
  - Custom Game 화면은 ready 상태를 읽어 표시하지만, virtual opponent ready를 직접 변경하지 않는다.
  - opponent controller에서 selected virtual opponent별 ready/unready를 제출할 수 있다.
  - Start는 host + selected virtual opponents 전원이 Convex room state에서 ready 상태일 때만 가능하다.
  - Start는 선택된 room participants로 `createCustomMatchFromRoomParticipants`를 호출해 실제 Convex match + `matchParticipants` rows를 만든 뒤 `/play/dev?matchId=...`로 이동한다.
  - `web/src/services/mock/` Custom Game mock service를 제거했다.
- 2026-07-01 추가 완료:
  - **human guest join**: `joinCustomGameRoomByInviteCode`, `leaveMyCustomGameRoom`, `setMyCustomGameReady`.
  - invite code index + `customGameParticipants.by_user_status` index.
  - guest는 `guest-N` playerId로 room/match participant에 포함된다.
  - Start 시 room의 human guest + virtual opponent 전원을 match에 반영한다.
  - guest는 own ready toggle, host-only opponent selection/start.
  - Custom Game lobby: create room 또는 invite code join 선택.
  - started room은 guest/host 모두 subscription으로 `matchId` 확인 후 `/play/dev?matchId=...` 진입 가능.
  - `allReady`는 virtual opponent ready + human guest ready 모두 포함.
- 2026-07-02 추가 완료:
  - host opponent selection이 guest human participant row를 덮어쓰지 않도록 host participant upsert를 고정했다.
  - room participant cap을 host/guest/virtual 합산 기준으로 강제한다.
  - invite code lookup은 같은 code의 old room이 있더라도 composing room을 찾아 join한다.
  - custom room에서 promoted된 human guest는 match 시작 시 초기 실린더를 갖고 play 가능한 participant가 된다.
  - `dice.check`는 모든 생존 player가 own check를 제출해야 진행되며, virtual opponent check도 opponent controller가 제출할 수 있다.
  - Custom Game 화면 구조는 기존 room browser/host composition을 primary로 유지한다. Invite code join은 보조 entrypoint이며 화면 전체를 막는 gate가 아니다.
- 2026-07-03 추가 완료:
  - Custom Game 화면을 원래 흐름(`Create / Join / invite code / room list / ready / start`) 중심으로 복원했다.
    - 화면 내 bot 추가/선택 UI는 제거했다.
    - virtual opponent의 ready/조작은 Opponent Controller의 책임으로 분리했다 (Phase 5 계층과 일치).
  - `listComposingCustomGameRooms` query를 추가해 Custom Game lobby가 실제 composing room 목록을 표시한다.
  - Clerk Convex JWT가 준비되기 전에 Convex 호출이 나가던 auth race를 차단했다 (`convexAuthReady` gate).
  - Opponent Controller의 `Create / Reuse` 버튼을 `Create Dev Match`로 rename해 dev match 생성임을 명확히 했다.
  - audit query의 `db.patch is not a function` 버그를 수정했다.
  - 검증/배포 통과: `phase0:test`, `phase4:deploy`, `phase4:check`.

왜 Phase 5 전에 하는가:

- placeholder 유저를 실제 opponent participant로 만드는 작업은 bot AI 문제가 아니라 match composition/setup 문제다.
- Phase 5는 “이미 존재하는 virtual opponent participant를 opponent controller로 ready부터 플레이까지 QA 제어”를 다룬다.
- 따라서 Custom Game의 mock 상대를 실제 참가자로 만드는 작업은 Phase 4와 Phase 5 사이에 두는 것이 맞다.

구조:

```text
custom game room UI
  -> selected human/bot composition
  -> Convex custom/dev match creation mutation
  -> Convex virtualOpponents (no Clerk account, no users row)
  -> matchParticipants rows
  -> authoritative initial match state
  -> play route opens same matchId
  -> admin/opponent controller can inspect/control bot participants
```

identity 모델:

```text
human participant
  Clerk JWT -> Convex users (clerkId = Clerk subject) -> matchParticipants

virtual opponent (bot)
  no Clerk account
  -> Convex virtualOpponents (key/displayName/archetype)
  -> matchParticipants.virtualOpponentId
  -> same match reducer / snapshot / availableActions as humans
  -> commands via admin opponent controller (`submitOpponentCommand`, `setCustomGameOpponentReady`)
  -> (이후) automation layer가 같은 entrypoint를 대리 호출 (bot JWT login 없음)
```

작업:

- 완료: `CustomGameScreen`의 mock player/room 데이터를 Convex-backed room/match creation으로 교체했다.
- 완료: “bot 추가” 또는 placeholder opponent slot이 실제 `virtualOpponents` row + `matchParticipants.virtualOpponentId`로 이어진다.
- 완료: `createCustomMatchWithOpponents` mutation 추가.
  - 현재 입력:
    - local player name
    - `virtualOpponentKeys`
    - first player id
    - setup load flag
  - 이후 확장 입력:
    - invited human players
    - room/match mode
    - asset/rule selections
- 완료: custom game start flow가 생성된 `matchId`를 명시적으로 전달한다.
  - 현재: `/play/dev?matchId=...` 재사용
  - 이후: `/play/custom-game?matchId=...` 전용 route (Phase 7 전후)
- 완료: admin/opponent controller가 custom room composition + started dev match를 inspect/control.
- 완료: Custom Game room UI에서 host/guest/virtual opponent ready/status 표시.
- 완료: human guest invite-code join + match participant promotion.
- mock service 제거 완료.

중요 제한 (Phase 4.5 종료 시점):

- guest가 host room에 join하려면 host의 composing room invite code 필요.
- host는 active composing room 보유 중 다른 room join 불가 (`HOST_ROOM_ACTIVE`).
- match state의 stored `localPlayerId`는 host player 기준 유지. play client는 private delta의 `viewerPlayerId`로 각 browser의 local player를 overlay한다.
- dedicated `/play/custom-game?matchId=...` route, asset/rule selection, human kick은 Phase 7 전후.
- **bot이 host인 Custom Game room은 만들 수 없다 (설계 제약, 2026-07-03 확인).**
  - `customGameRooms.hostUserId`는 Clerk 기반 `users` row를 요구한다.
  - virtual opponent는 `virtualOpponents` 테이블에만 존재하므로 host가 될 수 없다.
  - 현행 모델은 의도적으로 “human host가 room을 만들고, opponent controller가 그 room의 bot을 ready/조종”이다.
  - 결정: 현행 human-host 모델을 유지한다. bot/system-owned room이 제품 요구로 확정되면 Phase 7 전후에 별도 ownership schema migration으로 처리한다 (선택지 비교는 [REVIEW.md](REVIEW.md) §1 참고).

중요 원칙:

- Custom Game UI가 직접 DB state를 patch하지 않는다.
- match 생성 payload는 Convex에서 검증한다.
- virtual opponent는 **Clerk 연동 없이 Convex participant로만** 존재해야 한다.
  - Clerk sign-up/sign-in, bot용 JWT template, bot Clerk user 생성은 하지 않는다.
  - `users.clerkId`는 human Clerk subject 전용으로 유지한다.
- bot/opponent participant 생성은 `ensureVirtualOpponent` + `matchParticipants` insert로 끝낸다.
- opponent controller와 bot automation은 human/bot 구분 없이 같은 participant model을 사용해야 한다.
- asset/rule preset은 Phase 7에서 완성하되, Phase 4.5의 creation payload는 나중에 asset selection을 받을 수 있게 확장 여지를 둔다.

완료 기준 (달성):

- Custom Game 화면에서 bot/opponent slot을 추가하거나 선택할 수 있다.
- human guest가 invite code로 room join + ready + started match play 가능.
- start custom/dev match 시 실제 Convex match와 `matchParticipants`가 생성된다.
- 생성된 match id로 play 화면을 열 수 있다.
- admin/opponent controller에서 같은 match의 bot participant를 확인하고 manual command를 제출할 수 있다.
- placeholder-only room/player 상태와 실제 Convex match participant 상태의 경계가 문서화된다.

남음으로 넘길 것:

- opponent controller 기반 QA playthrough (ready → 한 판 종료)는 Phase 5에서 완성한다.
- bot 자동 decision/pacing은 opponent controller **위** 자동화 계층에서 처리한다.
- asset manifest, locked asset validation, cosmetics 적용은 Phase 7에서 처리한다.

---

### Phase 5. Opponent controller QA playthrough

목표: QA에서 **ready부터 게임 플레이 종료까지** virtual opponent를 `/admin/opponents` opponent controller로 수동 제어할 수 있게 한다.  
자동화는 이 단계의 범위가 아니다. automation은 opponent controller entrypoint를 그대로 호출하는 **상위 계층**에 나중에 올린다.

계층:

```text
[Phase 5+] automation layer (strategy, pacing, auto runner)
  -> opponent controller (admin UI / admin mutations)
       setCustomGameOpponentReady
       submitOpponentCommand
  -> same match reducer / room state
  -> public/private view update
  -> play client (host/guest) receives snapshot
```

Phase 5에서 opponent controller가 담당하는 QA 범위:

1. **Custom room composition**
   - custom room 선택
   - virtual opponent별 Ready / Unready
   - host Custom Game 화면 subscription으로 ready 반영 확인
2. **Match start 이후 gameplay**
   - started dev match 선택
   - virtual opponent별 `availableActions` 표시
   - load / shake.complete / dice.check / bid / challenge 수동 제출
   - bidding open / bid reload timeout / duel execute / round advance 자동 전환 관찰
   - play tab HUD/snapshot 갱신 확인
3. **Audit**
   - room ready 변경: `adminAudit` + `customGameRoomId`
   - match command: `adminAudit` + `matchId` + `actorVirtualOpponentId`

중요 원칙:

- QA 기본 경로는 **사람이 opponent controller에서 직접 누르는 것**이다.
- admin/automation 모두 reducer/DB를 직접 patch하지 않는다.
- automation이 생기더라도 bypass 금지:
  - room ready → `setCustomGameOpponentReady`
  - match action → `submitOpponentCommand`
  - reducer write path는 Phase 4와 동일
- virtual opponent는 Clerk 계정 없이 `virtualOpponents` + `matchParticipants`로만 존재한다.

작업:

- opponent controller UX를 QA playthrough에 맞게 보강:
  - custom room ↔ started match 전환 흐름 명확화
  - 선택 opponent의 phase / revision / availableActions 가독성
  - submit 후 refresh 또는 partial live follow
  - command reject 시 audit + 화면 피드백
- 권장 manual QA 시나리오 문서화 및 실행:
  1. host: Custom Game room 생성 + opponent 선택
  2. admin: Custom Rooms에서 각 virtual opponent Ready
  3. (optional) guest: invite join + Ready
  4. host: Start → `matchId` 확인
  5. play tab + admin tab same `matchId`
  6. host/guest play client: human turn의 setup.load_initial / shake.complete / dice.check 제출
  7. admin: virtual opponent turn의 dice.check → bid/challenge 제출 후 duel/round advance 자동 진행 확인
  8. play tab snapshot/HUD가 각 단계마다 갱신되는지 확인
  9. `adminAudit` row 누적 확인
  10. non-admin `UNAUTHORIZED` 확인
- multi-opponent turn이 필요한 구간에서 opponent를 바꿔가며 한 판 끝까지 진행 가능해야 한다.
- illegal command spam guard / pacing knob는 **자동화 계층 설계 시** opponent controller 호출 전후에 둔다 (Phase 5 본체는 manual QA 완주가 우선).

완료 기준:

- Custom Game room에서 virtual opponent ready를 opponent controller만으로 맞출 수 있다.
- Start 이후 human turn은 play client, virtual opponent turn은 opponent controller manual command로 맡아 한 판 종료까지 진행 가능하다.
- play 화면(host/guest)과 admin 화면이 같은 Convex state를 공유한다.
- room ready / match command 모두 audit 가능하다.
- automation 없이도 QA가 “local player + virtual opponents 한 판”을 재현할 수 있다.

진행 상태 (2026-07-01):

- 완료: `/admin/opponents` live subscription
  - selected match → `getAdminMatchState` onUpdate
  - selected custom room → `getAdminCustomGameRoom` onUpdate
- 완료: QA playthrough 패널 (room ready → match linked → phase milestones)
- 완료: custom room sidebar split (composing / started)
- 완료: started room → `Open Started Match`로 dev match panel 전환
- 완료: virtual opponent `Ready All` / `Unready All`
- 완료: human guest ready 상태 room panel 표시 (read-only)
- 완료: active/pending bot auto-select
- 완료: `load_all` client loop (`bullet.load` / `setup.load_initial` 반복)
- 완료: `dice.check`가 host-only shortcut을 벗어나 virtual opponent별 manual QA command로 제출 가능
- 완료: `STALE_REVISION` reject 시 자동 refresh + status 표시
- 완료: command/ready 결과 audit id 라인 표시
- 완료: URL query `roomId` / `matchId` 동기화
- 완료: manual QA 시나리오를 재사용 가능한 runbook skill로 정리
  - `.agents/skills/cylinderdicer-qa-playthrough`
  - `.claude/skills/cylinderdicer-qa-playthrough`

진행 상태 (2026-07-04):

- manual QA E2E 시작. **room/ready/start/same-match routing까지 실제 확인됨:**
  - host가 `/play/custom-game`에서 room 생성 → `customGameRooms` row 확인.
  - virtual opponents가 room participant로 포함, invite code 표시 확인.
  - Opponent Controller에서 해당 room 선택 + `Ready All` 동작, host 화면에 ready 반영 확인.
  - host Start → match 생성 → `/play/dev?matchId=...`로 play/admin 양쪽이 같은 match 공유 확인.
- 완료: Defold HTML5 bundle serving 경로.
  - bundle 산출: `play/wasm-web/CylinderDicer/` (editor bundle 또는 `npm run defold:web:bundle` = bob.jar 기반 `tools/bundle-defold-web.mjs`).
  - sync: `npm run defold:web:sync` (`tools/sync-defold-web-bundle.mjs`) → `web/public/play/`.
  - bundle+sync 일괄: `npm run defold:web:build`.
  - `web/public/play/**`, `tools/defold/`(bob.jar)는 generated artifact로 `.gitignore` 처리 (`.gitkeep` 유지).
- 완료: Web ↔ Defold bridge 보강 (HTML5 iframe에서 메시지 불통 문제 해결).
  - Defold → Vue: iframe 내부 CustomEvent + parent `postMessage`(`source: 'CylinderDicerDefold'`) 이중 경로 (`play/main/game_bridge.lua`, `web/src/play-wrapper/gameBridge.ts`).
  - iframe load 후 ready-ack 전까지 `START_MATCH`/`SERVER_SNAPSHOT`/`COMMAND_REJECTED` retry 전송 (`DefoldCanvas.vue`).
  - `MATCH_READY`/`SERVER_SNAPSHOT_RECEIVED`/`PLAYER_COMMAND` 수신도 ready로 간주.
  - 이후 reload HUD 표시 단계까지 진입 성공.
- 완료: stale reload/snapshot 문제 수정.
  - 증상: reload shade 완전 불투명, reload 후 `INVALID_PHASE: not_setup_turn`, UI상 총알/실린더 미갱신. 서버 state는 정상(`setup.load_initial` 3회 accepted, `phase: cup_shake`)이었고 stale bundle UI가 추가 click을 보낸 것이 원인.
  - `ConvexPlayScreen.vue`: command in-flight 중복 제출 차단, accepted/rejected 직후 public snapshot + private delta 즉시 재조회, rejected snapshot 병합 시 private delta 보존, accepted 후 error clear.
  - `cylinder_overlay.script`: command 전송 후 server revision 변경 전까지 cylinder input 잠금.
  - `cylinder_overlay.gui_script`: reload shade alpha `0.18` 고정.
- 완료: `npm run phase0:test` 통과 (typecheck / domain test / web build / Lua 17 tests).
- 완료: bundle/bridge 절차를 skill로 정착.
  - `.agents/skills/defold-html5-bundle` — HTML5 bundle 생성/sync/dev loop/release build.
  - `.agents/skills/defold-web-bridge` — bridge 프로토콜/transport/ready handshake/staleness 규칙.
  - (`.claude/skills/`에 동일 미러.)
- 원칙 확정: **HTML5 bundle runtime은 Defold editor/desktop 빌드 동작과 일치해야 한다.** 플랫폼 차이는 `game_bridge.lua` transport 계층에만 허용, HTML5 전용 게임 로직 금지 (REVIEW.md §3 P8).
- 완료 (2026-07-04 후속): **stale bundle 해소 — 최신 Lua 수정(cylinder input lock, shade alpha, bridge)을 포함한 release 재번들 + sync 완료.**
  - `node tools/bundle-defold-web.mjs --sync` (bob 1.13.0, release variant)로 `play/wasm-web/` 재생성 후 `web/public/play/` sync.
  - bundler에 Java 자동 폴백 추가: PATH/`JAVA_HOME`에 Java가 없으면 macOS Defold.app 내장 JDK(`/Applications/Defold.app/Contents/Resources/packages/jdk-*/bin/java`)를 자동 사용.
  - 이제 "남음"의 play 단계 검증은 브라우저에서 바로 진행 가능하다 (`/play/dev?matchId=...` hard refresh).

- 완료 (2026-07-04 후속 2): **standalone bundle 검증 — 게임 규칙 순서대로 한 라운드 완주.** (Phase 5 제품 경로 검증 아님; Convex/Opponent Controller E2E는 별도로 남음)
  - `QA_COMMAND`/`QA_STATUS` 브리지 경로 추가 (`play/game/dev/qa_cli.lua`의 `process_bridge_command` + `main.script`). HTML5에서 파일 기반 QA CLI를 대체하는 local reducer smoke tool.
  - 게이트: `match.mode == "dev"` **and** `match.local_simulator == true`. Convex 경유 dev match(`/play/dev?matchId=...`)에서는 동작하지 않음 (render cache 오염 방지). 메시지 타입은 `shared/protocol/game-bridge.ts`에 선언.
  - `localSimulator: true` START_MATCH로 검증한 흐름: reload 3발(slot 지정) → cup_shake 6회 → dice_check → bidding_gap(3초 자동) → bidding 4인 순회(pass 시 본인 1발 장전) → challenge → duel 판정 → HP 반영 → cup_shake. reducer 규칙과 HTML5 번들 동작 일치 확인.
  - 한계: duel 판정은 랜덤(런마다 EXACT/OVER/SHORT 다름 — seed 없이는 특정 분기 "검증" 주장 불가, QA_STATUS trace를 증거로 남길 것). localSimulator의 dice_check는 상대를 자동 체크하므로 Convex의 "모든 생존 player dice.check 필요"와의 parity 미검증.
  - 발견된 시각적 미비(에디터 대조 2026-07-04): 에디터 reload/bidding=tavern 파노라마, shake=원형 테이블, bidding-local=rail+bid+dice 정상. HTML5 `/play/index.html` 단독 로드=테이블 배경만, GUI 없음 (web은 START_MATCH 전 idle). focused Chrome + START_MATCH 후 동일 3 phase 재촬영 필요. `shared/docs/HTML5_VISUAL_DIAGNOSIS.md`.
  - 내장 브라우저 QA 한계 기록: view가 가려지면 엔진 메인루프가 정지해 브리지 큐가 쌓임(스크린샷으로 pump), 합성 DOM 입력(untrusted)은 GLFW input에 도달하지 않음 → 게임플레이 QA는 `QA_COMMAND` 사용 (`defold-web-bridge`, `cylinderdicer-qa-playthrough` 스킬 참고).
- 완료 (2026-07-04 후속 3): **HTML5 bundling Phase A cleanup.**
  - `defold:web:sync`가 sync 후 stale bundle warning을 자동 출력한다. 기준은 `play/wasm-web/CylinderDicer/CylinderDicer_wasm.js`와 최신 `play/**` Defold script(`.lua`, `.script`, `.gui_script`, `.render_script`) mtime 비교이며 `.deps`/`build`/`wasm-web`는 제외한다.
  - `defold:web:sync` warning 동작 확인 후 `npm run defold:web:build`로 release 재번들 + sync, freshness check 통과.
  - `--variant debug`는 Phase C HUD/render debugging용으로 skill에 문서화했다. parity/acceptance 기준은 release variant로 되돌린다.
  - `QA_COMMAND` gate를 실제 bundle에서 재검증했다: `localSimulator: true`에서는 `QA_STATUS` 반환, `localSimulator: false` dev match에서는 무응답.
  - 다음 fork: Phase B editor ↔ HTML5 visual contrast — **에디터 3 phase 캡처 완료**; HTML5는 bare page≠에디터 play. `START_MATCH` 후 reload/shake/bidding-local 3장 추가 촬영 → same/different 라벨.

- 완료 (2026-07-05 후속): **background BG → HUD(GUI) migration 구현.**
  - `background` GO의 컴포넌트 id는 유지하고 `/background/background.gui`로 교체했다 (`/background#background` 주소 유지).
  - embedded world sprite `backdrop`은 `main.collection`에서 제거했고, 배경 이미지는 GUI `backdrop` box node(`main/background`, render order 2)로 이동했다.
  - `background.gui_script`가 기존 `pan_to` / `background_pan_complete` / `visual_status.background` 계약을 유지한다. HTML5는 즉시 snap, editor/desktop은 `0.6s` `gui.animate`.
  - 완료 (2026-07-07 HUDify follow-up): HTML5에서 배경을 덮던 alpha-zero HUD structural boxes를 `0×0`으로 축소했다. `render_order(10)`으로 배경을 HUD 위에 올리는 우회는 폐기.
  - 완료 (2026-07-07 HUD input follow-up): HTML5 canvas pointer fallback(`DOM_POINTER`)을 추가해 reload HUD 클릭이 실제로 3발 장전 후 `cup_shake`로 진행되게 했다.
  - 검증: LuaJIT parse 통과, Defold editor HTTP build 통과(포인터 follow-up 전), `npm run defold:web:build` release bundle + sync 통과, `node tools/html5-phase-check.mjs --shots .tmp/refactor-html5-full-round-3` full-round 통과.
  - 남음: editor/desktop에서 0.6s pan animation 육안 재확인.

주의 (검증 경계):

- Web wrapper 수정은 Vite hard refresh로 반영된다.
- Defold Lua 수정(`cylinder_overlay.*`, `game_bridge.lua`)은 기존 HTML5 bundle에 자동 반영되지 않는다. **shade/input-lock/bridge 수정의 실브라우저 확인은 Defold HTML5 재번들 + `npm run defold:web:sync` + hard refresh 이후에만 유효하다.**

남음:

- 재번들된 Defold HTML5 bundle 기준 play 단계 검증:
  - ~~setup reload 3회 후 즉시 cup shake 전환~~ (standalone QA로 확인)
  - ~~bidding/challenge/duel/round advance까지 한 라운드 이상 완료~~ (standalone QA로 확인)
  - ~~Convex 경유 실매치에서 human shake/check 제출 + opponent controller 액션 진행~~ (2026-07-10 Chrome 실매치 확인: 4인 모두 독립 shake/check capability, bot별 6회 staging, human HUD 0/6→1/6→6/6, 마지막 shake에서만 `dice_check` 전환).
  - ~~HTML5 visual parity: background는 GUI로 이관 완료. bare `/play/index.html`은 비교 대상 아님. `START_MATCH` 후 reload/shake/bidding-local screenshot-pixel check + `QA_STATUS.visual.background.position_y` 자동 기록 완료 (`HTML5_VISUAL_DIAGNOSIS.md`).~~
- manual QA 시나리오 전체 E2E 완주 (한 판 종료까지, Clerk admin claim 포함)
- play tab + admin tab same-match HUD 단계별 스크린샷/체크리스트 기록

- 2026-07-10 추가 완료: shared checkpoint multiplayer refactor.
  - `cup_shake`와 `dice_check`를 active-player turn에서 분리했다. 모든 생존 플레이어가 각자 완료해야 하며 `activePlayerId`는 다음 bidding 시작자 의미만 유지한다.
  - `shake.complete`는 actor 본인의 주사위만 굴리고 마지막 완료자에서만 다음 phase로 전환한다. Opponent Controller는 action 가능한 bot 선택을 보존/순환한다.
  - face `1`을 `Skull (1)`로 노출하고, 현재 bid보다 낮은 same-count skull은 다음 count로 보정한다.
  - snapshot key normalization에 `requiredCount → required_count`를 추가해 Convex 실매치의 local HUD가 1회 fallback을 쓰던 문제를 제거했다.
  - 검증: Convex domain 9/9, Lua model 19/19, Vue build, Convex deploy/check, release HTML5 bundle, authenticated Chrome same-match smoke.

#### Phase 5+. Gameplay bot runtime

완료 (2026-07-26):

- 실제 bot은 Opponent Controller/admin identity를 가장하지 않고 `server_bot` participant로 명시한다.
- parameterized profile, fair observation, legal-action decision engine, guarded Convex internal scheduler를 분리했다.
- 모든 bot command는 human과 같은 authoritative reducer/command log를 통과하고 `source: bot`으로 기록한다.
- Custom Game은 virtual opponent를 자동 ready 처리하며, Ladder는 40초 이후 2–5 human start decision을 6인 gameplay bot roster로 보완한다.
- QA controller는 `qa_manual` dev match와 Ladder fixture 전용으로 유지하며 actual server bot을 조작하지 못한다.
- 완료 기준과 운영 절차는 [shared/docs/GAMEPLAY_BOTS.md](shared/docs/GAMEPLAY_BOTS.md)에 고정한다.
- automation off 시 Phase 5 manual QA 경로와 동일하게 동작.

---

### Ladder matchmaking waiting / roster vertical slice

- 2026-07-26 dice check timeout:
  - `dice_check` phase에 서버 권위 `dice.check.timeout`을 추가했다. phase 진입 후 6초 동안 확인하지 않은 생존 플레이어만 자동 확인 처리하고 `bidding_gap`으로 진행한다.
  - Convex scheduler/reducer와 Defold local simulator flow contract/reducer를 같은 6초 규칙으로 맞췄다. 이미 확인한 플레이어의 상태는 유지한다.
  - Convex domain 20 tests, Lua 46 tests 통과. Convex public protocol/schema 변경은 없어 phase4 deploy/check는 실행하지 않았다.
- 2026-07-24 중복 phase indicator 정리:
  - `cylinder_overlay`의 `reload_title_box` / `reload_title`과 `duel`의 `title_box` / `title`을 제거해 `turn_indicator`만 phase 제목을 표시하도록 통일했다.
  - reload의 남은 장전 수, duel의 hint/콜/실제 개수 요약은 유지했다. 제목용 i18n을 런타임에서 더 이상 참조하지 않는다.
  - `GUI_NODE_CONTRACTS.md`와 duel GUI 문서를 실제 node tree에 맞게 갱신했다.
  - release HTML5 bundle/sync, `phase0:test`, stale node reference 검사 통과. HTML5 harness에서 reload 및 duel reveal/combat screenshot과 console runtime error 없음 확인. 기존 harness의 `dice_check`/bidding timing check는 실패해 해당 검증은 보류 상태로 남겼다.
- 2026-07-24 결투 중간 텍스트 정리:
  - `combat_status`, `combat_shot`, `combat_result`를 제거해 결투 중간의 `판정`, 러시안 룰렛 단계, 명중/빗나감 텍스트를 표시하지 않도록 했다.
  - 초상화, HP/탄환 indicator, hit flash, 결투 오디오는 유지했다. 결투 공개 단계의 하단 안내 문구는 phase 안내로 유지한다.
  - release HTML5 bundle/sync, `phase0:test`, stale node reference 검사 통과. `duel_combat` screenshot에서 중앙 텍스트가 사라지고 console runtime error가 없음을 확인했다.
- 2026-07-24 로컬 공개 주사위 안내문구 겹침 수정:
  - 결투 공개 단계에서 local `player_dice_template` anchor를 기존보다 28px 위로 올려 하단 `hint` 안내문구를 가리지 않도록 했다. 상대 좌석, grid, local tray 위치는 변경하지 않았다.
  - release HTML5 bundle/sync, `phase0:test`, `duel_reveal` screenshot 및 console runtime error 없음 확인.
- 2026-07-24 shake 컵 draw order 정리:
  - `cup_local`을 `reveal_dice_*` node 뒤로 이동해, Defold GUI의 node 목록 draw order에서 컵이 공개 주사위보다 앞에 렌더링되도록 했다. z 값은 깊이 범위 내 값으로만 유지한다.
  - HTML5 bundle/sync 후 `shake` screenshot에서 컵 하단이 공개 주사위를 가리는 것을 확인했다. 기존 harness의 timing check는 여전히 `dice_check`에서 종료되지만 console runtime error는 없었다.
- 2026-07-17 bidding turn/carousel 회귀 수정:
  - 에디터에서 삭제된 구형 `slot*_head`와 `face_hint` placeholder를 GUI script가 계속 참조해 carousel과 bid/challenge controls 갱신이 중단되던 오류를 제거했다. `slot*_body`를 portrait의 유일한 기준 node로 유지한다.
  - authoritative 현재 turn 플레이어를 carousel의 정확한 가로 중앙에, 직전 turn 플레이어를 바로 왼쪽에 배치했다. HTML5 phase check는 bid controls visibility, active portrait 중앙 정렬, local-turn rail 실제 키 입력을 검증한다.
  - 검증: release HTML5 bundle/sync, HTML5 phase check(local turn controls/중앙 portrait, rail `1→2` 실제 입력, opponent turn 중앙 이동/권한 분리, console error 없음), `phase0:test`(Convex domain 17, Ladder 15, Defold Lua 28, Vue production build) 통과.
- 2026-07-17 shake / Opponent Controller 회귀 수정:
  - `player_carousel`을 reload/bidding HUD 전용으로 되돌려 `cup_shake`, `dice_check`, `bidding_gap`에서 `shake.gui`의 컵 연출 위에 portrait/badge가 중복 표시되지 않게 했다.
  - 시작된 Custom Room의 match detail은 room snapshot의 `matchId`에서 직접 복구하고, 늦게 끝난 이전 query가 최신 선택을 덮지 못하도록 request sequence guard를 추가했다.
  - 검증: release HTML5 bundle/sync, HTML5 phase check(`cup_shake` carousel hidden + 모든 bot shake capability), `phase0:test`(Convex domain 17, Ladder 15, Defold Lua 28, Vue production build), `phase4:deploy`, `phase4:check` 통과. 인증된 Chrome에서 Opponent Controller 5회 연속 reload 및 Hush/Samuel/Zippo의 활성 `Shake 1 / 6` 버튼을 확인했다.
- 2026-07-17 Skull bid self-roulette / rail boundary 후속 완료:
  - face 1(Skull) 입찰은 authoritative reducer가 입찰자 본인의 실린더를 회전하고 1회 격발한 뒤, 생존한 경우에만 입찰을 확정한다. 명중 시 HP 1과 실제 탄환을 차감하고 해당 플레이어 일러스트를 진동시킨다.
  - 치명타이면 시도한 Skull 입찰을 폐기하고 기존 입찰을 유지한 채 다음 생존 플레이어로 진행한다. Convex public snapshot과 Defold local simulator가 같은 `skullRoulette` 결과 계약을 사용한다.
  - rail의 1–36 범위 밖 셀은 숫자 label뿐 아니라 `bid_normal` panel도 숨긴다.
  - 검증: `phase0:test`(Convex domain 17, Ladder 15, Defold Lua 28, Vue production build), release HTML5 bundle/sync, `phase4:deploy`, `phase4:check` 통과. HTML5 local-simulator fixture에서 rail count 1의 범위 밖 panel 미표시와 Skull 명중(HP 3→2, 탄환 3→2), 후속 reload(탄환 3)를 캡처로 확인했다.
- 2026-07-16 bidding HUD blueprint alignment 완료:
  - bidding carousel의 비활성 인물 alpha를 0.72(활성/직전 입찰자 1.0)로 올려 배경과 분리했다.
  - 중앙 pass 버튼의 정면 주사위를 버튼 안쪽으로 12px 내리고, up/down 화살표를 같은 X축에서 주사위의 위·아래에 정렬했다.
  - 중앙 인물·HP/탄환 indicator를 turn banner 아래 safe area로 내리고 banner를 상단으로 옮겼다. badge가 이미 표시하는 `HP:n B:n` carousel 요약 텍스트는 제거했다.
  - 검증: Defold editor build, release HTML5 bundle/sync, `phase0:test` (Convex 15, Ladder 15, Lua 27, Vue production build) 통과. browser local simulator의 reload/cup-shake bundle smoke와 console을 점검했다.
- 2026-07-17 local bidding indicator 통일 완료:
  - 좌하단 local HUD의 탄환·HP를 carousel과 같은 `bullet_indicator` / `hp_indicator` icon 위 숫자로 바꿨다. 별도 `B` / `HP` 텍스트 label은 제거했다.
  - 검증: Defold editor build, release HTML5 bundle/sync, `phase0:test` 통과.
- 2026-07-17 cylinder placeholder cleanup 완료:
  - 실제 PNG가 없는 6개 약실 `slot` / `rim` wireframe과 3개 장전 탄환 tip box를 GUI·런타임 참조에서 제거했다.
  - `cylinder.png`, 장전 약실의 `bullet_bottom.png`, 남은 장전 탄환의 `bullet_unloaded.png`만 표시한다.
- 2026-07-12 Ladder in-game character identity 후속 완료:
  - authoritative player state가 seat별 `rosemund`, `hush-feather`, `samuel-saber`, `zippo-jay`, `calamity-kate`, `the-kid` skin을 소유하고 public snapshot의 `skin` / `portraitState`로 Vue–Defold handoff까지 보존한다.
  - Defold carousel/duel GUI에 Calamity Kate와 The Kid atlas를 등록했다. 알 수 없는/default skin이 Rosmund로 fallback되어 전원이 local portrait처럼 보이던 원인을 제거했다.
  - live event 기록에서 보고된 duel은 local 9 bid → Hush 10 bid → 다음 active seat Samuel challenge였으며 authoritative pair는 Samuel–Hush가 맞음을 확인했다. 해당 pair와 skin projection을 Convex/Lua 회귀 테스트로 고정했다.
- 2026-07-12 Opponent Controller dev match cleanup 완료:
  - Dev Matches left rail에 ready dev match별 `Remove`와 `Remove All (N)`을 추가했다.
  - Remove는 physical delete 대신 authoritative terminal completion path를 사용해 dev match/participant/linked started room을 close하고 목록에서 제거한다. Ranked/casual match와 audit history는 보존한다.
  - Browser에서 기존 12 ready dev match에 individual/bulk controls가 표시되는 것을 확인했다. 실제 기존 QA rows는 사용자 선택 전에는 삭제하지 않았다.
- 2026-07-16 Opponent Controller dev data purge 후속 완료:
  - `Remove` / `Remove All`은 ready `dev` match를 terminal completion으로 전환한 뒤 `purgeCompletedDevMatchData`를 bounded batch 종료까지 반복 호출한다.
  - 따라서 match participant/state/snapshot/command/event와 연결된 custom room/participant 및 match parent를 실제로 삭제한다. Ranked/casual과 `adminAudit`은 보존한다.
- 2026-07-11 bot-first Ladder QA 후속 완료:
  - `Add Ladder Opponent`가 human session 없이도 active하도록 indexed `ladderQaWaitingOpponents` QA pool을 추가했다. Admin은 최대 5 bots를 먼저 대기시킬 수 있다.
  - 다음 authenticated player의 `enterQueue`가 pool을 atomically claim하고 `qaPendingCount`로 production matcher에서 격리한 뒤 기존 guarded QA finalizer로 authoritative `dev` match를 만든다.
  - Browser E2E: player 없음 + enabled button → bots 3명 prequeue → player 후순위 Ladder join → pool 0 → 4-player dev match `8abqjw` → `?matchId=...` + single iframe 확인. Application console error 없음.
- 2026-07-11 waiting lifecycle / adaptive fill 후속 완료:
  - stale `matched` queue row가 Lobby의 다음 Ladder click을 즉시 이전 game으로 handoff하던 root cause를 수정했다. roster handoff가 queue row를 consume하고 `/play/ladder?matchId=...`를 남겨 refresh recovery와 새 search intent를 분리한다.
  - `lastSeenAt` + `by_status_and_last_seen_at` active lease를 추가했다. searching client는 8초 heartbeat, server는 20초 lease로 abnormal-close waiting row를 production/admin 후보에서 제외한다.
  - production policy를 즉시 2인 FIFO에서 adaptive 2–6 fill로 교체했다. target 6, min 2, min hold 40초, max wait 45초, MMR band ±150→±400, active eligible join gap 기반 projected fill을 사용한다. 40초 전에는 partial roster를 만들지 않고, 이후 projected fill이 remaining budget보다 길면 현재 2–5명으로 시작한다.
  - authenticated browser에서 Lobby → Ladder가 Searching 유지, Opponent Controller button enabled, QA 2-player handoff가 `?matchId=...` + single iframe을 생성, Back → Lobby → Ladder가 새 Searching session 및 enabled button을 만드는 회귀 시나리오를 확인했다.
  - 의도적으로 미룸: historical arrival telemetry와 region/platform/rating-band별 percentile calibration. 현재 estimate는 active eligible cohort만 사용하며 traffic data 없이 production tuning 수치를 invent하지 않는다.
- 2026-07-11 Opponent Controller QA 후속 완료:
  - `/admin/opponents`에 최신 authenticated waiting Ladder session을 live 표시하고 click마다 existing virtual opponent 한 명을 stage하는 `Add Ladder Opponent` control을 추가했다.
  - `ladderQaOpponents` child table과 queue `qaRevision` guard로 2–6 player click burst를 모은다. Human 포함 6명은 즉시, 2–5명은 player 입장 40초 뒤 단 하나의 authoritative `dev` match를 생성한다. cancel, production match-found, re-enter가 pending row와 scheduled finalize를 idempotently 무효화한다.
  - Production 2-human FIFO matcher, MMR/placement, Defold bridge/matchId handoff는 변경하지 않았다. Admin action은 `ladder.qa.add_opponent` audit row를 남긴다.
  - 검증: Ladder tests 9/9, Convex typecheck/domain/Phase 0, Web build, `phase4:deploy`, `phase4:check`, authenticated 1280×720 two-tab browser flow에서 3 clicks → 4-player dev match → `/play/ladder` single iframe handoff 확인. In-app browser viewport override가 적용되지 않아 이 후속의 narrow-mobile visual result는 claim하지 않는다.
  - Runbook: [shared/docs/OPPONENT_CONTROLLER.md](shared/docs/OPPONENT_CONTROLLER.md) `Ladder QA`, [shared/docs/LADDER_QA.md](shared/docs/LADDER_QA.md) `Opponent Controller QA roster`.
- 2026-07-11 추가 완료:
  - `web/LADDER_LAYOUT.md`의 `# 개요`, `# 모듈`, `# LadderShell.vue`, `## phase 전이`를 기준으로 `/play/ladder` 단일 route 안에 searching → roster → handing_off를 구현했다. roster 완료 전에는 Defold wrapper를 mount하지 않는다.
  - `ladderQueueEntries`(고빈도 queue state)와 `ladderStats`(안정적인 MMR/placement summary)를 분리하고, `by_user`, `by_status_and_joined_at` index 기반 `enterQueue`, `leaveQueue`, `observeOwnQueue`를 추가했다. (이후 active lease index로 확장.)
  - 최초 production slice의 matching policy는 대기 순서 기준 2인 FIFO였다. 이후 위의 adaptive 2–6 policy가 이를 대체했다.
  - normalized placement는 `shared/ladder/placement.ts`의 `(place - 1) / (playerCount - 1) * 5 + 1` 단일 구현을 Web/Convex가 함께 사용한다.
  - 기존 Defold character/default die source를 독립적인 `web/src/assets/ladder-*` bundle로 패키징했다. Vite runtime은 `play/` 또는 generated HTML5 output을 읽지 않는다.
  - `ko` / `en` / `ja` searching, roster, recent-N/all-time average, cancel, countdown, retry/error copy를 추가했다.
  - 검증: `ladder:test` 7/7, `convex:typecheck`, Web production build, `phase4:deploy`, `phase4:check`, authenticated Chrome 1440×900 / 1280×720 / 375×812 QA 통과.
  - 브라우저 roster 2/4/6과 Ready → real dev fixture matchId → single `ConvexPlayScreen` iframe은 deterministic dev fixture로 확인했다. 실제 2-user FIFO production matchmaking은 한 계정 브라우저만 사용한 이번 QA 범위 밖이다.
- 의도적으로 미룬 것: tier boundary, season reset, leaderboard, rating/result writeback, queue ETA/인원, sophisticated opponent selection, persisted fidget rewards, character selection pipeline.
- Runbook: [shared/docs/LADDER_QA.md](shared/docs/LADDER_QA.md)

---

### Phase 6. Dirty code 단계적 제거

목표: 기능 parity 확인 후 오래된 duct tape 제거.

제거 순서 추천:

1. `vertual-server/` legacy path 축소
   - Convex path가 안정되면 fallback 문서화 후 default off.
2. `/tmp/cylinderdicer_qa_status.txt` 의존 제거
   - opponent-controller는 Convex query/subscription 사용.
3. Defold GUI 직접 store dispatch 제거
   - GUI → controller message → GameBridge command.
4. local reducer 직접 gameplay path 제거
   - local simulator 전용으로 격리.
5. 중복 protocol 제거
   - shared protocol을 SSOT로 통합.
6. mock/custom game service 정리
   - 실제 custom game asset manifest와 통합.

원칙:

- 한 번에 지우지 말 것.
- Convex playable path가 대응 기능을 가진 뒤 삭제.
- 삭제 전후 테스트를 같은 시나리오로 비교.

완료 기준:

- 기본 플레이 경로가 Convex 하나로 설명됨.
- legacy fallback은 명확한 dev flag에서만 동작.
- opponent-controller가 `/tmp` 없이 동작.

---

### Phase 7. Custom game asset pipeline

목표: asset을 추가하면 custom game을 플레이할 수 있는 단계.

구조 추천:

```text
asset manifest
  -> web custom game selection
  -> match creation payload
  -> Convex validates selected asset ids
  -> Defold receives cosmetics/config
  -> game starts
```

작업:

- asset manifest 형식 정의:
  - dice skin
  - cup skin
  - portrait/body skin
  - background
  - sound set
  - rule preset 가능 여부
- Convex schema:
  - `customGames`
  - `assetPacks`
  - `userAssetSelections`
- Web custom game screen:
  - asset pack 선택
  - player/bot 구성
  - start custom match
- Defold bridge:
  - `SET_COSMETICS`
  - `START_MATCH`
  - `SERVER_SNAPSHOT`
- asset validation:
  - 존재하지 않는 asset id reject
  - locked asset reject
  - dev asset 허용 여부 flag

완료 기준:

- asset manifest에 새 asset 추가.
- web custom game에서 선택 가능.
- custom match 생성 가능.
- Defold가 선택 asset으로 플레이 화면 표시.
- bot/opponent 포함 custom game 플레이 가능.

---

## 추천 실행 순서

내 추천은 이 순서야.

1. Convex dev/codegen 성공 — **완료**
2. generated `api`로 web service 교체 — **완료**
3. Convex 한 판 vertical slice 완성 — **완료**
4. admin opponent controller 연결 — **완료**
5. Custom Game placeholder opponents를 실제 Convex participants로 승격 — **완료**
6. opponent controller QA playthrough (ready → 한 판 종료) — **진행 중 (manual E2E 완주 남음)**
7. `/tmp`/`vertual-server`/local dispatch dirty code 제거
8. custom game asset pipeline 완성

가장 중요한 중간 목표는 “asset pipeline 이전에, Convex 기준 dev/custom match 한 판이 실제 participants와 함께 끝까지 돈다”야. 이게 되면 나머지는 기능 확장이고, 이게 안 되면 admin/bot/custom asset이 전부 모래 위에 올라가.

6~9 사이에 끼워 넣을 리팩토링(관리 화면 분해, `convex/lib/` 공통부 추출, schema validator 조이기, 문서 정비)의 우선순위와 근거는 [REVIEW.md](REVIEW.md) §2/§5를 따른다. 원칙은 “manual QA E2E로 기준 동작을 기록한 뒤에 큰 리팩토링을 한다”.
