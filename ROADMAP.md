이 문서는 `Custom Game`(공방)까지 실행 가능한 단계에 도달하기 위한 Roadmap임.
---

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
  - `bidding.open`
  - `bid.raise`
  - `bid.challenge`
  - `duel.execute`
  - `round.advance`
- 완료: Convex Web 경로에서 semantic actions는 local reducer dispatch보다 `PLAYER_COMMAND`를 우선 사용.
  - local simulator가 아닐 때 `bid.raise`, `bid.challenge`, `bullet.load`, `setup.load_initial`, `dice.check`, `bidding.open`, `duel.execute`, `round.advance`는 서버 command를 먼저 보낸다.
  - `shake.roll`은 local gesture/progress 표현용으로만 남고, 서버에는 `shake.complete`만 전송한다.
- 완료: `SERVER_SNAPSHOT`을 Defold local store에 투영해 HUD/players/turn/bidding/private dice/cylinder가 서버 snapshot으로 갱신됨.
- 완료: `VITE_USE_LOCAL_DEFOLD_SIMULATOR=true`일 때 `/play/dev`가 Convex를 거치지 않는 local simulator route를 사용.
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

- Admin UI는 live subscription이 아니라 수동 refresh + submit 후 재조회 기반이다.
  - `listAdminDevMatches`
  - `getAdminMatchState`
  - `submitOpponentCommand`
  - submit 후 `loadDetail()`/`loadMatches()`를 다시 호출한다.
  - play tab은 snapshot subscription을 받지만 admin 화면 자체는 아직 live follow가 아니다.
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
  - admin 권한 통과, command 제출, audit row 생성까지의 manual E2E는 아직 별도 검증이 필요하다.
- `npm run convex:codegen`과 `npm run phase0:test`는 통과했다.
  - 단, schema/functions가 MossBorg dev deployment에 확실히 반영됐는지는 다음 작업자가 확인해야 한다.
  - 필요하면 `npm run phase1:bootstrap` 또는 `npx convex dev --once`로 dev deployment에 push한다.

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
  - 별도 일반 user가 admin-created match를 observe/play하는 정책은 아직 미구현이다.

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

남음:

- Clerk admin claim setup 문서/스크립트 보강.
- admin-created match를 일반 user가 observe/play할 수 있는 정책.
- admin UI live subscription 또는 polling strategy.
- admin command manual E2E.
- Phase 5 opponent controller QA playthrough가 사용할 command pacing/illegal spam guard (자동화 계층에서 소비).

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
- match state의 `localPlayerId`는 host player 기준 유지. multi-human shake/check UX는 Phase 5+에서 추가 검토.
- dedicated `/play/custom-game?matchId=...` route, asset/rule selection, human kick은 Phase 7 전후.

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
   - load / shake.complete / dice.check / bidding / challenge / duel / round.advance 수동 제출
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
  6. admin: setup.load_initial → shake.complete → dice.check → bid → challenge → duel → round.advance
  7. play tab snapshot/HUD가 각 단계마다 갱신되는지 확인
  8. `adminAudit` row 누적 확인
  9. non-admin `UNAUTHORIZED` 확인
- multi-opponent turn이 필요한 구간에서 opponent를 바꿔가며 한 판 끝까지 진행 가능해야 한다.
- illegal command spam guard / pacing knob는 **자동화 계층 설계 시** opponent controller 호출 전후에 둔다 (Phase 5 본체는 manual QA 완주가 우선).

완료 기준:

- Custom Game room에서 virtual opponent ready를 opponent controller만으로 맞출 수 있다.
- Start 이후 한 판을 opponent controller manual command만으로 끝까지 진행 가능하다.
- play 화면(host/guest)과 admin 화면이 같은 Convex state를 공유한다.
- room ready / match command 모두 audit 가능하다.
- automation 없이도 QA가 “local player + virtual opponents 한 판”을 재현할 수 있다.

#### Phase 5+. Opponent automation (opponent controller 상위 계층)

목표: 사람이 매 턴마다 admin을 누르지 않아도 virtual opponent가 움직이게 한다.  
**구현 위치는 opponent controller 위**이며, reducer나 room state를 우회하지 않는다.

작업:

- bot strategy 모듈:
  - conservative bid
  - random legal bid
  - challenge threshold
  - auto load / shake.complete / dice.check
- runner가 호출하는 API는 opponent controller와 동일 entrypoint만 사용:
  - `setCustomGameOpponentReady`
  - `submitOpponentCommand`
- runner 형태 (우선순위):
  - 1차: admin UI “Auto” / step runner (여전히 admin auth)
  - 2차: external `opponent-bot/`가 admin mutation 호출
  - 3차: Convex scheduled/internal action 검토
- pacing / illegal spam guard:
  - automation layer에서 action delay, retry backoff, illegal command 차단
  - opponent controller mutation contract는 변경하지 않음

완료 기준 (automation):

- local player 혼자서 bot 3명과 한 판을 **automation on** 상태로 진행 가능.
- automation action이 모두 `adminAudit`으로 추적 가능.
- bot이 illegal command를 반복 spam하지 않음.
- automation off 시 Phase 5 manual QA 경로와 동일하게 동작.

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

1. Convex dev/codegen 성공
2. generated `api`로 web service 교체
3. Convex 한 판 vertical slice 완성
4. admin opponent controller 연결
5. Custom Game placeholder opponents를 실제 Convex participants로 승격
6. opponent controller QA playthrough (ready → 한 판 종료)
7. opponent automation (opponent controller 상위 계층)
8. `/tmp`/`vertual-server`/local dispatch dirty code 제거
9. custom game asset pipeline 완성

가장 중요한 중간 목표는 “asset pipeline 이전에, Convex 기준 dev/custom match 한 판이 실제 participants와 함께 끝까지 돈다”야. 이게 되면 나머지는 기능 확장이고, 이게 안 되면 admin/bot/custom asset이 전부 모래 위에 올라가.
