# Ladder QA Runbook

화면/연출 요구사항은 [web/LADDER_LAYOUT.md](../../web/LADDER_LAYOUT.md)의 `# LadderLoading.vue`, `## DiceFidget / ChipStack 규칙`, `# LadderRoster.vue`, `# 화면별 일감 (복잡도 가드)`, `# 구현 고려사항`을 직접 기준으로 사용한다.

## 준비

```bash
npm run phase4:deploy
npm run phase4:check
cd web && npm run dev -- --host 127.0.0.1
```

Vite URL은 보통 `http://localhost:5173` 또는 `http://127.0.0.1:5173`이다. Clerk session은 origin별로 다를 수 있으므로 이미 로그인한 origin을 사용한다.

## 실제 queue smoke

1. 인증된 browser에서 `/play/ladder`를 연다.
2. MMR과 `Finding a match…`가 표시되는지 확인한다.
3. refresh 후에도 searching과 같은 self stats가 복원되는지 확인한다.
4. Cancel을 누르고 queue leave가 끝난 뒤 `/`로 돌아가는지 확인한다.
5. 실제 match-found를 검증하려면 서로 다른 Clerk 사용자 2–6명이 동시에 `/play/ladder`에 들어간다. 6 human은 즉시 같은 `ranked` matchId를 받는다. 2–5 human은 최소 40초 동안 추가 인원을 기다린 뒤 arrival-rate projection으로 start를 판단하며, 45초 max wait에는 반드시 start한다. 이 경우 gameplay bot이 roster를 6명까지 채우고 모든 human 화면은 같은 `casual`/unrated matchId를 받아야 한다.
6. handoff 뒤 URL이 `/play/ladder?matchId=...`인지 확인한다. Back → Lobby → Ladder는 이전 match를 다시 열지 않고 새 `Finding a match…` session을 만들어야 한다.
7. Bot-filled roster에서는 `matchParticipants.controlMode`이 human/server_bot으로 나뉘고, bot이 fake `ladderQueueEntries` row를 만들지 않는지 확인한다.

## Deterministic dev fixture

Fixture는 roster/responsive/handoff QA 전용이다. production matching이나 rating policy 검증이 아니다.

```bash
npx convex env set QA_TOOLS_ENABLED true
npx convex env set LADDER_DEV_FIXTURES true
```

Vite dev server에서만 다음 query parameter가 활성화된다.

- `ladderFixture=2|4|6`: 실제 Convex dev matchId와 해당 인원 roster 생성.
- `ladderFixtureDelay=15000`: searching/fidget capture 시간을 확보.
- `ladderRosterSeconds=30`: 3초 production countdown 대신 capture hold 연장.
- `ladderDice=6,4,1,2`: fidget 결과를 고정해 Skull halving을 재현.

예시:

```text
http://localhost:5173/play/ladder?ladderFixture=6&ladderFixtureDelay=0&ladderRosterSeconds=30
```

QA 후 fixture gate를 닫는다.

```bash
npx convex env remove LADDER_DEV_FIXTURES
npx convex env remove QA_TOOLS_ENABLED
```

## Opponent Controller QA roster

기존 virtual opponent + authoritative match path를 사용하는 수동 shortcut이다. Admin claim과 `QA_TOOLS_ENABLED=true`가 필요하다.

1. authenticated admin tab에서 `/admin/opponents`를 먼저 연다.
2. Player가 없는 `0/5 virtual opponents waiting` 상태에서 `Add Ladder Opponent`가 enabled인지 확인한다.
3. 버튼을 1회, 3회, 또는 5회 눌러 bot-first pool을 만든다.
4. authenticated player tab에서 `/play/ladder`를 나중에 연다.
5. pool이 zero가 되고 player + bots 기준 2/4/6 roster가 생성되는지 확인한다.
6. 총 6명이면 즉시, 그보다 적으면 player 입장 40초 뒤 roster/countdown/handoff를 확인한다.

이 경로는 `qa_manual` participant를 가진 `dev` match를 만들며 production matchmaking/gameplay bot 검증이 아니다. Production humans-first six-seat policy는 위의 `실제 queue smoke` 절차로 별도 검증한다. 자세한 admin access/audit 설명은 [Opponent Controller Runbook](./OPPONENT_CONTROLLER.md)의 `Ladder QA`를 따른다.

## Result HUD fixture

release HTML5 bundle의 결과 연출/입력만 빠르게 확인한다. 이 fixture는 standalone local simulator이므로 production Convex rating write나 matchmaking을 검증하지 않는다.

```bash
npm run defold:web:build
cd web && npm run dev -- --host 127.0.0.1
node ../tools/html5-result-check.mjs http://127.0.0.1:5173/play/index.html
```

스크립트는 1280×720에서 4위 탈락 HUD와 `Spectate`, 최종 1위 HUD의 0.5초 hold/eased Elo reel과 `EXIT_TO_LOBBY`를 확인하고, 375×812 및 1440×900 결과 screenshot도 저장한다. 출력은 `.tmp/html5-result-shots/`에 있다.

실제 ranked QA에서는 다음을 별도로 확인한다.

1. 로컬 HP가 0이 되는 authoritative snapshot 직후 gameplay 위에 확정 등수 HUD가 뜬다.
2. `Spectate`는 route/iframe/match subscription을 교체하지 않고 HUD만 닫으며 남은 플레이를 계속 갱신한다.
3. match complete에서 최종 HUD가 다시 열리고 Elo before/after/delta가 보인다.
4. `Return to Lobby`는 iframe을 하나만 해제하고 lobby로 돌아간다.
5. 같은 completion command나 refresh가 `ladderStats` rating/placement를 두 번 반영하지 않는다.

## Viewports / acceptance

- wide desktop: 1440×900
- standard laptop: 1280×720
- narrow mobile: 375×812

각 viewport에서 horizontal/vertical overflow, blank character art, clipped Ready/countdown, console error가 없어야 한다. 2/4/6 roster는 seat order를 유지하고 horizontal scroll 없이 맞아야 한다. Ready 후 URL은 `/play/ladder`에 남고 `ConvexPlayScreen` iframe이 정확히 하나만 mount되어야 한다.
