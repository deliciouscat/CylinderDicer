export type CustomGameBackAction = 'leave_to_room_browser' | 'lobby'

export function customGameBackAction(hasOpenRoom: boolean): CustomGameBackAction {
	return hasOpenRoom ? 'leave_to_room_browser' : 'lobby'
}
