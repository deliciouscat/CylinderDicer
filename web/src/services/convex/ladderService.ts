import type { ConvexClient } from 'convex/browser'
import type { LadderQueueState } from '../../ladder/ladder.types'
import { convexFunctions } from './functionReferences'

export type LadderQueueUnsubscribe = (() => void) & {
  unsubscribe(): void
}

export function createLadderService(client: ConvexClient) {
  return {
    async enterQueue(): Promise<LadderQueueState> {
      return await client.mutation(convexFunctions.ladder.enterQueue, {}) as LadderQueueState
    },
    async leaveQueue(): Promise<LadderQueueState> {
      return await client.mutation(convexFunctions.ladder.leaveQueue, {}) as LadderQueueState
    },
    async getOwnQueueState(): Promise<LadderQueueState> {
      return await client.query(convexFunctions.ladder.observeOwnQueue, {}) as LadderQueueState
    },
    subscribeOwnQueue(
      onUpdate: (state: LadderQueueState) => void,
      onError?: (error: Error) => void,
    ): LadderQueueUnsubscribe {
      return client.onUpdate(
        convexFunctions.ladder.observeOwnQueue,
        {},
        (state) => onUpdate(state as unknown as LadderQueueState),
        onError,
      ) as LadderQueueUnsubscribe
    },
    async createDevFixture(playerCount: number): Promise<LadderQueueState> {
      return await client.mutation(
        convexFunctions.ladder.createDevFixture,
        { playerCount },
      ) as LadderQueueState
    },
  }
}
