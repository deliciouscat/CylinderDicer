# 화면 구성 Pseudo-code
아래의 Flutter-Python-like한 의사코드를 기반으로 게임 화면을 구현할 것.

> 화면에 노출되는 모든 문자열은 하드코딩하지 않고 `t(key, **params)`로 인용한다.
> `t`는 현재 로케일에 맞춰 `assets/locale/<locale>.json`에서 문자열을 찾는 헬퍼다.
> (예: `t("action.pass")`, `t("bid.count_face", count=5, face=4)`)
> 게임 화면의 구체 visual은 실제 PNG/atlas asset만 사용한다. asset 파일이 아직 없으면 벡터/도형으로 대체 구현하지 말고, 해당 visual은 숨기거나 텍스트 상태값만 노출한다.


## 게임 플레이 화면
```
BACKGROUND = "assets/images/backgrounds/default/background.png"  # 세로방향 파노라마. 위쪽은 인물/공간, 아래쪽은 테이블

bgLogation = {
    "bidding": *"풍경 보이는 상단 위치",
    "dualing": *"테이블 있는 하단 위치",   # 결투: 모두의 주사위 눈금을 테이블에서 확인
    "shaking": *"테이블 있는 하단 위치",
}

def bgAnimate(~):
    *"현재 위치에서 input 위치로 easing 이동하는 알고리즘"
    return *"위치 값"

# 상단 턴 표시 배너. 현재 턴 종류에 맞는 라벨을 로케일에서 인용.
ternIndicator = Banner(
    text = {
        "bidding": t("turn.mine") if state.isMyTurn else t("turn.opponent"),
        "dualing": t("turn.duel"),
        "shaking": t("turn.shake"),
    }[data.currentTurn.kind]
)

app = Stack(
    [
        # 1. 턴에 따라 교체되는 메인 레이어
        VerticalGrid(
            [
                ternIndicator,
                main            # BlockController가 턴별 블럭으로 교체
            ],
        ),

        # 2. 블럭 교체와 무관한 overlay 레이어.
        #    cylinder asset이 준비되면 단일 인스턴스로 운용한다.
        #    asset이 없을 때는 가짜 도형 cylinder를 만들지 않고 offscreen/hidden 상태로 둔다.
        cylinderOverlay,
    ],
    background = BACKGROUND,
    backgroundLocation = bgAnimate(bgLocation(data.currentTurn))
)
```

#### 배경 / cup shake GUI

```
# 배경은 단일 세로 파노라마 sprite다. 1280x720 viewport 너비에 맞게 scale하고,
# background GO의 y 위치를 tween해서 위/아래 시점을 전환한다.
backgroundPanorama = Sprite("/assets/images/backgrounds/default/background.png")

# cup_shake 화면의 컵은 shake.gui가 소유한다.
# 로컬 컵은 화면 중앙 전경, 상대 컵은 player arc와 같은 반원 좌석에 배치한다.
# cup_shake에서는 모든 컵이 닫혀 있고, dice_check에서는 로컬 컵만 위로 올라간다.
# 캐릭터와 컵은 ui/common/table_seat_layout.lua의 좌석 결과를 공유한다.
```

#### 위치 앵커 — cylinder가 오갈 좌표만 제공 (그리기 X)

```
# 앵커는 '위치값'만 제공하는 보이지 않는 기준점이다.
# cylinder는 어떤 블럭의 자식도 아니며, 아래 앵커 사이를 tween으로 오간다.
anchors = {
    # localPlayerHUD 그룹이 정의하는 우하단 rest 위치(= inline 홈).
    # HUD 그룹은 여기서 '위치 indicator' 역할만 한다.
    "hud":       localPlayerHUD.cylinderAnchor,
    # 최초/shaking 장전 시 부각되는 화면 중앙 등 focal 위치.
    "focal":     *"화면 중앙(또는 테이블 위) 좌표",
    # 화면 밖 대기 위치.
    "offscreen": *"화면 밖 좌표",
}
```

### `main` 화면 블럭

```
def BlockController(turn = data.currentTurn):
    # 현재 턴 종류에 따라 보여줄 블럭을 교체. 전환은 bgAnimate와 동기화.
    return {
        "bidding": BiddingTurnBlock,
        "dualing": DuelTurnBlock,
        "shaking": ShakeTurnBlock,
    }[turn.kind]


BiddingTurnBlock(
    [
        playerCarousel,   # 상단: 모든 플레이어(나 포함) 한 줄 배치
        rail,             # 중단: 0~36 베팅 레일(보이는 구간만 표시) + 콜 표시
        localPlayerHUD    # 하단: 내 캐릭터 + 주사위 트레이 (+ cylinder 앵커)
    ],
    # 베팅 진행 상태(누가 무엇을 불렀는지, 내 차례인지)
    state = data.bidding
)
# 참고: cylinder는 이 블럭의 자식이 아니라 app의 cylinderOverlay에 있다.
#       localPlayerHUD는 cylinder가 inline일 때 머물 'hud 앵커'만 제공한다.
```

#### `playerCarousel` — 플레이어 줄 (local 포함)

```
# 모든 플레이어(내 캐릭터 포함)가 turn 진행에 따라 교체되는 루프.
# 내 캐릭터도 다른 플레이어와 동일하게 이 carousel 안에 들어간다.
playerCarousel = HorizontalGrid(
    [ PlayerSlot(p) for p in data.players ],
    alignment = SPACE_BETWEEN,
)

def PlayerSlot(player):
    return Stack(
        [
            # 캐릭터 초상(턴 비활성 플레이어는 PNG/atlas 초상을 디밍 처리)
            Portrait(
                image  = player.portrait,
                dimmed = not player.isActiveTurn,
            ),

            # 가슴 위치 배지: 남은 총알 수(실린더) + 체력(하트)
            Align(BOTTOM_LEFT, StatusBadge(player)),

            # '내 턴'일 때만 내 캐릭터 위에 베팅 조작 UI를 노출.
            # (예시 화면은 내 턴 상태라 내 캐릭터 위에 이 요소들이 보인다)
            Align(CENTER, BidControls()) if (player.isLocal and state.isMyTurn) else None,
        ]
    )

def StatusBadge(player):
    # 좌: 실린더 아이콘 + 장전된 총알 수 / 우: 하트 + HP
    return Row([
        Badge(icon = "revolver_cylinder", value = player.bullets),
        Badge(icon = "heart",             value = player.hp),
    ])
```

#### `BidControls` — 내 턴 전용 베팅 조작 UI

```
# 아래 3가지는 모두 '내 턴'일 때만 표시되는 요소다.
#   1) 넘기기(bid) 버튼
#   2) 넘기기에 쓸 주사위 눈을 설정하는 위/아래 화살표(▲▼)
#   3) 결투신청 버튼
def BidControls():
    return Row([
        # 넘기기 버튼 + 주사위 눈 설정 화살표를 한 묶음으로 배치
        Row([
            # 넘기기: 현재 선택한 (개수·면)으로 베팅을 올려 다음 플레이어에게 넘김
            Button(
                label   = t("action.pass"),
                sub     = t("bid.count_face", count=state.myBid.count, face=state.myBid.face),
                icon    = "die_face",
                enabled = state.myBid.isValid,         # 직전 콜보다 높아야 활성
                onTap   = lambda: emit("bid.raise", state.myBid),
            ),
            # 주사위 눈(면) 설정 위/아래 화살표: 한 칸씩 눈을 올리고 내림.
            # 면 범위는 1~6이며 1은 해골로 표기(DiceFace 규칙).
            Column([
                ArrowButton(dir = UP,   onTap = lambda: state.myBid.nextFace()),
                ArrowButton(dir = DOWN, onTap = lambda: state.myBid.prevFace()),
            ]),
        ]),

        # 결투신청: 직전 플레이어의 콜을 거짓이라 의심하고 검증
        Button(
            label   = t("action.challenge"),
            icon    = "target",
            style   = DANGER,                          # 붉은 강조
            enabled = state.hasPreviousBid,
            onTap   = lambda: emit("bid.challenge"),
        ),
    ])
```

#### `rail` — 0~36 베팅 레일 (스크롤 윈도우)

```
# 레일 전체 범위는 0~36(베팅 개수). 화면에는 보이는 구간(window)만 렌더.
# 좌우 칸은 화면 밖으로 잘려 안 보이며, 드래그/스크롤로 윈도우가 이동.
rail = Stack([
    Track([
        RailCell(
            n        = n,
            isSkull  = n in data.skullCells,           # 해골(위험/특수) 칸
            selected = (n == state.myBid.count),       # 내가 현재 고른 개수
        )
        for n in state.rail.visibleRange              # 예: 1..10 처럼 보이는 구간만
    ]),

    # 직전 턴 콜은 레일 위에 표시(어떤 플레이어가 몇 개·어떤 면을 불렀는지).
    # 해당 개수 칸 위에 말풍선처럼 얹는다.
    *[
        Anchor(at = bid.count, child = BidMarker(bid))
        for bid in state.recentBids
    ],

    # 현재 선택 위치를 가리키는 포인터(▲▼)
    Pointer(at = state.myBid.count),

    # 조작: 레일을 드래그/스크롤하여 개수 선택 + 윈도우 이동
    # (PC: 드래그·←→·스크롤, 모바일: 터치 드래그)
    GestureDetector(
        onDrag = lambda dx: state.rail.scrollAndSelect(dx),
    ),
])

def BidMarker(bid):
    # 직전 콜 표기: 개수 + 면 (예: 5개 · 4). 면 1은 해골로 표기(DiceFace).
    return Row([
        Badge(icon = "revolver_cylinder", value = bid.count),  # 개수
        DiceFace(bid.face),                                    # 면(1=해골)
    ])
```

#### `localPlayerHUD` — 내 캐릭터 영역

```
localPlayerHUD = Row([
    # 좌: 내 캐릭터 초상(활성 강조)
    Portrait(image = data.localPlayer.portrait, highlighted = True),

    Column([
        # 안내 문구 영역. 현재 상황에 맞는 안내 키를 로케일에서 인용.
        # (예: bidding 상태 → t("hud.hint.bidding"))
        Hint(text = t(state.hintKey)),

        # 내 주사위 표시줄: Shake 턴에 굴려서 '랜덤으로 배정'받은 결과를 보여줌.
        # (플레이어가 고르는 UI가 아니라 굴림 결과 디스플레이)
        # 면 인덱스는 1~6이며, 1은 해골 아이콘으로 대체 표시한다.
        DiceTray(
            dice  = data.localPlayer.dice,             # Shake에서 배정된 값들
            #      face == 1 이면 "skull" 아이콘으로 렌더
        ),
    ]),

    # 우: cylinder가 inline일 때 머무를 '앵커'만 둔다(실제 cylinder는 overlay).
    #     HUD는 위치 indicator 역할만 하며, cylinder를 자식으로 소유하지 않는다.
    Anchor(id = "hud", expose_as = "cylinderAnchor"),
])
```

#### `DiceFace` — 주사위 면 표기 규칙

```
# 주사위 면은 1~6. 단, 1은 해골 인덱스로서 해골 아이콘으로 그린다.
def DiceFace(face):
    return Icon("skull") if face == 1 else PipFace(face)   # 2~6은 점(pip)
```

#### `cylinderOverlay` — 단일 cylinder (영구 인스턴스, 앵커 사이 이동)

```
# cylinder는 어떤 블럭의 자식도 아닌, app overlay의 '단일 영구 인스턴스'다.
# 생성/삭제·reparent 하지 않고, 데이터(state)와 위치(presentation)를 분리한다.
#   - 데이터: player.cylinder (장전 슬롯, pendingLoad) — 턴과 무관하게 항상 존재
#   - 위치  : 아래 규칙으로 정한 target 앵커로 tween 이동만 수행
#
# 총알 장전 규칙:
#   - 게임 시작 시: 각 플레이어 3발(setup).
#   - bidding(넘기기)으로 턴 넘긴 직후, '넘기기 한 본인만' 1발.
#   - 쉐이킹 턴(게임 최초 쉐이킹 제외)마다 1발.
#   - 결투신청 시에는 장전하지 않는다.
#   - EXACT 결투 집행 후: 정확히 맞춘 사람(previousBidder)만 3발 충전 후 shaking 시작.
#     다른 플레이어는 pendingLoad 없이 shaking에 참여한다.

def cylinderTarget():
    # 턴 맥락에 따라 cylinder가 가야 할 앵커를 결정.
    if state.pendingLoad and data.currentTurn.kind in ("shaking", "setup"):
        # setup(3발), shaking(1발), EXACT 결투 후 3발 충전 모두 focal 부각
        return anchors["focal"]
    if data.currentTurn.kind == "bidding":
        return anchors["hud"]          # bidding: 우하단 inline 홈
    return anchors["offscreen"]        # 그 외(예: 결투): 화면 밖 대기

cylinderOverlay = AnchorMover(
    target = cylinderTarget(),         # 목표 앵커가 바뀌면 자동으로 easing 이동
    child  = RevolverCylinder(player = data.localPlayer),
)

def RevolverCylinder(player):
    # 위치/연출과 무관하게 '데이터 + 장전 인터랙션'만 담당.
    canLoad = state.pendingLoad and player.isLocal       # 장전 대기 상태
    return Stack([
        CylinderArt(),                                    # 실린더 외형
        *[
            CylinderSlot(
                index  = i,
                loaded = slot.isLoaded,
                # 비어있는 칸에만 invisible 버튼. 장전 대기일 때만 활성.
                button = InvisibleButton(
                    enabled = canLoad and not slot.isLoaded,
                    onTap   = lambda i=i: emit("bullet.load", i),  # 장전 후 pendingLoad 해제
                ) if not slot.isLoaded else None,
            )
            for i, slot in enumerate(player.cylinder.slots)
        ],
    ])


ShakeTurnBlock
```

#### `DuelTurnBlock` — 결투(눈금 공개 + 데미지 집행)

```
# 진입: 어떤 플레이어가 'bidding.challenge'(결투신청)를 누르면 이 블럭으로 전환.
# 이때 cylinder는 cylinderTarget()에 의해 화면 밖(offscreen)에 있다(장전 없음).
# 배경은 dualing = "테이블 있는 하단 위치"로 bgAnimate가 내려간다.
#
# 연출 순서(시퀀스):
#   1) revealDice  : 모든 플레이어의 주사위를 테이블 중앙에 전개.
#   2) panToTable  : bgLocation이 테이블쪽으로 이동하며 눈금을 보여줌.
#   3) judge       : bidding한 (개수·면) 대비 실제 개수 판정(부족/초과/정확).
#   4) execute     : README 정책에 따른 데미지 계산 + 전투 애니메이션.

def DuelTurnBlock():
    duel = data.duel       # { bid, challenger, previousBidder, players, ... }
    return Sequence([
        # 1) 주사위 전개: 화면 밖 상태에서 테이블 중앙으로 모두의 주사위를 펼침
        revealDice(
            DiceSpread(
                groups = [ PlayerDice(p) for p in duel.players ],
                center = TABLE_CENTER,
            )
        ),

        # 2) 카메라(배경)를 테이블로 내려 눈금 확인시켜 줌
        panToTable(bgAnimate(bgLocation("dualing"))),

        # 3) 판정: bidding한 면(bid.face)의 실제 총 개수 집계 후 콜과 비교
        #    (면 1=해골 규칙은 집계 시 DiceFace 규칙과 동일하게 처리)
        judge = JudgeResult(
            bid        = duel.bid,                       # 부른 개수·면
            actual     = countFace(duel.players, duel.bid.face),
            #            verdict ∈ { SHORT(부족), OVER(초과), EXACT(정확) }
        ),

        # 4) 데미지 집행 + 전투 애니메이션 (README 정책)
        execute(DuelResolution(duel, judge)),
    ])

def DuelResolution(duel, judge):
    # README '데미지 정책' 분기를 그대로 따른다.
    if judge.verdict in (SHORT, OVER):
        # |실제−콜|번 공격. SHORT→도전자가 직전 콜러에게, OVER→직전 콜러가 도전자에게 격발.
        # 리볼버이므로 장전 위치에 따라 일부만/안 나갈 수 있음.
        return duelShots(
            shooter = duel.challenger if judge.verdict == SHORT else duel.previousBidder,
            target  = duel.previousBidder if judge.verdict == SHORT else duel.challenger,
            count   = abs(judge.actual - duel.bid.count),
        )
    else:  # EXACT(정확히 맞춤)
        # 맞춘 당사자(A=이전 턴)가 나머지 플레이어(B)를 순서대로 지목.
        # A: 방아쇠/회피, B: 응사/걍맞기 → README 표대로 결과 처리.
        return PerfectDuel(
            shooter = duel.previousBidder,               # A
            targets = duel.players.except(duel.previousBidder),  # 순서대로 지목
        )

# 전투 연출 공통 요소: 좌(전 턴) / 우(현재 턴 또는 지목 대상) 일러스트,
# `철컥`/`탕` 이펙트·효과음 동기화 (README '결투 화면' 참고).
#
# 종료 후 전환:
#   - judge.verdict == EXACT: previousBidder에게 pendingLoad(3, source="exact_duel") 설정
#     → revolver reload(focal) 완료 후 shaking으로 전환.
#   - SHORT/OVER: 추가 장전 없이 바로 shaking으로 전환.
```

#### `ShakeTurnBlock` — 흔들기 + 장전

```
# 배경은 shaking = "테이블 있는 하단 위치".
# player_carousel은 shake용 player arc를 표시하고, shake.gui는 같은 좌석에 컵을 표시한다.
# 흔들기로 주사위를 굴려 랜덤 배정(DiceTray에 결과 표시) 후,
# pendingLoad가 있으면 cylinder가 focal로 등장해 장전:
#   - setup / exact_duel: 3발
#   - shake / bid: 1발
# EXACT 결투 직후 진입 시에는 정확히 맞춘 사람만 3발 pendingLoad를 갖고 시작한다.
ShakeTurnBlock
```
