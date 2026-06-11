import { mockCustomGameState, mockRoomDetails } from './mockCustomGameData'
import type { MockCustomGameState, MockRoomDetail, MockRoomSummary } from './types'

const MOCK_LATENCY_MS = 180

function clone<T>(value: T): T {
  return structuredClone(value)
}

function wait(ms = MOCK_LATENCY_MS): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

export async function fetchCustomGameState(): Promise<MockCustomGameState> {
  await wait()
  return clone(mockCustomGameState)
}

export async function fetchCustomGameRooms(): Promise<MockRoomSummary[]> {
  await wait()
  return clone(mockCustomGameState.rooms)
}

export async function fetchCustomGameRoom(roomId: string): Promise<MockRoomDetail> {
  await wait()

  const room = mockRoomDetails[roomId]

  if (!room) {
    throw new Error(`Mock room not found: ${roomId}`)
  }

  return clone(room)
}

export async function joinCustomGameRoom(inviteCodeOrRoomId: string): Promise<MockRoomDetail> {
  await wait()

  const room = mockCustomGameState.rooms.find(
    (candidate) => candidate.id === inviteCodeOrRoomId || candidate.inviteCode === inviteCodeOrRoomId,
  )

  if (!room) {
    throw new Error(`Mock room not found: ${inviteCodeOrRoomId}`)
  }

  return fetchCustomGameRoom(room.id)
}
