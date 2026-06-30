/**
 * # 개요
 * Convex가 Clerk JWT를 신뢰하도록 인증 provider를 선언하는 설정 파일이다.
 * Clerk의 Convex JWT template에서 발급한 토큰만 Convex 함수 인증에 사용한다.
 *
 * # 의존성
 * - Convex runtime: `auth.config.ts`를 특별 설정 파일로 읽는다.
 * - Clerk dashboard: Convex용 JWT template과 issuer/frontend API URL을 제공한다.
 * - Convex deployment env: `CLERK_JWT_ISSUER_DOMAIN` 값을 제공한다.
 *
 * # I/O
 * - 입력:
 *   - `process.env.CLERK_JWT_ISSUER_DOMAIN`.
 * - 출력:
 *   - Convex auth provider config.
 *
 * # 의사코드
 * ```text
 * read Clerk issuer domain from Convex env
 * register provider with applicationID "convex"
 * Convex validates incoming Clerk JWT against this provider
 * ```
 */
declare const process: {
  env: Record<string, string | undefined>
}

export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: 'convex',
    },
  ],
}
