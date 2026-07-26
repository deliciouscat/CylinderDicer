import { convexFunctions } from './functionReferences';
export function createAdminMatchService(client) {
    return {
        async createDevMatchWithBots(options = {}) {
            return await client.mutation(convexFunctions.adminMatches.createDevMatchWithBots, options);
        },
        async getLatestLadderQaSession() {
            return await client.query(convexFunctions.adminMatches.getLatestLadderQaSessionForAdmin, {});
        },
        async addLadderQaOpponent() {
            return await client.mutation(convexFunctions.adminMatches.addLadderQaOpponent, {});
        },
        async listAdminCustomGameRooms(options = {}) {
            return await client.query(convexFunctions.adminMatches.listAdminCustomGameRooms, options);
        },
        async getAdminCustomGameRoom(roomId) {
            return await client.query(convexFunctions.adminMatches.getAdminCustomGameRoom, { roomId });
        },
        async setCustomGameOpponentReady(input) {
            return await client.mutation(convexFunctions.adminMatches.setCustomGameOpponentReady, input);
        },
        async closeStartedCustomGameRoom(roomId) {
            return await client.mutation(convexFunctions.adminMatches.closeStartedCustomGameRoom, { roomId });
        },
        async dismissReadyDevMatch(matchId) {
            return await client.mutation(convexFunctions.adminMatches.dismissReadyDevMatch, { matchId });
        },
        async listAdminDevMatches(options = {}) {
            return await client.query(convexFunctions.adminMatches.listAdminDevMatches, options);
        },
        async getAdminMatchState(matchId) {
            return await client.query(convexFunctions.adminMatches.getAdminMatchState, { matchId });
        },
        async submitOpponentCommand(command) {
            return await client.mutation(convexFunctions.adminMatches.submitOpponentCommand, command);
        },
        async purgeCompletedDevMatchData(input) {
            return await client.mutation(convexFunctions.adminMatches.purgeCompletedDevMatchData, input);
        },
        async probeAdminAccess() {
            return await client.query(convexFunctions.adminMatches.probeAdminAccess, {});
        },
        async listRecentAdminAudit(options = {}) {
            return await client.query(convexFunctions.adminMatches.listRecentAdminAudit, options);
        },
        subscribeAdminMatchState(matchId, onState, onError) {
            return client.onUpdate(convexFunctions.adminMatches.getAdminMatchState, { matchId }, (state) => onState(state), onError);
        },
        subscribeAdminCustomGameRoom(roomId, onRoom, onError) {
            return client.onUpdate(convexFunctions.adminMatches.getAdminCustomGameRoom, { roomId }, (room) => onRoom(room), onError);
        },
        subscribeLatestLadderQaSession(onSession, onError) {
            return client.onUpdate(convexFunctions.adminMatches.getLatestLadderQaSessionForAdmin, {}, (session) => onSession(session), onError);
        },
    };
}
