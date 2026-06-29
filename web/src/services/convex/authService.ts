/**
 * # 개요
 * Clerk session과 Convex user row 동기화를 담당하는 frontend service wrapper다.
 * Vue 컴포넌트는 Clerk/Convex 세부 구현 대신 이 파일의 높은 수준 API를 사용한다.
 *
 * # 의존성
 * - `@clerk/vue`: 현재 로그인 상태와 user 정보.
 * - `convex/users.ts`: `getCurrentUser`, `createOrUpdateCurrentUser`.
 * - `web/src/services/convex/convexClient.ts`: Convex runtime config.
 *
 * # I/O
 * - 입력:
 *   - Clerk auth/session state.
 * - 출력:
 *   - normalized app user profile.
 *   - login required state.
 *
 * # 의사코드
 * ```text
 * read Clerk user/session
 * if signed out, return anonymous auth state
 * call Convex createOrUpdateCurrentUser mutation
 * cache normalized profile for app screens
 * expose profile to lobby/account/shop flows
 * ```
 */
export interface AppUserProfile {
  id: string
  displayName?: string
}

export interface AuthSessionSnapshot {
  signedIn: boolean
  user?: AppUserProfile
}

export function createSignedOutSnapshot(): AuthSessionSnapshot {
  return { signedIn: false }
}
