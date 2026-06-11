import type { MockCustomGameState, MockRoomDetail, MockRoomSummary, MockUser } from './types'

export const mockUsers: MockUser[] = [
  { id: 'user_revolver_666', nickname: 'Revolver666' },
  { id: 'user_redbull_67', nickname: 'RedBull67' },
  { id: 'user_iam_johnson', nickname: 'iAmJohnson' },
  { id: 'user_umm_joon_seek', nickname: 'UmmJoonSeek' },
  { id: 'user_player_1', nickname: 'iAmPlayer1' },
  { id: 'user_random_nickname', nickname: 'randomNickName' },
  { id: 'user_black_bull', nickname: 'BlackBullShit8' },
  { id: 'user_king', nickname: '111king111' },
  { id: 'user_afreeka_52', nickname: 'Afreeka52' },
]

export const mockRoomDetails: Record<string, MockRoomDetail> = {
  room_redbull_67: {
    id: 'room_redbull_67',
    hostId: 'user_redbull_67',
    inviteCode: 'rb6704',
    capacity: 6,
    players: [
      { userId: 'user_redbull_67', nickname: 'RedBull67', isHost: true, isReady: false },
      { userId: 'user_iam_johnson', nickname: 'iAmJohnson', isHost: false, isReady: true },
      { userId: 'user_black_bull', nickname: 'BlackBullShit8', isHost: false, isReady: false },
      { userId: 'user_afreeka_52', nickname: 'Afreeka52', isHost: false, isReady: true },
    ],
  },
  room_iam_johnson: {
    id: 'room_iam_johnson',
    hostId: 'user_iam_johnson',
    inviteCode: 'ij2206',
    capacity: 6,
    players: [
      { userId: 'user_iam_johnson', nickname: 'iAmJohnson', isHost: true, isReady: false },
      { userId: 'user_player_1', nickname: 'iAmPlayer1', isHost: false, isReady: true },
    ],
  },
  room_revolver_666: {
    id: 'room_revolver_666',
    hostId: 'user_revolver_666',
    inviteCode: 'za10234',
    capacity: 6,
    players: [
      { userId: 'user_revolver_666', nickname: 'Revolver666', isHost: true, isReady: false },
      { userId: 'user_player_1', nickname: 'iAmPlayer1', isHost: false, isReady: true },
      { userId: 'user_random_nickname', nickname: 'randomNickName', isHost: false, isReady: false },
      { userId: 'user_black_bull', nickname: 'BlackBullShit8', isHost: false, isReady: true },
      { userId: 'user_king', nickname: '111king111', isHost: false, isReady: false },
      { userId: 'user_afreeka_52', nickname: 'Afreeka52', isHost: false, isReady: true },
    ],
  },
  room_umm_joon_seek: {
    id: 'room_umm_joon_seek',
    hostId: 'user_umm_joon_seek',
    inviteCode: 'uj1006',
    capacity: 6,
    players: [
      { userId: 'user_umm_joon_seek', nickname: 'UmmJoonSeek', isHost: true, isReady: false },
    ],
  },
}

export const mockRoomSummaries: MockRoomSummary[] = Object.values(mockRoomDetails).map((room) => {
  const host = room.players.find((player) => player.userId === room.hostId)

  return {
    id: room.id,
    hostId: room.hostId,
    hostName: host?.nickname ?? room.hostId,
    players: room.players.length,
    capacity: room.capacity,
    inviteCode: room.inviteCode,
  }
})

export const mockCustomGameState: MockCustomGameState = {
  currentUserId: 'user_revolver_666',
  rooms: mockRoomSummaries,
  selectedRoomId: '',
  activeRoom: mockRoomDetails.room_revolver_666,
}
