# CylinderDicer Refactoring Review

이 문서는 기능 개발 뒤 진행할 리팩터링의 우선순위, 변경 경계, 완료 gate를 고정한다. Phase별 제품 진행 상태는 [ROADMAP.md](ROADMAP.md), Convex 구조는 [shared/docs/CONVEX_IMPLEMENTATION.md](shared/docs/CONVEX_IMPLEMENTATION.md)가 소유한다.

## 1. 착수 원칙

- authoritative match reducer와 public/private snapshot 계약을 먼저 보호한다.
- 안전성 수정과 구조 분해를 한 change set에 섞지 않는다.
- Convex public validator/schema 변경은 `phase4:deploy`와 `phase4:check`까지 완료한다.
- Defold capability/bridge 변경은 release HTML5 bundle을 다시 만들고 sync한 뒤 확인한다.
- 기존 local simulator는 명시적 dev mode에서만 fallback authority를 가진다.
- oversized module은 현재 behavior를 characterization test로 고정한 다음 분해한다.

## 2. Fix-first wave

### Wave A — command trust boundary

상태: 미착수.

1. `submitMatchCommand`의 `payload: v.any()`를 command type별 discriminated validator로 교체한다.
2. `setup.load_initial`, `bullet.load`, `bid.raise` 숫자는 finite safe integer와 domain range를 boundary와 reducer 양쪽에서 확인한다.
3. `Number()` coercion을 제거하고 malformed payload가 state revision, chamber, load count를 바꾸지 않는 negative test를 추가한다.
4. 저장용 event/snapshot의 `v.any()`는 별도 typed persistence migration으로 남기고, client command input과 혼동하지 않는다.

완료 gate:

- command type별 valid/invalid payload test
- `npm run convex:typecheck`
- `npm run convex:domain-test`
- `npm run phase0:test`
- `npm run phase4:deploy && npm run phase4:check`

### Wave B — admin authorization boundary

상태: 미착수.

1. `unsafeMetadata`, recursive metadata walk, `*:admin` suffix 허용을 제거한다.
2. Clerk JWT template가 서명한 exact backend claim 하나와 exact role literal 하나만 허용한다.
3. QA route visibility와 Convex authorization은 계속 별도 gate로 유지한다. UI 숨김은 권한이 아니다.
4. accepted/rejected identity fixtures와 non-admin live preflight를 추가한다.

완료 gate:

- exact admin claim만 통과하는 unit test
- `QA_TOOLS_ENABLED`와 admin claim의 독립성 확인
- Phase 4 deploy/check 및 admin/non-admin manual smoke

### Wave C — indexed active room membership

상태: 미착수.

1. `customGameParticipants`에 `by_room_and_status` index를 widen 단계로 추가한다.
2. `.take(8).filter(status)` 호출을 index query로 교체한다.
3. removed row가 8개 이상 있어도 active participant가 누락되지 않는 test를 추가한다.
4. 모든 reader 전환 뒤 기존 `by_room` index 제거 필요성은 별도 narrow migration에서 판단한다.

완료 gate:

- schema deploy/check
- composing/started room과 removed-row regression test
- `.collect()` 없이 bounded indexed query 유지

## 3. Capability and bridge wave

### Wave D — server capability propagation

상태: 미착수.

1. private snapshot의 `availableActions`를 Defold state에 보존한다.
2. bidding/load/shake/check controls는 server capability를 primary source로 사용한다.
3. `local_permissions.lua`의 phase/turn 추론은 local simulator mode에서만 fallback으로 허용한다.
4. reload gate, spectator, eliminated player, stale revision에서 금지된 control이 보이거나 입력되지 않는 phase regression test를 추가한다.

완료 gate:

- capability codec/fixture parity test
- Lua model tests
- release HTML5 phase check

### Wave E — versioned snapshot coordinator

상태: 미착수.

1. bridge listener는 expected iframe `contentWindow`, allowed origin, message schema를 모두 검증한다.
2. snapshot fetch/merge key를 `{matchId, revision}`으로 고정하고 latest-request generation guard를 둔다.
3. `commandInFlight` 동안 중복 command를 drop/queue하는 정책을 한 coordinator가 소유한다.
4. route/matchId 교체, stale fetch, out-of-order ack, iframe remount에서 이전 match snapshot이 적용되지 않는 test를 추가한다.
5. direct function transport와 `postMessage` transport는 유지하되 동일 coordinator 뒤에 둔다.

완료 gate:

- bridge unit tests와 stale async regression test
- Vue production build
- single iframe / no duplicate handoff browser smoke

## 4. Consolidation wave

### Wave F — ruleset and protocol contracts

상태: Fix-first 이후.

- 6 players, 36 rail cells, dice/cylinder limits, initial slots, default MMR, flow timings를 versioned ruleset으로 모은다.
- TypeScript DTO를 canonical contract로 정하고 Lua codec을 한 모듈로 모은다.
- TS/Lua golden fixture가 같은 snapshot, capability, timing 상수를 읽는지 검증한다.
- persistence payload migration과 public command validator는 별도 단계로 유지한다.

### Wave G — bot catalog and strategy registry

상태: Fix-first 이후.

- `DEFAULT_VIRTUAL_OPPONENT_SPECS`와 `GAMEPLAY_BOT_SPECS`의 identity 충돌을 하나의 catalog로 합친다.
- stored `strategyKey`를 실제 strategy registry lookup에 사용하고 unknown version은 명시적으로 reject/fallback한다.
- QA fixture identity와 gameplay profile은 catalog scope로 분리하되 character identity는 중복 정의하지 않는다.

### Wave H — oversized orchestration split

상태: 마지막.

- `reducers.lua`: snapshot decode/apply, local simulator reduction, presentation-derived state를 분리한다.
- `adminMatches.ts`: authorization, lifecycle, audit, purge를 분리한다.
- `OpponentControllerScreen.vue`: room list, match controls, Ladder QA panel을 composable/panel로 분리한다.
- 각 추출은 behavior-neutral change로 진행하고 characterization test 외의 기능 변경을 넣지 않는다.

## 5. 실행 순서

1. Wave A command validator
2. Wave B exact admin claim
3. Wave C active-room index
4. Wave D capability propagation
5. Wave E versioned bridge coordinator
6. Wave F ruleset/protocol contracts
7. Wave G bot registry
8. Wave H orchestration split

Wave A–E는 correctness/security 작업이다. Wave F–H는 중복과 모듈 크기를 줄이는 작업이므로 앞 단계 gate가 안정된 뒤 시작한다.
