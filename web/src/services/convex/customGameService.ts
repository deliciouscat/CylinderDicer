/**
 * # 개요
 * Custom Game room composition/ready 상태를 Convex와 동기화하는 service wrapper다.
 */
import type { ConvexClient } from 'convex/browser'
import { convexFunctions } from './functionReferences'
import type { CreatedMatch } from './matchService'

export interface CustomGameParticipant {
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

export interface CustomGameRoomViewer {
  userId: string
  isHost: boolean
  playerId: string
  ready: boolean
}

export interface CustomGameRoomView {
  ok: boolean
  room: {
    _id: string
    hostUserId: string
    status: 'composing' | 'started' | 'cancelled'
    inviteCode: string
    matchId?: string
    createdAt: number
    updatedAt: number
  }
  participants: CustomGameParticipant[]
  allReady: boolean
  viewer?: CustomGameRoomViewer | null
}

export type CustomGameRoomUnsubscribe = (() => void) & {
  unsubscribe(): void
  getCurrentValue(): unknown | undefined
}

export function createCustomGameService(client: ConvexClient) {
  return {
    async ensureMyCustomGameRoom(options: { virtualOpponentKeys?: string[] } = {}): Promise<CustomGameRoomView | Record<string, any> | null> {
      return await client.mutation(convexFunctions.customGames.ensureMyCustomGameRoom, options)
    },
    async getMyCustomGameRoom(): Promise<CustomGameRoomView | null> {
      return await client.query(convexFunctions.customGames.getMyCustomGameRoom, {}) as CustomGameRoomView | null
    },
    async joinCustomGameRoomByInviteCode(inviteCode: string): Promise<CustomGameRoomView | Record<string, any>> {
      return await client.mutation(convexFunctions.customGames.joinCustomGameRoomByInviteCode, { inviteCode }) as CustomGameRoomView | Record<string, any>
    },
    async leaveMyCustomGameRoom(roomId: string): Promise<Record<string, any>> {
      return await client.mutation(convexFunctions.customGames.leaveMyCustomGameRoom, { roomId } as any)
    },
    async setMyCustomGameReady(input: { roomId: string; ready: boolean }): Promise<CustomGameRoomView | Record<string, any>> {
      return await client.mutation(convexFunctions.customGames.setMyCustomGameReady, input as any) as CustomGameRoomView | Record<string, any>
    },
    async setMyCustomGameOpponents(input: { roomId: string; virtualOpponentKeys: string[] }): Promise<CustomGameRoomView | Record<string, any> | null> {
      return await client.mutation(convexFunctions.customGames.setMyCustomGameOpponents, input as any)
    },
    async startMyCustomGameRoom(roomId: string): Promise<CreatedMatch | Record<string, any>> {
      return await client.mutation(convexFunctions.customGames.startMyCustomGameRoom, { roomId } as any)
    },
    subscribeMyCustomGameRoom(
      onRoom: (room: CustomGameRoomView | null) => void,
      onError?: (error: Error) => void,
    ): CustomGameRoomUnsubscribe {
      return client.onUpdate(
        convexFunctions.customGames.getMyCustomGameRoom,
        {},
        (room) => onRoom(room as CustomGameRoomView | null),
        onError,
      ) as CustomGameRoomUnsubscribe
    },
  }
}
