import { convexFunctions } from './functionReferences';
export function mergeMatchSnapshots(publicSnapshot, privateDelta) {
    if (!publicSnapshot) {
        return null;
    }
    if (!privateDelta || privateDelta.matchId !== publicSnapshot.matchId) {
        return publicSnapshot;
    }
    return {
        ...publicSnapshot,
        hud: privateDelta.hud ?? publicSnapshot.hud,
        private: privateDelta,
        viewerPlayerId: privateDelta.viewerPlayerId,
        dice: privateDelta.dice,
        cylinder: privateDelta.cylinder,
        availableActions: privateDelta.availableActions,
    };
}
export function createMatchService(client) {
    return {
        async createDevMatch(options = {}) {
            return await client.mutation(convexFunctions.matches.createDevMatch, options);
        },
        async createCustomMatchWithOpponents(options = {}) {
            return await client.mutation(convexFunctions.matches.createCustomMatchWithOpponents, options);
        },
        async submitCommand(command) {
            return await client.mutation(convexFunctions.commands.submitMatchCommand, command);
        },
        async resumeMatchFlow(matchId) {
            return await client.mutation(convexFunctions.commands.resumeMatchFlow, { matchId });
        },
        async getPublicSnapshot(matchId) {
            return await client.query(convexFunctions.snapshots.getLatestPublicSnapshot, { matchId });
        },
        async getPrivateDelta(matchId) {
            return await client.query(convexFunctions.snapshots.getLatestPrivateDelta, { matchId });
        },
        async compactMatchLogs(input) {
            return await client.mutation(convexFunctions.matches.compactMatchLogs, input);
        },
        subscribeSnapshot(matchId, handlers) {
            const query = handlers.private
                ? convexFunctions.snapshots.getLatestPrivateDelta
                : convexFunctions.snapshots.getLatestPublicSnapshot;
            return client.onUpdate(query, { matchId }, (snapshot) => handlers.onSnapshot(snapshot), handlers.onError);
        },
        subscribePublicView(matchId, handlers) {
            return this.subscribeSnapshot(matchId, handlers);
        },
    };
}
