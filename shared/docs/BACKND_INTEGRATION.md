# BACKND Integration

## Document Links

- [BACKND Developer Documentation](https://docs.backnd.com/en/)
- [뒤끝 개발자 문서](https://docs.backnd.com/)
- [뒤끝 SDK 시작하기](https://docs.backnd.com/sdk-docs/backend/base/start-up/)
- [뒤끝 사용하기 기초](https://docs.backnd.com/sdk-docs/backend/base/knowhow/basic)
- [User management](https://docs.backnd.com/en/guide/getting-started/how-to-use/user/)
- [Authentication Information](https://docs.backnd.com/en/guide/console-guide/server-setting/authenciation/)
- [Payment Management](https://docs.backnd.com/en/guide/console-guide/account/billing-setting/)
- [영수증 검증](https://docs.backnd.com/guide/getting-started/how-to-use/receipt)
- [ValidateReceipt](https://docs.backnd.com/sdk-docs/backend/base/receipt/validate-receipt/)
- [Unity Purchasing(IAP 5.x) 연동 예제](https://docs.backnd.com/sdk-docs/backend/base/receipt/unity-iap5-example/)
- [Leaderboard](https://docs.backnd.com/en/guide/getting-started/how-to-use/rank)
- [Leaderboard Details](https://docs.backnd.com/en/guide/console-guide/backnd-base/rank/search)
- [Ranking Rewards](https://docs.backnd.com/en/guide/console-guide/backnd-base/post/reward-rank)
- [뒤끝펑션](https://docs.backnd.com/guide/getting-started/how-to-use/backnd-functions)
- [BACKND Function Getting Started](https://docs.backnd.com/en/sdk-docs/function/intro/)
- [게임 운영 관리](https://docs.backnd.com/guide/getting-started/how-to-use/operate-game/)
- [확률 관리](https://docs.backnd.com/guide/getting-started/how-to-use/probability/)
- [채팅](https://docs.backnd.com/guide/getting-started/how-to-use/backnd-chat/)

이 문서는 CylinderDicer에서 뒤끝(Backnd)을 붙이면서 확인한 내용을 계속 갱신하는 작업 노트다. 공식 문서 전체를 복사하지 않고, 이 프로젝트에서 실제로 쓰는 콘솔 설정, 데이터 구조, API 호출 방식, 보안 판단만 남긴다.

## 현재 프로젝트 기준

- 엔진: Defold
- 스크립트: Lua
- 배포 형태: 웹 기반 게임
- 게임 외부 화면: Vue.js 래퍼에서 구현
- 게임 플레이 화면: Defold를 Web build/canvas 형태로 임베드
- 뒤끝 공식 SDK 문서는 Unity 중심으로 먼저 확인한다.
- Defold에서 공식 SDK를 바로 사용할 수 있는지 여부는 별도 확인이 필요하지만, Vue 래퍼가 백엔드 연동의 관문이 될 수 있다.
- SDK 직접 사용이 어렵다면 `Vue client -> BACKND` 또는 `Vue client -> backend bridge/function -> BACKND` 형태로 붙인다.
- 결제 검증, 보상 지급, 랭킹 점수 검증처럼 조작되면 안 되는 로직은 클라이언트 단독 처리 금지. 뒤끝펑션 또는 별도 서버 계층에서 처리한다.

## 통합 원칙

- 클라이언트에는 유저 입력, 화면 상태, 임시 캐시만 둔다.
- 영구 세이브, 재화, 결제 보상, 랭킹 점수는 서버에 최종 기록한다.
- 모든 뒤끝 호출은 프로젝트 내부 래퍼를 통해 호출한다.
- 에러 코드는 화면 문구와 복구 액션까지 함께 정의한다.
- 콘솔에서 만든 테이블명, 컬럼명, 랭킹명, 상품 ID는 이 문서에 계속 기록한다.
- 테스트/개발/라이브 프로젝트 키는 분리한다.
- Client App Id, Signature Key, Master Token 같은 민감 값은 문서와 저장소에 기록하지 않는다.

## 구현 후보 구조

Vue와 Defold 양쪽에서 같은 백엔드 규칙을 공유하도록 기능별 래퍼를 만든다.

- `backnd_client`: 초기화, 공통 요청, 공통 응답 파싱, 에러 처리
- `account_service`: 로그인, 로그아웃, 닉네임, 탈퇴, 차단 상태 처리
- `save_service`: 플레이어 세이브 데이터 저장/로드
- `payment_service`: 결제 요청, 영수증 검증 요청, 미지급 상품 복구
- `ranking_service`: 점수 제출, 내 순위 조회, 상위 랭킹 조회
- `mail_service`: 우편함 조회, 보상 수령
- `ops_service`: 공지, 이벤트, 약관, 점검 상태

## 웹/Vue 래퍼 구조

CylinderDicer는 웹 기반 게임으로 배포하고, Defold 게임 화면을 Vue.js 애플리케이션 안에 임베드한다. 이 구조에서는 Vue가 계정, 로비, 상점, 랭킹, 우편, 공지 같은 게임 외부 시스템을 담당하고, Defold는 실제 플레이 화면과 연출에 집중한다.

```text
Vue Web App
- 로그인/계정 연동
- 로비/공방/래더 입장
- 유료 치장 아이템 구매
- 인벤토리/장착 관리
- 랭킹/프로필/우편/공지

Defold Game Canvas
- 실제 게임 플레이
- 입력/애니메이션/전투 연출
- Vue에서 전달받은 세션, 매치, 장착 정보 사용
```

### 역할 분리

- Vue는 백엔드 API 호출과 화면 전환을 담당한다.
- Defold는 게임 규칙 실행, 화면 연출, 플레이 입력 처리를 담당한다.
- Defold는 필요한 경우 Vue 브릿지를 통해 매치 시작 정보와 장착 정보를 받는다.
- 게임 결과는 Defold에서 계산하더라도 최종 반영은 서버 권위 레이어에서 검증한다.
- Backnd, Nakama, 자체 REST 서버 중 무엇을 쓰더라도 Vue의 service layer를 어댑터로 삼는다.

### Vue 담당 후보

- `AuthService`: 게스트 로그인, OAuth 계정 연동, 로그아웃, 탈퇴
- `LobbyService`: 공방 목록, 방 생성/입장, 래더 입장
- `ShopService`: 상품 목록, 결제 요청, 영수증 검증 요청
- `InventoryService`: 치장 아이템 보유/장착 상태
- `RankingService`: 랭킹 목록, 내 순위, 시즌 보상
- `MailService`: 우편 목록, 보상 수령
- `NoticeService`: 공지, 이벤트, 점검 상태
- `GameBridge`: Vue와 Defold 사이의 메시지 송수신

### Defold 담당 후보

- 플레이 화면 초기화
- 주사위/컵/리볼버 연출
- 턴 진행과 입력 처리
- 플레이 중 필요한 UI
- 매치 결과 payload 생성
- Vue로 결과 제출 요청 전달

### 브릿지 메시지 예시

Vue에서 Defold로 매치 시작 정보를 전달한다.

```json
{
  "type": "START_MATCH",
  "sessionId": "session_abc",
  "matchId": "ranked_123",
  "playerId": "user_456",
  "mode": "ranked",
  "cosmetics": {
    "diceSkin": "ivory_gold",
    "cupSkin": "black_lacquer"
  }
}
```

Defold에서 Vue로 매치 결과 제출을 요청한다.

```json
{
  "type": "SUBMIT_MATCH_RESULT",
  "matchId": "ranked_123",
  "winnerId": "user_456",
  "turnCount": 18,
  "eventsHash": "sha256_or_server_defined_hash"
}
```

### 보안 경계

Vue와 Defold는 모두 브라우저 클라이언트이므로 신뢰하지 않는다. 아래 작업은 반드시 뒤끝펑션, 별도 API 서버, 또는 다른 서버 권위 레이어에서 최종 처리한다.

- 결제 영수증 검증 후 보상 지급
- 재화 증감
- 치장 아이템 소유권 변경
- 랭킹 점수 반영
- 래더 승패 확정
- 시즌 보상 지급
- 확률형 보상 결과 확정

## 계정관리

### 지원 범위

뒤끝은 회원가입부터 탈퇴까지 유저 관리를 지원한다. 공식 문서 기준 가입 방식은 커스텀 계정, 페더레이션 계정, 게스트 로그인으로 나뉜다. 커스텀 계정과 게스트 로그인 유저는 페더레이션 계정으로 전환할 수 있다.

### CylinderDicer 적용 방향

- 1차 구현은 게스트 로그인으로 시작한다.
- 정식 출시 전 Google/Apple 계정 연동을 붙인다.
- 유저 식별자는 뒤끝의 gamer/user 식별자를 기준으로 저장한다.
- 게임 내 표시명은 뒤끝 닉네임 기능을 우선 사용한다.
- 닉네임은 중복 불가, 최대 20자 조건을 전제로 UI를 만든다.
- 탈퇴는 7일 유예 기간이 있다는 점을 UX에 반영한다.
- 차단된 유저가 로그인할 때는 뒤끝 응답의 차단 사유와 기간을 표시한다.

### 콘솔 설정 메모

- 인증 정보 위치: BACKND Console > Server Settings / 프로젝트 설정 > 인증 정보
- 필요한 값: Client App Id, Signature Key
- 계정 연동을 쓰는 경우 Google/Apple/Facebook 인증 정보 설정 필요
- 점검 상태에서는 일반 유저 요청이 차단되므로, 운영 테스트용 whitelist 계정 필요

### 구현 체크리스트

- [ ] 뒤끝 프로젝트 생성
- [ ] 개발/라이브 프로젝트 분리
- [ ] Client App Id, Signature Key 주입 방식 결정
- [ ] 게스트 로그인 플로우 작성
- [ ] 닉네임 생성/변경 플로우 작성
- [ ] 계정 연동 플로우 작성
- [ ] 탈퇴/복구/차단 상태 UX 작성

## 결제관리

### 지원 범위

뒤끝 콘솔의 Payment Management에서는 현재 요금, 상세 사용량, 청구 내역, 결제 정보를 확인할 수 있다. 과금 항목에는 BACKND Base, Push message, BACKND Function, Chat, DB 등이 포함된다. 콘솔 사용량 조회나 DB 삭제도 비용에 영향을 줄 수 있으므로 운영 단계에서 주의한다.

### 영수증 검증

뒤끝은 Google Play, Apple App Store, ONE Store 영수증 검증을 지원한다. 영수증 자체의 유효성, Product ID의 올바름, 이미 검증된 영수증 재사용 여부를 확인해 부정 결제를 막는 용도로 사용한다.

Unity IAP 5.x 문서 기준으로는 `ValidateReceipt(ReceiptParam receiptParam)` API가 핵심이다. Defold에서는 Unity IAP 예제를 그대로 쓰기 어렵기 때문에, 최종 구현 방식은 플랫폼별 결제 확장 또는 별도 서버/펑션 경유 방식으로 정한다.

### CylinderDicer 적용 방향

- 결제 완료만으로 아이템을 지급하지 않는다.
- 결제 영수증 검증 완료 후 서버에서 보상을 지급한다.
- 보상 지급은 뒤끝펑션 또는 서버 계층에서 처리한다.
- 지급 완료 전 앱이 종료될 수 있으므로 미지급 상품 복구 플로우를 만든다.
- 상품 ID, 가격, 지급 아이템은 클라이언트 하드코딩 대신 서버/차트 기준으로 맞춘다.
- ONE Store 등 서버에서 금액 정보를 조회할 수 없는 스토어는 가격 전달 방식 확인이 필요하다.

### 콘솔 설정 메모

- Google: Google Play Console과 뒤끝 콘솔에 영수증 검증용 설정 필요
- Apple: Apple 결제 콘솔 설정 필요
- ONE Store: ONE Store 결제 콘솔 설정 필요
- 영수증 검증 내역은 뒤끝 콘솔에서 확인 가능

### 구현 체크리스트

- [ ] 결제 스토어 우선순위 결정: Google / Apple / ONE Store
- [ ] Defold 결제 확장 조사
- [ ] 상품 ID 목록 작성
- [ ] 영수증 검증 요청 경로 결정
- [ ] 보상 지급 함수 설계
- [ ] 미지급 상품 재지급 정책 작성
- [ ] 결제 실패/중복 검증/네트워크 끊김 UX 작성

## 랭킹관리

### 지원 범위

뒤끝 Leaderboard는 유저 또는 길드 기준 랭킹을 지원한다. 점수 업데이트 후 실시간 반영, 초기화 주기/시간 설정, 리셋 시 보상 우편 발송, 그룹별 랭킹 생성이 가능하다.

랭킹 초기화는 설정한 시간 정각에 정확히 끝난다는 보장이 아니라, 여러 프로젝트와 랭킹이 순차 처리되며 설정 시각부터 1시간 안에 처리될 수 있다. 리셋 시작 후 1시간 동안은 랭킹 수정이 제한된다.

### CylinderDicer 적용 방향

- 1차 랭킹은 유저 누적 승점 랭킹으로 시작한다.
- 이후 시즌제 랭킹을 추가한다.
- 랭킹 점수 제출은 클라이언트 단독 계산을 신뢰하지 않는다.
- 비정상 점수 제출 방지는 뒤끝펑션에서 검증한다.
- 랭킹 보상은 우편함으로 지급한다.
- 동점 처리와 정렬 기준은 콘솔 설정과 UI 설명을 맞춘다.

### 랭킹 후보

- `total_rating`: 누적 레이팅
- `season_rating`: 시즌 레이팅
- `win_count`: 승리 횟수
- `perfect_call_count`: 정확히 맞춘 결투 횟수
- `survival_streak`: 연승 또는 생존 streak

### 콘솔 설정 메모

- 랭킹 유형: 유저 랭킹 우선
- 초기화 기간: 누적 랭킹 + 시즌 랭킹 분리
- 정렬 기준: 점수형 랭킹은 내림차순
- 보상: 랭킹 리셋 시 BACKND Mail로 지급
- 보상 구간: 공식 문서 기준 최대 20개 구간, 구간당 최대 3,000위, 입력 가능 순위 최대 10,000위

### 구현 체크리스트

- [ ] 랭킹용 데이터 테이블/컬럼 생성
- [ ] 누적 랭킹 생성
- [ ] 시즌 랭킹 생성
- [ ] 점수 제출 검증 로직 작성
- [ ] 내 순위 조회
- [ ] 상위 랭킹 조회
- [ ] 랭킹 보상 우편 수령 플로우 작성

## 우편/보상관리

뒤끝 랭킹 보상은 우편으로 지급된다. 일반 운영 보상도 우편 관리와 차트 데이터를 통해 지급하는 방향으로 설계한다.

- 보상 아이템은 차트에 먼저 등록한다.
- 우편 발송 가능한 차트인지 콘솔에서 확인한다.
- 우편 수령 시 서버 기준으로 인벤토리/재화에 반영한다.
- 수령 완료 전 네트워크 실패가 발생하면 재조회로 복구한다.

## 게임 데이터/세이브

CylinderDicer의 유저 데이터는 클라이언트 로컬 저장과 서버 저장을 분리한다.

- 로컬: 화면 옵션, 마지막 접속 UI 상태, 임시 캐시
- 서버: 전적, 레이팅, 재화, 상품 지급 이력, 닉네임, 시즌 참여 기록
- 서버 기록은 테이블/컬럼 변경 가능성을 고려해 버전 필드를 둔다.

후보 테이블:

- `UserProfile`: nickname, countryCode, createdAt, lastLoginAt
- `UserStats`: totalGames, wins, losses, totalRating, seasonRating
- `UserInventory`: currencies, items
- `PurchaseHistory`: productId, receiptId, status, grantedAt
- `SeasonState`: seasonId, rating, rewardClaimed

## 뒤끝펑션

뒤끝펑션은 클라이언트에서 직접 처리하면 위험한 로직을 서버로 분리하는 기능이다. 공식 문서에서도 인앱 결제 후 보상 지급, 랜덤 뽑기 결과, 합당한 점수만 랭킹에 등록하는 검증 로직 예시를 제시한다.

CylinderDicer에서 우선 펑션화할 후보:

- 결제 영수증 검증 후 보상 지급
- 랭킹 점수 제출 검증
- 시즌 보상 지급
- 확률형 보상 또는 상자 개봉
- 매치 결과 확정

## 운영관리

뒤끝은 공지사항, 이벤트, 약관 및 정책, 1:1 문의, 유저 정보 찾기, 쿠폰, 푸시 등 운영 기능을 지원한다.

CylinderDicer 적용 방향:

- 공지사항: 앱 시작 또는 로비 진입 시 조회
- 이벤트: 시즌/기간 한정 이벤트 표시
- 약관/정책: 최초 로그인 또는 계정 연동 전 표시
- 1:1 문의: 웹뷰 또는 외부 링크 방식 검토
- 쿠폰: 보상 우편 또는 서버 지급으로 연결
- 푸시: 시즌 종료, 보상 미수령, 이벤트 시작 알림 후보

## 확률관리

뒤끝 확률 관리는 콘솔에 확률 파일을 업로드하고 SDK에서 뽑기를 실행하는 기능이다. 뽑기는 서버에서 수행되고 결과를 클라이언트에서 확인하는 구조다.

CylinderDicer에서 확률형 요소가 생기면 아래 원칙을 적용한다.

- 확률표는 콘솔/차트 기준으로 관리한다.
- 클라이언트는 결과 표시만 담당한다.
- 천장, 누적 보정처럼 기본 확률 관리로 처리하기 어려운 로직은 뒤끝펑션에서 처리한다.

## 채팅/소셜

채팅은 프라이빗 채널과 오픈 채널을 지원하며, 운영자는 관리자 메시지, 비속어 필터, 신고/차단, 도배 방지, 번역 기능을 사용할 수 있다.

소셜 후보:

- 친구 요청/수락/거절
- 친구 접속 상태 알림
- 매치 초대
- 국가/언어별 오픈 채팅
- 신고/차단

## 미정/확인 필요

- Vue에서 뒤끝을 붙이는 최종 경로: 웹/JS SDK, REST/API, 뒤끝펑션, 별도 서버 중 선택
- Defold에서 뒤끝을 직접 호출할 필요가 있는지 여부
- Vue와 Defold 사이의 브릿지 구현 방식: `postMessage`, JS callback, Defold HTML5 extension 중 선택
- 뒤끝 Base의 클라이언트 API를 Defold Lua에서 직접 호출 가능한지 여부
- 플랫폼별 결제 확장의 영수증 형태
- Client App Id/Signature Key를 웹 클라이언트에 포함할 때의 보안 수준
- Master Token 사용이 필요한 Platform API는 클라이언트에서 직접 호출 금지
- 실시간 멀티플레이를 뒤끝 월드/매치로 처리할지, 별도 서버로 처리할지

## 업데이트 로그

- 2026-06-03: 웹 기반 Vue 래퍼 구조 추가. Vue가 계정/로비/상점/랭킹/우편/공지 담당, Defold가 게임 플레이 담당이라는 역할 분리와 브릿지 메시지 예시를 기록.
- 2026-06-03: 초기 문서 작성. 계정관리, 결제관리, 랭킹관리, 우편/보상, 세이브, 뒤끝펑션, 운영관리, 확률관리, 채팅/소셜 초안 추가.
