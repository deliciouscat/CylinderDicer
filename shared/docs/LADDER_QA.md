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
5. 실제 match-found를 검증하려면 서로 다른 Clerk 사용자 2명이 동시에 `/play/ladder`에 들어간다. 첫 slice는 2인 FIFO이며 두 화면이 같은 ranked matchId를 받아야 한다.

## Deterministic dev fixture

Fixture는 roster/responsive/handoff QA 전용이다. production matching이나 rating policy 검증이 아니다.

```bash
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
```

## Viewports / acceptance

- wide desktop: 1440×900
- standard laptop: 1280×720
- narrow mobile: 375×812

각 viewport에서 horizontal/vertical overflow, blank character art, clipped Ready/countdown, console error가 없어야 한다. 2/4/6 roster는 seat order를 유지하고 horizontal scroll 없이 맞아야 한다. Ready 후 URL은 `/play/ladder`에 남고 `ConvexPlayScreen` iframe이 정확히 하나만 mount되어야 한다.
