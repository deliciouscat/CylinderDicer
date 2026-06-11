export type MockUser = {
  id: string
  nickname: string
}

export type MockRoomSummary = {
  id: string
  hostId: string
  hostName: string
  players: number
  capacity: number
  inviteCode: string
}

export type MockRoomPlayer = {
  userId: string
  nickname: string
  isHost: boolean
  isReady: boolean
}

export type MockRoomDetail = {
  id: string
  hostId: string
  inviteCode: string
  capacity: number
  players: MockRoomPlayer[]
}

export type MockCustomGameState = {
  currentUserId: string
  rooms: MockRoomSummary[]
  selectedRoomId: string
  activeRoom: MockRoomDetail
}
