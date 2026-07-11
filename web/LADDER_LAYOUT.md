# 개요
래더 매칭 대기 → 모인 플레이어 소개까지의 Vue SPA 레이아웃 스펙.
두 화면은 UI상 분리되지만 라우트는 하나(`/play/ladder`)이며, `LadderShell`이 phase로 전환한다.
매칭 성사·소개 연출이 끝나면 Defold play wrapper(`ConvexPlayScreen`)로 handoff.

# 의존 (in-repo, 모듈 공통)
- `@/services/convex/matchService`     → ladder queue enter / leave / match found
- `@/services/convex/*`                → 프로필·전적 조회 (MMR, recent20, all-time)
- `@/i18n`                             → `t('ladder.*')`
- `@/assets/assetLoader`               → 배경·칩·주사위·캐릭터 일러스트
- play-wrapper / gameBridge            → 소개 종료 후 matchId로 인게임 진입
Stylesheet: `web/src/app/styles.css` (ladder 토큰은 구현 시 섹션 추가)

# 모듈
```
web/src/ladder/
├── LadderShell.vue          # SPA 루트. phase = searching | roster | handing_off
├── LadderLoading.vue        # 매치 대기 + fidget
├── LadderRoster.vue         # 모인 플레이어 동시 소개
├── components/
│   ├── LadderSelfStats.vue  # 내 MMR + 최근 20판 요약
│   ├── DiceFidget.vue       # 주사위 굴리기 + 칩 스택
│   ├── ChipStack.vue        # fidget 칩 시각화
│   └── RosterPlayerCard.vue # 일러스트 + 전적요약 1인분
└── ladder.types.ts          # phase, stats, roster player 타입
```

# 공통 용어
```
mmr                    = 현재 매치메이킹 점수
recent20_avg_place     = 최근 20판의 normalize 평균 등수
all_time_avg_place     = 전체 판의 normalize 평균 등수

normalize_place(place, player_count):
    """
    모든 판을 6인 기준으로 환산한 등수.
    예: 4인전 2등 → (2 - 1) / (4 - 1) * (6 - 1) + 1 = 약 2.67
    공식: (place - 1) / (player_count - 1) * 5 + 1
    player_count == 1 이면 1.0
    """
    return normalized_place_1_to_6

avg_place(matches):
    return mean([normalize_place(m.place, m.player_count) for m in matches])
```
표시는 소수 1자리(예: `2.7`). 판 수 부족 시 `—` 또는 `n/N판` 보조 표기.

# LadderShell.vue
```
# 의존 (in-repo)
- LadderLoading.vue
- LadderRoster.vue
- matchService / ladder queue subscription

phase = 'searching' | 'roster' | 'handing_off'
self_stats = { mmr, recent20_avg_place, recent20_count }
roster = [RosterPlayer, ...]   // match found 시 채움. 좌→우 seat 순
match_id = Id<'matches'> | null

shell = ZStack(
    [
        LadderBackground(),

        Switch(phase,
            searching = LadderLoading(
                self_stats = self_stats,
                on_cancel = leave_queue_and_back_to_lobby
            ),
            roster = LadderRoster(
                players = roster,
                on_ready_or_timeout = begin_handoff
            ),
            handing_off = HandoffScrim()   // play wrapper mount 직전 짧은 암전/페이드
        ),

        // 공통 chrome (양 phase 공유 가능)
        TopBar(
            [
                BackButton().design_detail(*"searching에서만 활성. roster 중엔 숨기거나 disabled"),
                Spacer(),
                PhaseLabel(text = locale.ladder.phase[phase])
            ]
        ).style(pointer_events = 'box-none')
    ]
)
```

## phase 전이
```
lobby.click(ladder)
  → enter_queue
  → phase = searching

match_found(roster, match_id)
  → phase = roster
  → (선택) searching fidget 상태를 즉시 폐기. 칩/주사위는 로컬 only

roster.hold ≈ 2.5~4s 또는 Ready
  → phase = handing_off
  → navigate/mount ConvexPlayScreen(match_id)
```

# LadderLoading.vue
```
# 의존 (in-repo)
- LadderSelfStats.vue
- DiceFidget.vue
- ChipStack.vue

loading = VerticalGrid(
    [
        // [Row 1] 내 스탯 — 대기 중에도 “내가 누구인지”만 고정
        LadderSelfStats(
            mmr = self_stats.mmr,
            recent20_avg_place = self_stats.recent20_avg_place,
            recent20_count = self_stats.recent20_count
        )
            .style(align = 'center', width = 100%)
            .design_detail(*"상단 중앙. MMR을 주 숫자, 최근 20판 평균등수를 보조 한 줄. 카드/박스 과다 금지 — 텍스트 계층만"),

        Spacer(flex = 1),

        // [Row 2] Fidget — 화면의 주인공
        VerticalGrid(
            [
                ChipStack(
                    chips = fidget.chips
                ).design_detail(*"주사위 바로 위. 칩이 위로 쌓이거나 skull 시 절반 사라지는 연출. 점수/보상과 무관한 로컬 토이"),
                Spacer(),
                DiceFidget(
                    on_roll = apply_fidget_outcome
                ).design_detail(*"중앙. 탭/클릭 또는 스와이프로 굴림. 굴리는 동안 매칭 폴링/구독은 방해하지 않음")
            ],
            alignment = 'center'
        ),

        Spacer(flex = 1),

        // [Row 3] 매칭 상태
        HorizontalGrid(
            [
                MatchingPulse(),
                Text(locale.ladder.searching)
            ],
            alignment = 'center'
        ).design_detail(*"하단. ‘매칭 중…’ + 약한 pulse. ETA/큐 인원은 1차에서 생략"),

        // [Row 4] 취소
        TextButton(
            text = locale.common.cancel,
            action = on_cancel
        ).style(align = 'center', margin_bottom = 4%)
    ],
    width = 100%,
    height = 100%,
    padding = 4%
)
```

## LadderSelfStats.vue
```
self_stats_view = VerticalGrid(
    [
        Text(format_mmr(mmr)).style(role = 'display'),
        Text(
            locale.ladder.recent20_avg_place.format(place = recent20_avg_place, n = recent20_count)
        ).style(role = 'caption')
            .design_detail(*"예: ‘최근 20판 평균 2.7등’. n < 20이면 ‘최근 n판 평균 …’")
    ],
    alignment = 'center'
)
```

## DiceFidget / ChipStack 규칙
```
fidget = { chips: int }   // 초기 chips = 0. 상한 권장 99 (표시 overflow 방지)

on_roll():
    face = roll_fair_d6()          // 1=skull, 2..6=pip
    play_roll_animation(face)
    if face == skull:
        fidget.chips = floor(fidget.chips / 2)
        play_chip_halve_fx()
    else:
        fidget.chips += 1
        play_chip_gain_fx()

# 구현 메모
- skull 아이콘은 인게임 face `1` 해골과 동일 언어 사용 (GAME_RULES 특수 눈)
- 칩은 경제/시즌 보상과 연결하지 않음. 새로고침·phase 전환 시 소멸 OK
- 연타 시 이전 롤 애니 중이면 입력 ignore 또는 큐 1개까지
```

# LadderRoster.vue
```
# 의존 (in-repo)
- RosterPlayerCard.vue

roster_view = VerticalGrid(
    [
        Text(locale.ladder.match_found)
            .style(role = 'eyebrow', align = 'center')
            .design_detail(*"짧은 라벨만. 카운트다운 숫자는 카드 하단 또는 TopBar에 둘 것"),

        Spacer(height = 3%),

        // 전원 동시 등장 — 이 화면의 주인공
        HorizontalGrid(
            [
                RosterPlayerCard(player = p)
                for p in players   // seat 순, 보통 2~6
            ],
            alignment = 'end',     // 발/하단 기준 정렬 → 일러스트 키 차이 흡수
            gap = 'fluid'
        )
            .style(flex = 1, width = 100%)
            .design_detail(*"동시 페이드+살짝 rise. 한 명씩 스포트라이트 금지(1차). 인원수에 따라 카드 폭·갭 축소. 6인일 때 가로 스크롤 만들지 말 것 — 스케일로 맞출 것"),

        Spacer(height = 2%),

        ReadyOrCountdown(
            seconds = 3,
            on_done = on_ready_or_timeout
        ).style(align = 'center')
    ],
    width = 100%,
    height = 100%,
    padding = 3%
)
```

## RosterPlayerCard.vue
```
card = VerticalGrid(
    [
        CharacterIllust(
            src = player.character_art,
            highlight = player.is_self
        )
            .design_detail(*"상반신/전신 일러. is_self면 일러스트를 약간 크게."),

        Text(player.display_name).style(role = 'title', align = 'center'),

        Text(format_mmr(player.mmr)).style(role = 'caption', align = 'center'),

        Text(
            locale.ladder.roster_places.format(
                recent20 = player.recent20_avg_place,
                all_time = player.all_time_avg_place
            )
        )
            .style(role = 'caption', align = 'center')
            .design_detail(*"예: ‘최근 2.7 · 전체 3.1’. 두 숫자만. 승패 표/상세 모달은 1차 범위 밖")
    ],
    alignment = 'center'
)
```

# 화면별 일감 (복잡도 가드)
| Phase | 넣는다 | 넣지 않는다 |
|-------|--------|-------------|
| searching | 내 MMR, 최근20 평균등수, 주사위 fidget+칩, 매칭 중 라벨, 취소 | 접속 유저 부유, 큐 ETA, 리더보드, 팁 카드, 채팅 |
| roster | 전원 일러 동시 등장, 이름, MMR, 최근20·전체 평균등수, 짧은 countdown | 상세 전적 표, 스킨 갤러리, 최근 대전 상대, fidget 잔존 |

# 구현 고려사항
- `/play/ladder`는 현재 `App.vue`에서 `ConvexPlayScreen`으로 직행한다. Ladder SPA 도입 시 `activeScreen === 'ladder'` 분기를 추가하고, roster 종료 후에만 play wrapper를 mount한다.
- Searching ↔ Roster는 라우트 변경 없이 `phase`만 바꾼다. 뒤로가기는 `searching`에서만 로비로, `roster`에서는 match leave 정책이 정해지기 전엔 back 비활성.
- Fidget 상태는 서버에 올리지 않는다. match_found 시 즉시 discard.
- `normalize_place`는 클라이언트 표시용 헬퍼와 서버 집계가 **동일 공식**을 써야 한다. 공식 변경 시 이 문서와 Convex 집계를 함께 수정.
- Roster 인원 2~6에 대해 카드 스케일 브레이크포인트(예: ≤3 크게 / 4~5 중간 / 6 압축)를 CSS로 고정해 두고, 가로 스크롤은 쓰지 않는다.
- 소개 연출 중 Defold 번들 preload를 시작하면 handing_off 체감 지연이 줄어든다 (선택).
- i18n 키는 `ladder.searching`, `ladder.match_found`, `ladder.recent20_avg_place`, `ladder.roster_places` 등을 `web/src/i18n/{ko,en,ja}.json`에 추가.

# 비범위 (이 문서)
- 매칭 알고리즘·티어 경계·시즌 리셋
- 캐릭터 아트 파이프라인 / 스킨 해금
- 인게임 HUD (기존 `play/ui` 계약 유지)
- Fidget 칩의 계정 저장·시즌 보상 연동
