/**
 * # 개요
 * Convex generated API의 함수 reference를 frontend service용 registry로 모으는 파일이다.
 * service 파일들은 generated API를 직접 import하지 않고 이 registry만 참조한다.
 *
 * # 의존성
 * - `convex/_generated/api`: Convex CLI codegen 산출물.
 * - `convex/users.ts`, `convex/matches.ts`, `convex/commands.ts`, `convex/snapshots.ts`.
 *
 * # I/O
 * - 입력:
 *   - generated `api` object.
 * - 출력:
 *   - Vue service wrapper에서 사용할 query/mutation function reference.
 *
 * # 의사코드
 * ```text
 * import generated api
 * expose api.module.function values with stable names
 * service files:
 *   import only this registry
 * ```
 */
import { api } from '../../../../convex/_generated/api'

export const convexFunctions = {
  users: {
    getCurrentUser: api.users.getCurrentUser,
    createOrUpdateCurrentUser: api.users.createOrUpdateCurrentUser,
  },
  ladder: {
    observeOwnQueue: api.ladder.observeOwnQueue,
    enterQueue: api.ladder.enterQueue,
    heartbeatQueue: api.ladder.heartbeatQueue,
    leaveQueue: api.ladder.leaveQueue,
    acknowledgeMatchHandoff: api.ladder.acknowledgeMatchHandoff,
    createDevFixture: api.ladder.createDevFixture,
  },
  matches: {
    createDevMatch: api.matches.createDevMatch,
    createCustomMatchWithOpponents: api.matches.createCustomMatchWithOpponents,
    listMyMatches: api.matches.listMyMatches,
    getPublicSnapshot: api.matches.getPublicSnapshot,
    getPrivateDelta: api.matches.getPrivateDelta,
    compactMatchLogs: api.matches.compactMatchLogs,
  },
  commands: {
    submitMatchCommand: api.commands.submitMatchCommand,
    resumeMatchFlow: api.commands.resumeMatchFlow,
  },
  customGames: {
    ensureMyCustomGameRoom: api.customGames.ensureMyCustomGameRoom,
    getMyCustomGameRoom: api.customGames.getMyCustomGameRoom,
    listComposingCustomGameRooms: api.customGames.listComposingCustomGameRooms,
    joinCustomGameRoomByInviteCode: api.customGames.joinCustomGameRoomByInviteCode,
    leaveMyCustomGameRoom: api.customGames.leaveMyCustomGameRoom,
    setMyCustomGameReady: api.customGames.setMyCustomGameReady,
    startMyCustomGameRoom: api.customGames.startMyCustomGameRoom,
  },
  adminMatches: {
    createDevMatchWithBots: api.adminMatches.createDevMatchWithBots,
    getLatestLadderQaSessionForAdmin: api.adminMatches.getLatestLadderQaSessionForAdmin,
    addLadderQaOpponent: api.adminMatches.addLadderQaOpponent,
    listAdminCustomGameRooms: api.adminMatches.listAdminCustomGameRooms,
    getAdminCustomGameRoom: api.adminMatches.getAdminCustomGameRoom,
    setCustomGameOpponentReady: api.adminMatches.setCustomGameOpponentReady,
    closeStartedCustomGameRoom: api.adminMatches.closeStartedCustomGameRoom,
    dismissReadyDevMatch: api.adminMatches.dismissReadyDevMatch,
    listAdminDevMatches: api.adminMatches.listAdminDevMatches,
    getAdminMatchState: api.adminMatches.getAdminMatchState,
    submitOpponentCommand: api.adminMatches.submitOpponentCommand,
    purgeCompletedDevMatchData: api.adminMatches.purgeCompletedDevMatchData,
    probeAdminAccess: api.adminMatches.probeAdminAccess,
    listRecentAdminAudit: api.adminMatches.listRecentAdminAudit,
  },
  virtualOpponents: {
    ensureDefaultVirtualOpponentsLoaded: api.virtualOpponents.ensureDefaultVirtualOpponentsLoaded,
    listVirtualOpponents: api.virtualOpponents.listVirtualOpponents,
  },
  snapshots: {
    getLatestPublicSnapshot: api.snapshots.getLatestPublicSnapshot,
    getLatestPrivateDelta: api.snapshots.getLatestPrivateDelta,
  },
} as const
