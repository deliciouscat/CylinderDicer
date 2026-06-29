/**
 * # 개요
 * ranked/casual 결과, season stat, leaderboard 조회를 담당할 service wrapper다.
 * 1차 dev match 연결 뒤에 보상/랭킹 업데이트 흐름을 이 파일로 모은다.
 *
 * # 의존성
 * - `convex/matches.ts`: complete match metadata.
 * - future Convex ranking tables/functions.
 * - `web/src/services/convex/authService.ts`: 현재 사용자.
 *
 * # I/O
 * - 입력:
 *   - season id.
 *   - leaderboard page cursor.
 * - 출력:
 *   - leaderboard entries.
 *   - current user rank summary.
 *
 * # 의사코드
 * ```text
 * request leaderboard page from Convex
 * request current user rank summary
 * merge display profile and rank stat
 * expose stable shape to ranking screen
 * ```
 */
export interface RankingEntry {
  userId: string
  displayName: string
  score: number
  rank: number
}

export interface RankingPage {
  entries: RankingEntry[]
  nextCursor?: string
}
