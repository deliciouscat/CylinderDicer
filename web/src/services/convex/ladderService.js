import { convexFunctions } from './functionReferences';
export function createLadderService(client) {
    return {
        async enterQueue() {
            return await client.mutation(convexFunctions.ladder.enterQueue, {});
        },
        async heartbeatQueue() {
            return await client.mutation(convexFunctions.ladder.heartbeatQueue, {});
        },
        async leaveQueue() {
            return await client.mutation(convexFunctions.ladder.leaveQueue, {});
        },
        async acknowledgeMatchHandoff(matchId) {
            return await client.mutation(convexFunctions.ladder.acknowledgeMatchHandoff, { matchId });
        },
        async getOwnQueueState() {
            return await client.query(convexFunctions.ladder.observeOwnQueue, {});
        },
        subscribeOwnQueue(onUpdate, onError) {
            return client.onUpdate(convexFunctions.ladder.observeOwnQueue, {}, (state) => onUpdate(state), onError);
        },
        async createDevFixture(playerCount) {
            return await client.mutation(convexFunctions.ladder.createDevFixture, { playerCount });
        },
    };
}
