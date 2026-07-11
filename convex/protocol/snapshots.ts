/**
 * # 개요
 * Convex가 Vue/Defold에 내려주는 public view와 private delta payload를 정의한다.
 * Public view는 관전 가능한 정보만 담고, private delta는 해당 플레이어의 손패/실린더 등 개인 정보만 포함한다.
 *
 * # 의존성
 * - `convex/match/state.ts`: authoritative state.
 * - `convex/match/snapshots.ts`: state를 public/private view로 투영한다.
 * - `shared/protocol/game-bridge.ts`: `SERVER_SNAPSHOT` payload로 전달된다.
 *
 * # I/O
 * - 입력:
 *   - authoritative match state.
 *   - viewer user/player id.
 * - 출력:
 *   - public view.
 *   - private delta.
 *
 * # 의사코드
 * ```text
 * build public view from state
 * remove hidden dice/cylinder details
 * build private delta for current viewer only
 * include only viewer-owned hidden details and available actions
 * merge public view + private delta in Vue before sending SERVER_SNAPSHOT to Defold
 * ```
 */
export type SnapshotKind = 'public' | 'private_delta'

export type MatchPhase =
  | 'waiting'
  | 'revolver_reload'
  | 'cup_shake'
  | 'dice_check'
  | 'bidding_gap'
  | 'bidding'
  | 'duel'
  | 'complete'

export interface PublicPlayerSnapshot {
  id: string
  name: string
  hp: number
  bullets: number
  eliminated: boolean
  isActive: boolean
  isLocal?: boolean
}

export type AvailableAction =
  | { type: 'load'; slots: number[]; remaining: number }
  | { type: 'load_all'; remaining: number }
  | { type: 'shake_complete'; command: 'shake.complete'; remaining: number }
  | { type: 'check' }
  | {
      type: 'bid'
      min_count: number
      max_count: number
      min_face: number
      max_face: number
      suggested: { count: number; face: number }
    }
  | { type: 'challenge' }

export interface MatchSnapshotBase {
  kind: SnapshotKind
  matchId: string
  revision: number
  phase: MatchPhase
  hud: string
  match: {
    id: string
    status: 'idle' | 'ready' | 'complete'
    mode: 'dev' | 'casual' | 'ranked'
    localPlayerId?: string
    turnCount: number
    eventsHash: string
    winnerId?: string
  }
  turn: {
    activePlayerId?: string
    previousPlayerId?: string
    roundIndex: number
    isFirstShake: boolean
  }
  activePlayerId?: string
  previousPlayerId?: string
  players: PublicPlayerSnapshot[]
  bidding: {
    currentBid?: {
      playerId: string
      count: number
      face: number
    }
    suggestedBid: {
      count: number
      face: number
    }
  }
  pendingLoad?: unknown
	shake?: MatchShakeSnapshot
	duel?: unknown
}

export interface MatchShakeSnapshot {
	requiredCount: number
	counts: Record<string, number>
	checked: Record<string, boolean>
	reloadPlayerId?: string
	reloadSource?: string
}

export interface MatchPublicSnapshot extends MatchSnapshotBase {
  kind: 'public'
}

export interface MatchPrivateDelta {
  kind: 'private_delta'
  matchId: string
  revision: number
  hud: string
  viewerPlayerId: string
  dice?: number[]
  cylinder?: {
    chamberIndex: number
    slots: boolean[]
  }
  availableActions: AvailableAction[]
}

export type MatchSnapshot = MatchPublicSnapshot | MatchPrivateDelta
