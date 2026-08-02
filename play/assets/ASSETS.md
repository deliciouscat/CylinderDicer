# Assets 구성 가이드 (턴 진행 화면 범위)

Defold 프로젝트 루트는 `play/`. 이 문서는 **턴 진행(bidding/shaking) 화면**에 필요한
에셋 디렉토리 구조와 네이밍 규칙을 정의한다. 전투 씬(결투 연출/지목·응사 등)은
와이어프레임 확정 후 별도 확장한다.

## 핵심 제약 (Defold)
- 이미지 포맷은 **PNG(32bit RGBA)로 통일**한다. (WebP는 사용하지 않음)
  - 투명도 불필요한 대형 배경 등에 한해 JPEG도 허용.
  - 마스터 원본(psd/ai 등 작업 파일)은 `play/art-source/`(빌드 제외)에 두고, PNG로 export하여 `assets/images/`에 넣는다.
- 작은 이미지는 `assets/atlases/*.atlas`로 묶어 배칭(드로우콜 절감).
- 플레이 화면에서 구체 visual은 실제 PNG/atlas asset만 사용한다. asset이 아직 없으면 도형/벡터로 대체 구현하지 않고, 숨김 또는 텍스트 상태 표시로 둔다.
- 번들 용량은 `game.project`의 texture_profiles(BasisU/ASTC)로 압축.
- 유료 치장 아이템은 카테고리/`<id>/` 단위로 분리 → **Live Update** 온디맨드 배포에 적합.
- 로컬라이즈 텍스트는 `assets/locale/*.json`, 한/일은 CJK 폰트 리소스 필요.

## 공통 폰트

- `assets/fonts/NotoSerifCJKkr-SemiBold.otf`: Defold HUD의 한·영·일 공통 서체. Google/Adobe Noto Serif CJK의 Korean region OTF이며 SIL Open Font License 1.1로 배포된다.
- `assets/fonts/noto_serif_cjk_kr_semibold.font`: 현재 게임/i18n 문자열만 굽는 distance-field 리소스. 전체 CJK `all_chars`를 사용하지 않아 HTML5 glyph atlas를 제한한다.
- `assets/fonts/OFL.txt`: 포함된 폰트 라이선스 전문.
- 원본: https://github.com/notofonts/noto-cjk/tree/main/Serif/OTF/Korean
- Defold의 TTF/OTF font resource 사용법: https://defold.com/manuals/font/

## HTML5 엔진 로딩 화면

- 원본은 `assets/images/background.png`와 `assets/images/logo.png`이다.
- `html5/loading.css`가 두 이미지를 배경과 중앙 로고 레이어로 표시한다. 이는 게임 collection이 뜨기 전 Defold HTML5 engine loader 화면이며 gameplay atlas와 별개다.
- `npm run defold:web:bundle` 및 `npm run defold:web:build`는 두 원본을 `html5/bundle_resources/web/`에 자동 복사한 뒤 Bob을 실행한다. 해당 중간 디렉터리와 최종 `wasm-web/`, `web/public/play/` 출력은 직접 편집하지 않는다.
- 원본을 교체한 뒤에는 release HTML5 bundle 재생성·sync와 브라우저 강력 새로고침이 필요하다.

## 디렉토리 구조
```
play/
├─ art-source/                  # 마스터 작업 파일(psd/ai). Defold 빌드 제외.
└─ assets/
   ├─ images/
   │  ├─ characters/<charId>/   # 캐릭터별 일러스트 상태
   │  │   └─ {front,side,damage,dying,victory}.png
   │  │   (_template/ 은 새 캐릭터 추가용 빈 틀)
   │  ├─ revolver/<skinId>/     # 리볼버 스킨 (유료). default 필수.
   │  │   └─ {cylinder.png, bullet_bottom.png, bullet_unloaded.png}
   │  │       # 약실 본체 / 장전된 약실의 탄피 바닥 / 재장전 대기 탄환
   │  ├─ dice/<skinId>/         # 주사위 36장 (유료 스킨). default 필수.
   │  ├─ cup/<skinId>/          # 셰이크 컵 (유료 스킨). default 필수.
   │  ├─ backgrounds/<mapId>/   # 세로 파노라마 배경 (유료 맵). default 필수.
   │  ├─ rail/<mapId>/          # 레일 트랙/숫자패턴/skull/셀 프레임 (유료 맵, 테마 종속). default 필수.
   │  ├─ ui/
   │  │   ├─ turn_indicator/    # 턴 배너 프레임
   │  │   ├─ buttons/           # 넘기기 / 결투신청 (normal/pressed/disabled)
   │  │   ├─ arrows/            # 주사위 눈 ▲▼ (normal/pressed/disabled)
   │  │   ├─ indicators/        # 결투 cylinder 등 고정 위치 표지
   │  │   ├─ rail/              # 포인터 캐럿 등 맵 테마와 무관한 레일 UI만
   │  │   ├─ results/           # 매치 결과 순위 프레임
   │  │   ├─ hud/               # 안내(hint) 패널
   │  │   └─ panels/            # 공통 패널/프레임
   │  └─ icons/                 # heart, cylinder_badge, bullet, skull, target, die_small
   ├─ atlases/                  # .atlas 정의 (배칭 단위)
   ├─ fonts/                    # latin, ko(CJK), ja(CJK)
   ├─ sounds/                   # 오디오 (.sound가 참조하는 .wav/.ogg 원본)
   │  ├─ sfx/                   # 효과음: 철컥/탕, 버튼, 주사위 굴림, 장전 등
   │  ├─ bgm/                   # 배경음악 (맵 테마 연동 가능)
   │  └─ voice/<charId>/      # 캐릭터 음성(도발/피격/승리 등). 비언어 위주 + 약간의 영어.
   │                          #   (로케일별 더빙 분리는 추후 voice/<charId>/<locale>/ 로 확장)
   └─ locale/                   # ko.json / en.json / ja.json / zh.json
```

## 네이밍 규칙
- 소문자 + 언더스코어, 공백 금지. 상태는 접미사로: `pass_btn_normal.png`, `pass_btn_disabled.png`.
- 캐릭터: `characters/<charId>/<state>.png` (state: front|side|damage|dying|victory)
- 주사위(36장/스킨): `dice/<skinId>/f<face>_a<angle>.png`
  - face: 1~6 (face 1 = 해골 아트), angle: 0=정면(top-down), 1~5=굴림 각도
  - 예) `dice/default/f1_a0.png`(해골 정면), `dice/default/f6_a3.png`
- 리볼버: `revolver/<skinId>/{revolver,cylinder,bullet}.png` (총기 전체 / 약실 뷰 / 총알)
- 레일/배경(맵, 테마 종속): `rail/<mapId>/{track,cell,cell_selected,skull}.png`, `backgrounds/<mapId>/panorama.png`
- 아이콘: `icons/<name>.png`
- 오디오: `sounds/sfx/<name>.{wav,ogg}` + 같은 이름의 `.sound`, `sounds/bgm/<name>.ogg`, `sounds/voice/<charId>/<event>.ogg`
  - 짧은 효과음은 wav, 길거나 음악/음성은 ogg 권장. Defold에서 각 파일을 `.sound` 컴포넌트가 참조.

## DISPLAY.md 요소 ↔ 에셋 매핑
| DISPLAY 요소 | 사용 에셋 |
|---|---|
| ternIndicator | ui/turn_indicator/*, locale(turn.*) |
| PlayerSlot.Portrait | characters/<id>/* (+atlas 등록된 캐릭터만 화면 표시) |
| StatusBadge | `icons/bullet_indicator`, `icons/hp_indicator`, 숫자 폰트 |
| BidControls | `ui/buttons/bid_button`, `ui/buttons/challenge_button`, `ui/arrows/{up,down}` |
| Duel cylinder marker | `ui/indicators/down_indicator` |
| rail (셀 프레임 포함) | `rail/<mapId>/*` (테마 종속), `ui/rail/bid_normal` (일반 숫자칸), `ui/rail/bid_check` (직전 확정 bid 칸), `ui/indicators/{down_indicator,up_indicator}` (중앙 상·하 포인터) |
| BidMarker | icons/cylinder_badge + DiceFace |
| DiceTray / DiceFace | dice/<skinId>/* (f1=해골) |
| cylinderOverlay | `revolver/<skinId>/cylinder.png` + `bullet_bottom` (장전된 약실) + `bullet_unloaded` (재장전 대기 탄환) |
| 배경 | backgrounds/<mapId>/* |

## 적용된 효과음

- 원본 master MP3: `art-source/sounds/sfx/`
- Defold runtime: `assets/sounds/sfx/`의 16-bit PCM WAV + `.sound`
- `start_bell`: match 시작
- `roll` / `drop`: 로컬 shake 입력 / authoritative `dice_check` phase 진입(컵이 올라가 주사위가 보이는 시점)
- `reload` / `clasp`: 장전 / 마지막 pending bullet 장전
- `tick` / `bang`: 결투 격발 miss / hit
- `victory` / `placement`: local winner / 나머지 순위 종료
- `button_click`: Defold bidding control. 같은 원본을 Vue button SFX도 사용한다.

## 미정 (전투 씬 와이어프레임 후 추가)

- PerfectDuel 지목·응사 UI, 데미지 플로팅, 승/패 결과 화면.

## 적용된 HUD 자산

- `assets/atlases/ui.atlas`: 입찰/결투 버튼, ▲▼, 턴 배너, 레일 숫자칸 배경, 레일·결투 cylinder 포인터.
- `assets/atlases/dices/dice_default.atlas`: default 주사위 36장 전체. bidding face와 하단 리스트에는 정면 `a0`, 컵 앞 테이블 주사위에만 `a1`–`a5` 굴림 각도를 사용한다.
- `assets/atlases/status_indicators.atlas`: `player_carousel`과 `duel`의 장탄·HP 배지.
- `assets/atlases/cylinder_default.atlas`: `cylinder_overlay`의 실린더 본체. HTML5에서도 실린더 투명 영역을 독립 texture page로 유지한다.
- `assets/atlases/revolver_default.atlas`: `cylinder_overlay`의 장전된 약실과 재장전 대기 탄환.
- `assets/atlases/rank_result.atlas`: `result` HUD의 `rank_{1,2_3,4_6}` 순위 프레임과 `result_button` wood plaque. 순위 panel과 로비/관전 선택 버튼에 연결한다.
- 모든 gameplay GUI의 `system_font` mapping은 `assets/fonts/noto_serif_cjk_kr_semibold.font`를 사용한다.
