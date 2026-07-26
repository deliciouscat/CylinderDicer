import { convexFunctions } from './functionReferences';
export function createVirtualOpponentService(client) {
    return {
        async ensureDefaultVirtualOpponentsLoaded() {
            return await client.mutation(convexFunctions.virtualOpponents.ensureDefaultVirtualOpponentsLoaded, {});
        },
        async listVirtualOpponents() {
            return await client.query(convexFunctions.virtualOpponents.listVirtualOpponents, {});
        },
    };
}
