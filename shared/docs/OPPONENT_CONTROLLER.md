# Opponent Controller Runbook

이 문서는 `http://localhost:5173/admin/opponents` 사용법을 정리한다.

Opponent Controller는 QA/admin 화면이다. 직접 DB state를 패치하지 않고, QA gate가 열린 Convex admin mutation을 통해 `qa_manual` virtual opponent의 room ready와 dev match command를 제출한다. 실제 플레이의 `server_bot`은 이 화면이 아니라 Convex gameplay bot scheduler가 소유한다.

## Prerequisites

- Web dev server 실행:

```bash
cd /Users/deliciouscat/projects/CylinderDicer
npm run dev
```

- Convex dev deployment에 최신 functions/schema 반영:

```bash
npm run phase4:deploy
npm run phase4:check
```

- Clerk 로그인 완료.
- Clerk JWT template `convex`에 admin claim 포함.
- Convex QA tools gate 활성화:

```bash
npx convex env set QA_TOOLS_ENABLED true
```

Vite dev에서는 controller route가 열린다. Production build에 특별히 노출해야 하는 QA bundle만 `VITE_ENABLE_QA_TOOLS=true`를 사용한다.

최소 claim 예시:

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

Claim을 바꾼 뒤에는 sign out/sign in을 다시 해야 새 JWT가 발급된다.

## Access Check

1. `http://localhost:5173/admin/opponents`를 연다.
2. 화면 상단에서 admin access 상태를 확인한다.
3. `Admin access granted`가 아니면 virtual opponent 조작은 불가능하다.

Admin guard는 `convex/adminMatches.ts`의 `probeAdminAccess`로 검증된다. 실패 시 Clerk JWT template 이름이 `convex`인지, claim이 실제 token에 들어갔는지 먼저 확인한다.

## Core Concepts

### Custom Game Room

`/play/custom-game`에서 사람이 만든 방이다.

- room host는 human user다.
- virtual opponents는 `customGameParticipants`에 들어간다.
- virtual opponents는 기본적으로 자동 ready다. Human guest는 본인이 ready 해야 한다.
- 모든 required player가 ready가 되면 host가 Start 할 수 있다.
- Start 후 room은 matchId를 갖고, play 화면은 `/play/dev?matchId=...`로 열린다.
- Start된 casual match의 virtual participants는 `server_bot`이며 Convex scheduler가 행동한다. Opponent Controller는 이들을 대신 조작하지 않는다.

### Standalone Dev Match

Opponent Controller의 `Create Dev Match`가 만드는 개발용 match다.

- Custom Game room을 만들지 않는다.
- `customGameRooms`가 비어 있어도 정상이다.
- 빠른 admin command 테스트용이다.
- Custom Game room/ready/start QA를 대체하지 않는다.

### Dev Match Cleanup

`Dev Matches` 목록은 아직 `ready` 상태인 standalone/Ladder QA dev match다. Custom Game room 자체가 아닐 수도 있다.

- 각 row의 `Remove`: 해당 ready dev match를 먼저 terminal `complete`로 전환한 뒤, `matchParticipants`, state/snapshot, command/event, 연결된 custom room/participant와 match parent를 physical purge한다.
- `Remove All (N)`: 현재 보이는 ready dev match를 하나씩 같은 complete → purge path로 제거한다.
- 이 동작은 `dev` mode에만 허용된다. Ranked/casual match는 대상이 아니다.
- purge는 bounded batch를 모두 소비할 때까지 반복한다. `adminAudit`은 운영 증적으로 보존되며 physical purge 대상이 아니다.

### Ladder QA

`/play/ladder`에서 waiting 중인 최신 authenticated session에 virtual opponent를 순서대로 stage하는 QA shortcut이다.

1. player tab에서 Ladder를 열기 전에 admin tab의 `Ladder QA` panel을 확인한다. `0/5 virtual opponents waiting` 상태에서도 `Add Ladder Opponent`가 enabled여야 한다.
2. `Add Ladder Opponent`를 1–5회 눌러 bot을 먼저 queue한다. 예: 3회면 `3/5 virtual opponents waiting`이다.
3. 그 뒤 player tab에서 `http://localhost:5173/play/ladder`를 연다. Player가 후순위로 들어오면서 waiting bot pool을 claim한다.
4. player + 미리 대기하던 bot 수의 roster가 생성되는지 확인한다. 예: bots 3 + player 1 = 4-player roster.
5. claim 뒤 admin pool은 `0/5`로 돌아가야 한다.
6. player 입장 뒤 40초 동안 추가 bot을 모은다. 총 6명이 되면 즉시, 그렇지 않으면 40초 시점에 Ladder tab에 Match Found roster가 나타난다.
7. countdown 후 같은 `/play/ladder?matchId=...` URL에서 기존 `ConvexPlayScreen`이 단 한 번 mount되는지 확인한다.

각 click은 `adminAudit`의 `ladder.qa.add_opponent` row로 남는다. Staged row는 cancel, production match-found, QA finalize에서 정리된다. QA finalize는 기존 authoritative match/participant/snapshot contract로 `dev` match를 만들며 production adaptive 2–6 policy와 분리된다.

## Main QA Flow

### 1. Host Creates Custom Game Room

Host tab:

1. `http://localhost:5173/play/custom-game` 접속.
2. `Create` 클릭.
3. room 화면에서 invite code와 player list 확인.

Expected Convex data:

- `customGameRooms` row 생성.
- `customGameParticipants`에 host human + virtual opponents 생성.
- host participant는 ready 취급.
- virtual opponents는 자동 ready다.

### 2. Optional Ready-State QA

`Ready All` / `Unready All`은 composing room의 ready-state 회귀를 수동으로 만들기 위한 QA control이다. 정상 product flow에서는 필요하지 않다.

1. Admin tab의 Custom Rooms에서 host room을 선택한다.
2. `Unready All`로 Start guard를 확인한다.
3. `Ready All`로 virtual opponents를 복원한다.

Expected:

- host 화면의 virtual opponent ready 상태가 live 반영된다.
- `adminAudit`에 room ready 관련 row가 남는다.
- Guest human이 있는 경우 guest ready는 guest 본인이 `/play/custom-game`에서 해야 한다.

### 3. Host Starts Match

Host tab:

1. 모든 required participant ready 확인.
2. `Start` 클릭.
3. `/play/dev?matchId=...`로 이동하거나 Open Match 버튼으로 같은 match를 연다.

Admin tab:

1. started room에서 `Open Started Match`를 클릭하거나 URL에 `?matchId=...`를 붙인다.
2. selected match panel이 같은 `matchId`를 보고 있는지 확인한다.

Expected:

- Play tab과 Admin tab이 같은 Convex match state를 공유한다.
- `/play/dev?matchId=...`의 current user는 match participant여야 private delta를 받을 수 있다.

### 4. Gameplay Bot Match

Human player action:

- play tab에서 수행한다.
- 예: setup load, shake, dice check, bid/challenge 등 human turn command.

Virtual opponent action:

- Custom Game에서 시작된 `server_bot`은 Convex internal scheduler가 수행한다.
- command는 human과 같은 authoritative reducer를 통과하고 `source: bot`으로 기록된다.
- Admin tab은 `server_bot` command를 거부한다.

Typical smoke:

1. Human setup load.
2. Bot이 자신의 legal load/shake/check command를 reaction delay 뒤 제출하는지 확인한다.
3. 6초 timeout이 먼저 끝나도 stale bot job이 이전 phase를 덮지 않는지 확인한다.
4. 마지막 check 후 자동으로 bidding gap/open을 통과하는지 확인한다.
5. Bot bid/challenge가 authoritative validator를 통과하는지 확인한다.
6. 다음 round에서도 scheduler가 새 revision/phase/epoch에 맞춰 이어지는지 확인한다.

Standalone `Create Dev Match`의 `qa_manual` player command 회귀는 기존처럼 Admin tab에서 수동 제출할 수 있다. 이 경로는 gameplay bot 검증이 아니다.

## URL Shortcuts

- Admin root:

```text
http://localhost:5173/admin/opponents
```

- Select a custom room:

```text
http://localhost:5173/admin/opponents?roomId=<customGameRoomId>
```

- Select a started match:

```text
http://localhost:5173/admin/opponents?matchId=<matchId>
```

- Play linked match:

```text
http://localhost:5173/play/dev?matchId=<matchId>
```

## Buttons

- `Create Dev Match`: standalone dev match 생성 또는 재사용. Custom Game room 생성 버튼이 아니다.
- `Remove`: one ready dev match와 그 QA game data를 영구 삭제한다. 완료/삭제 audit은 남는다.
- `Remove All (N)`: 표시 중인 ready dev matches 전체를 같은 방식으로 영구 삭제한다.
- `Add Ladder Opponent`: human이 없으면 QA bot pool에 먼저 enqueue하고, human이 이미 waiting이면 그 session에 직접 stage한다. Bot-first pool은 human join을 기다린다. Human 입장 후 총 6명이 되면 즉시, 그보다 적으면 최초 입장 40초 시점에 2–5 player dev roster를 확정한다.
- `Ready All`: selected Custom Game room의 virtual opponents를 ready 처리한다.
- `Unready All`: selected Custom Game room의 virtual opponents를 unready 처리한다.
- `Open Started Match`: started room의 linked match를 admin match panel로 연다.
- `Load All`: 현재 selected bot의 setup/bullet load를 가능한 만큼 반복 제출한다.
- `Complete Shake`: selected bot의 로컬 gauge를 모사하지 않고 `shake.complete`를 즉시 한 번 제출한다. 모든 생존 bot에 대해 수행할 수 있으며, 6초 phase timeout이 먼저 끝나면 action이 사라진다.
- Bid `Face`의 `Skull (1)`: protocol face `1`이다. 현재 bid보다 낮으면 controller가 다음 count의 skull로 올려 유효한 raise를 제출한다.
- Command buttons: selected `qa_manual` dev opponent의 match command를 제출한다. `server_bot` 대상은 거부한다.

Custom Game의 bot 추가/선택/room composition은 Custom Game host 화면의 책임이다. 실제 행동은 gameplay bot scheduler가 소유한다. 예외적으로 Ladder QA panel은 waiting Ladder session의 2–6 dev roster smoke test를 위해 QA fixture opponent를 stage하며, standalone dev match controls는 `qa_manual` command 회귀에 사용한다.

## Audit

Opponent Controller actions는 `adminAudit`에 기록된다.

기록 대상:

- room ready/unready 성공.
- room ready/unready reject.
- match command 성공.
- match command reject.
- non-dev match reject.
- target player missing.
- target not bot.
- reducer reject.
- Ladder QA opponent stage 성공/reject.

UI의 Recent Admin Audit panel에서 최근 row를 확인할 수 있다.

## Common Troubleshooting

### `UNAUTHORIZED`

- Clerk JWT template 이름이 `convex`인지 확인.
- JWT template에 `role: "admin"` 또는 `roles: ["admin"]`이 있는지 확인.
- sign out/sign in으로 token을 새로 발급한다.
- `npm run phase4:check`로 live deployment에 admin functions가 올라갔는지 확인한다.

### Custom Game Rooms Is Empty

정상일 수 있다. Opponent Controller의 `Create Dev Match`는 Custom Game room을 만들지 않는다.

Custom Game room QA는 반드시 `/play/custom-game`에서 human host가 `Create`를 눌러 시작한다.

### Ladder QA Session Is Empty

- Player session이 없어도 정상이며 `Add Ladder Opponent`가 enabled여야 한다. 이 상태의 숫자는 human을 제외한 waiting bot 수다.
- Player가 `/play/ladder`에 들어오면 pool이 zero가 되고 player name + total roster count로 표시가 전환된다.
- 이미 Match Found 또는 gameplay handoff가 끝난 session은 waiting target이 아니다.

### Play Tab Cannot Open Match

- `/play/dev?matchId=...`의 로그인 user가 match participant인지 확인한다.
- 다른 사람이 만든 방에 들어가는 guest flow는 invite/join으로 participant가 된 뒤 Start되어야 한다.
- non-participant spectator는 현재 범위가 아니다.

### Command Returns `STALE_REVISION`

Admin UI는 selected match subscription/refresh를 통해 최신 state를 다시 읽는다. 같은 command를 반복해서 누르기보다 panel이 최신 phase/action으로 바뀌었는지 확인한다.

### Reload UI Stays After Setup Load

서버 state가 이미 `cup_shake`로 넘어갔는데 HTML5 bundle이 stale한 경우가 있다.

1. `/play/dev?matchId=...` hard refresh.
2. Defold Lua 수정 후라면 HTML5 bundle을 다시 만들고 sync:

```bash
npm run defold:web:build
```

## Current Limits

- Production-grade admin role policy는 아직 dev/QA 중심이다.
- Bot은 Clerk user가 아니다.
- Bot-host room은 지원하지 않는다. Custom Game room은 human host가 만들고 virtual opponents는 자동 ready/server-controlled participant가 된다.
- Gameplay personality는 versioned code catalog를 배포해 조정한다. 운영 UI/실시간 remote tuning은 아직 없다.
- Spectator-only play tab은 아직 지원하지 않는다.

실제 bot runtime 운영은 [Gameplay Bot Runbook](./GAMEPLAY_BOTS.md)을 따른다.
