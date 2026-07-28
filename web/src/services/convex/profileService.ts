/**
 * # 개요
 * 사용자 profile 화면과 lobby 표시 이름에 필요한 Convex profile API wrapper다.
 * Clerk identity와 게임 내 display profile을 분리해서 다룬다.
 *
 * # 의존성
 * - `convex/users.ts`: current user profile query/mutation.
 * - `web/src/services/convex/authService.ts`: session profile.
 *
 * # I/O
 * - 입력:
 *   - display name or profile patch.
 * - 출력:
 *   - updated profile snapshot.
 *
 * # 의사코드
 * ```text
 * get current profile from auth service or Convex query
 * validate display fields on client for UX
 * submit profile patch to Convex
 * return updated profile
 * ```
 */
import type { CharacterKey } from '@shared/game/characters'

export interface ProfilePatch {
  displayName?: string
  characterKey?: CharacterKey
}

export function normalizeDisplayName(name: string): string {
  return name.trim()
}
