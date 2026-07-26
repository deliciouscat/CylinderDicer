import { convexFunctions } from './functionReferences';
export function createCustomGameService(client) {
    return {
        async ensureMyCustomGameRoom(options = {}) {
            return await client.mutation(convexFunctions.customGames.ensureMyCustomGameRoom, options);
        },
        async getMyCustomGameRoom() {
            return await client.query(convexFunctions.customGames.getMyCustomGameRoom, {});
        },
        async listComposingCustomGameRooms(limit = 12) {
            return await client.query(convexFunctions.customGames.listComposingCustomGameRooms, { limit });
        },
        async joinCustomGameRoomByInviteCode(inviteCode) {
            return await client.mutation(convexFunctions.customGames.joinCustomGameRoomByInviteCode, { inviteCode });
        },
        async leaveMyCustomGameRoom(roomId) {
            return await client.mutation(convexFunctions.customGames.leaveMyCustomGameRoom, { roomId });
        },
        async setMyCustomGameReady(input) {
            return await client.mutation(convexFunctions.customGames.setMyCustomGameReady, input);
        },
        async addMyCustomGameOpponent(roomId) {
            return await client.mutation(convexFunctions.customGames.addMyCustomGameOpponent, { roomId });
        },
        async startMyCustomGameRoom(roomId) {
            return await client.mutation(convexFunctions.customGames.startMyCustomGameRoom, { roomId });
        },
        subscribeMyCustomGameRoom(onRoom, onError) {
            return client.onUpdate(convexFunctions.customGames.getMyCustomGameRoom, {}, (room) => onRoom(room), onError);
        },
    };
}
