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
  characterKey?: string
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
    status: 'composing' | 'started' | 'completed' | 'cancelled'
    inviteCode: string
    matchId?: string
    createdAt: number
    updatedAt: number
  }
  participants: CustomGameParticipant[]
  allReady: boolean
  viewer?: CustomGameRoomViewer | null
}

export interface CustomGameRoomListRow {
  roomId: string
  hostUserId: string
  hostDisplayName: string
  inviteCode: string
  playerCount: number
  maxPlayers: number
  allReady: boolean
  updatedAt: number
}

export type CustomGameRoomUnsubscribe = (() => void) & {
  unsubscribe(): void
  getCurrentValue(): unknown | undefined
}

export interface RemoveCustomGameOpponentInput {
  roomId: string
  playerId: string
}

export async function removeMyCustomGameOpponent(
  client: ConvexClient,
  input: RemoveCustomGameOpponentInput,
): Promise<CustomGameRoomView | Record<string, any>> {
  return await client.mutation(
    convexFunctions.customGames.removeMyCustomGameOpponent,
    input as any,
  ) as CustomGameRoomView | Record<string, any>
}

export function createCustomGameService(client: ConvexClient) {
  return {
    async ensureMyCustomGameRoom(): Promise<CustomGameRoomView | Record<string, any> | null> {
      return await client.mutation(convexFunctions.customGames.ensureMyCustomGameRoom, {})
    },
    async getMyCustomGameRoom(): Promise<CustomGameRoomView | null> {
      return await client.query(convexFunctions.customGames.getMyCustomGameRoom, {}) as CustomGameRoomView | null
    },
    async listComposingCustomGameRooms(limit = 12): Promise<CustomGameRoomListRow[]> {
      return await client.query(convexFunctions.customGames.listComposingCustomGameRooms, { limit }) as CustomGameRoomListRow[]
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
    async addMyCustomGameOpponent(roomId: string): Promise<CustomGameRoomView | Record<string, any>> {
      return await client.mutation(convexFunctions.customGames.addMyCustomGameOpponent, { roomId } as any) as CustomGameRoomView | Record<string, any>
    },
    async removeMyCustomGameOpponent(input: RemoveCustomGameOpponentInput): Promise<CustomGameRoomView | Record<string, any>> {
      return await removeMyCustomGameOpponent(client, input)
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
