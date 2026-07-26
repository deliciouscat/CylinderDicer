/**
 * # 개요
 * Vue 앱이 Convex runtime 설정을 읽고 client 초기화 지점을 한 곳으로 모으는 서비스 파일이다.
 * 실제 `convex-vue` plugin 연결은 `web/src/main.ts`에서 하되, 설정/검증 로직은 여기로 모은다.
 *
 * # 의존성
 * - Vite env: `VITE_CONVEX_URL`, `VITE_USE_CONVEX_DEV`.
 * - `convex-vue`: 실제 plugin 사용 위치는 main.ts 또는 app bootstrap.
 * - `web/src/services/convex/*`: 모든 service wrapper가 같은 runtime config를 공유한다.
 *
 * # I/O
 * - 입력:
 *   - `import.meta.env`.
 * - 출력:
 *   - Convex runtime config.
 *   - missing env validation error.
 *
 * # 의사코드
 * ```text
 * read VITE_CONVEX_URL
 * if missing, throw setup error
 * read optional feature flags
 * return normalized config
 * Vue bootstrap uses config to install Convex plugin
 * ```
 */
import { ConvexClient } from 'convex/browser';
export function readConvexRuntimeConfig(env = import.meta.env) {
    const url = env.VITE_CONVEX_URL;
    if (!url) {
        throw new Error('Add VITE_CONVEX_URL to web/.env.local');
    }
    return {
        url,
        useConvexDev: env.VITE_USE_CONVEX_DEV !== 'false',
    };
}
export function createBrowserConvexClient(config = readConvexRuntimeConfig()) {
    return new ConvexClient(config.url);
}
