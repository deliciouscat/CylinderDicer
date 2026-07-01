/**
 * # 개요
 * Admin opponent controller가 Convex admin match 함수를 호출하는 thin service wrapper다.
 * Vue 화면은 generated API를 직접 참조하지 않고 이 service만 사용한다.
 */
import type { ConvexClient } from 'convex/browser'
import { convexFunctions } from './functionReferences'

export interface AdminParticipant {
  _id: string
  matchId: string
  userId?: string
  virtualOpponentId?: string
  virtualOpponentKey?: string
  participantKind?: 'human' | 'virtual'
  playerId: string
  seatIndex: number
  status: string
  displayName?: string
  clerkId?: string
  archetype?: string
  isBot?: boolean
}

export interface AdminDevMatchRow {
  match: {
    _id: string
    mode: string
    status: string
    revision: number
    createdAt: number
    updatedAt: number
  }
  host?: {
    userId: string
    displayName?: string
    clerkId?: string
  } | null
  publicSnapshot?: Record<string, any> | null
  participants: AdminParticipant[]
}

export interface AdminMatchState {
  ok: boolean
  code?: string
  message?: string
  match?: AdminDevMatchRow['match']
  state?: Record<string, any>
  publicSnapshot?: Record<string, any> | null
  playerDeltas?: Record<string, any>
  participants?: AdminParticipant[]
}

export interface AdminCustomGameParticipant {
  _id: string
  roomId: string
  userId?: string
  virtualOpponentId?: string
  participantKind: 'human' | 'virtual'
  playerId: string
  displayName: string
  archetype?: string
  ready: boolean
  seatIndex: number
  status: string
}

export interface AdminCustomGameRoomView {
  ok?: boolean
  code?: string
  message?: string
  room?: {
    _id: string
    hostUserId: string
    status: string
    inviteCode: string
    matchId?: string
    createdAt: number
    updatedAt: number
  }
  host?: {
    userId: string
    displayName?: string
    clerkId?: string
  } | null
  participants?: AdminCustomGameParticipant[]
  allReady?: boolean
}

export interface SubmitOpponentCommandInput {
  matchId: string
  targetPlayerId: string
  commandId: string
  revision: number
  type: string
  payload?: unknown
}

export function createAdminMatchService(client: ConvexClient) {
  return {
    async createDevMatchWithBots(options: {
      localPlayerName?: string
      firstPlayerId?: string
      requiresSetupLoad?: boolean
      reuseActive?: boolean
    } = {}) {
      return await client.mutation(convexFunctions.adminMatches.createDevMatchWithBots, options)
    },
    async listAdminCustomGameRooms(options: { status?: 'composing' | 'started' | 'cancelled'; limit?: number } = {}): Promise<AdminCustomGameRoomView[]> {
      return await client.query(convexFunctions.adminMatches.listAdminCustomGameRooms, options) as AdminCustomGameRoomView[]
    },
    async getAdminCustomGameRoom(roomId: string): Promise<AdminCustomGameRoomView> {
      return await client.query(convexFunctions.adminMatches.getAdminCustomGameRoom, { roomId } as any)
    },
    async setCustomGameOpponentReady(input: { roomId: string; targetPlayerId: string; ready: boolean }): Promise<Record<string, any>> {
      return await client.mutation(convexFunctions.adminMatches.setCustomGameOpponentReady, input as any)
    },
    async listAdminDevMatches(options: { status?: 'ready' | 'complete'; limit?: number } = {}): Promise<AdminDevMatchRow[]> {
      return await client.query(convexFunctions.adminMatches.listAdminDevMatches, options)
    },
    async getAdminMatchState(matchId: string): Promise<AdminMatchState> {
      return await client.query(convexFunctions.adminMatches.getAdminMatchState, { matchId } as any)
    },
    async submitOpponentCommand(command: SubmitOpponentCommandInput): Promise<Record<string, any>> {
      return await client.mutation(convexFunctions.adminMatches.submitOpponentCommand, command as Record<string, any>)
    },
  }
}
