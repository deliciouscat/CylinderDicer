# Gameplay Bot Runbook

실제 플레이 bot은 Opponent Controller를 자동 클릭하는 QA 도구가 아니다. Convex가 `server_bot` participant의 다음 legal command를 예약하고, human과 동일한 authoritative reducer 경로에 제출한다.

## Architecture

- `virtualOpponents`: 캐릭터 identity/catalog. `catalogScope: gameplay`과 `qa_fixture`를 구분한다.
- `botProfiles`: personality와 pacing parameter. `strategyKey`, `strategyVersion`, `baseMmr`, reaction 범위, honesty/aggression/bluff/challenge/risk/skull/caution/randomness 값을 가진다.
- `matchParticipants`: `controlMode`, `botProfileId`, `botStrategyVersion`, `botParameters`를 매치 시작 시 고정한다. 이후 catalog tuning은 진행 중인 match에 영향을 주지 않는다.
- `convex/bots/observation.ts`: 자기 dice/cylinder와 모든 플레이어의 public 상태만 노출한다. 상대 private dice/cylinder는 decision input에 들어가지 않는다.
- `convex/bots/decision.ts`: 현재 reducer capability 안에서만 load, shake, check, bid, challenge intent를 만든다.
- `convex/bots/scheduling.ts` + `convex/botRunner.ts`: reaction delay 뒤 revision/phase/epoch를 다시 검증하고 기존 `applyMatchCommand`로 command 하나를 제출한다. stale job은 no-op 후 최신 state를 다시 예약한다.

서버가 소유하는 timeout과 automatic transition은 bot command가 아니다. Bot은 player action만 제출하고, match flow scheduler가 shake/check timeout, bidding open, duel execute, round advance를 계속 소유한다.

### Pacing

Profile의 `reactionMinMs`/`reactionMaxMs`는 routine player action의 기본 반응 속도다. 입찰 선택지(`bid` 또는 `challenge`)가 있는 checkpoint는 사람의 숙고가 보이도록 seeded extra delay를 더하고 최종 간격을 1.8–4.2초로 제한한다. 같은 match/revision/profile이면 결과가 deterministic하며, 예약 실행 시 revision/phase/epoch를 다시 확인하므로 오래 생각한 bot이 새 상태를 덮지 않는다.

## Character identity

Bot 이름과 일러스트는 좌석으로 연결하지 않는다. `convex/bots/specs.ts`의 각 bot은 `characterKey`를 명시하고, `virtualOpponents` row와 match participant/MatchState가 이를 보존한다. Ladder의 MMR 정렬, Custom Game의 human 중간 좌석, bot 제거·재추가가 발생해도 같은 bot은 같은 character를 유지한다.

Defold는 snapshot `characterKey`를 `character_key`로 정규화하고 `play/ui/common/character_art.lua`에서 atlas texture를 해석한다. Unknown key는 Rosmund fallback을 사용하지 않는다. 좌석 기반 character는 `characterKey`가 없는 legacy/human fixture에만 허용된다.

Bot이 생각하는 동안 client는 직전 authoritative `currentBid`를 계속 표시한다. Bot의 local draft를 고빈도 command로 중계하지 않으며, 확정된 `bid.raise` 한 건이 reducer를 통과한 뒤 모든 구독자에게 새 count/face가 보인다.

Bot의 count raise는 직전 authoritative bid보다 1–3칸 높게 선택한다. Raise 폭은 match/revision seed에 대해 deterministic하며 aggression, bluff, randomness가 높은 profile일수록 2–3칸 선택 확률이 커진다. Face는 그 count 안에서 private observation과 personality score로 선택한다.

## Personality tuning

현재 기본 identity/personality spec은 `convex/bots/specs.ts`, strategy registry와 version은 `convex/bots/strategies.ts`에 정의된다. parameter를 바꾸면 보수성, bluff/challenge 빈도, Skull 위험 감수, HP/장탄 상태에 따른 caution, reaction 속도와 randomness를 바꿀 수 있다.

- 행동 의미가 달라지는 변경은 `strategyVersion`도 올린다.
- 배포 뒤 새 match부터 새 parameter snapshot을 사용한다.
- 기존 match는 participant에 고정된 parameter/version으로 끝까지 진행한다.
- 현재는 운영 UI나 실시간 remote tuning API를 제공하지 않는다. Code-reviewed catalog 배포가 tuning 경로다.
- difficulty/기준 MMR은 Ladder가 가까운 bot을 선택할 때 쓰는 초기 signal이며 정교한 opponent policy나 bot rating 학습은 범위 밖이다.

## Environment gates

Gameplay bots는 기본 활성화이며 명시적으로 끌 수 있다.

```bash
npx convex env set GAMEPLAY_BOTS_ENABLED false
```

다시 켤 때:

```bash
npx convex env set GAMEPLAY_BOTS_ENABLED true
```

QA controller와 Ladder fixture는 별도 gate다.

```bash
npx convex env set QA_TOOLS_ENABLED true
```

Web production build에서 controller route까지 열어야 하는 특별한 QA build만 `VITE_ENABLE_QA_TOOLS=true`를 사용한다. 일반 production build는 `/admin/opponents`를 렌더하지 않는다. 기존 `LADDER_DEV_FIXTURES=true`는 호환을 위해 server QA gate도 열지만 새 설정에는 `QA_TOOLS_ENABLED`를 사용한다.

## Custom Game smoke

1. 로그인한 사용자가 `/play/custom-game`에서 room을 만든다. 새 room은 host만 있는 `1/6`이어야 하며 bot이 자동 생성되면 안 된다.
2. Host가 `봇 추가`를 원하는 횟수만큼 누른다. Click마다 enabled gameplay catalog의 중복 없는 bot 한 명이 빈 seat에 ready 상태로 들어가며, `6/6`에서는 버튼이 disabled여야 한다. Human guest가 있으면 그 seat를 건너뛴다.
3. Human guest가 있으면 guest는 본인이 ready 해야 한다.
4. Start 후 linked match의 `matchParticipants`를 확인한다.
   - local user: `controlMode: human`
   - virtual players: `controlMode: server_bot`, profile/version/parameter snapshot 존재
5. 게임을 진행하며 `matchCommands`에서 bot command가 `source: bot`, 해당 `actorVirtualOpponentId`로 기록되는지 확인한다.
6. `/admin/opponents`에서 같은 participant를 수동 command 대상으로 사용할 수 없어야 한다.

## Ladder smoke

1. 서로 다른 authenticated human 두 명 이상이 `/play/ladder`에 들어간다.
2. 6 human이면 즉시 같은 ranked matchId를 받는다.
3. 2–5 human이면 40초 전에는 partial match가 시작되지 않아야 한다. Start decision 뒤에는 roster가 gameplay bot으로 6명까지 채워진다.
4. Bot이 포함된 match는 `mode: casual`이며 rating write가 없어야 한다. 6 human match만 `mode: ranked`다.
5. Bot은 `ladderQueueEntries`에 fake user/waiting row를 만들지 않는다.

한 authenticated session만으로 production Ladder bot-fill을 검증했다고 주장하지 않는다. Roster policy는 focused test로 검증할 수 있지만 실제 match-found E2E에는 최소 두 human identities가 필요하다.

## Data inspection

```bash
npx convex data matchParticipants --limit 20
npx convex data matchCommands --limit 40
npx convex data botProfiles --limit 20
```

점검할 항목:

- server bot participant의 frozen profile/version/parameters
- command source와 actor virtual opponent identity
- 한 state에서 duplicate command/handoff가 없는지
- private opponent dice/cylinder가 observation/test fixture에 들어가지 않는지
- bot 혼합 Ladder match에 MMR delta가 기록되지 않는지
- human 입찰부터 다음 bot `bid.raise`/`bid.challenge` command까지 1.8–4.2초인지

## Verification

```bash
npm run convex:typecheck
npm run convex:domain-test
npm run ladder:test
cd web && npm run build
cd ..
npm run phase4:deploy
npm run phase4:check
```

Schema 변경은 optional widen-only다. Legacy participant/catalog row는 default control/scope로 읽고, 새 profile indexes를 사용하므로 별도 backfill migration은 필요하지 않다.
