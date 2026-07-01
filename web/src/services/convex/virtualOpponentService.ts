/**
 * # 개요
 * Convex-only virtual opponent catalog를 읽는 thin service wrapper다.
 * Virtual opponent는 Clerk user가 아니며, match participant에서 `virtualOpponentId`로 참조된다.
 */
import type { ConvexClient } from 'convex/browser'
import { convexFunctions } from './functionReferences'

export interface VirtualOpponentProfile {
  _id: string
  key: string
  displayName: string
  archetype?: string
  createdAt: number
  updatedAt: number
}

export function createVirtualOpponentService(client: ConvexClient) {
  return {
    async ensureDefaultVirtualOpponentsLoaded(): Promise<VirtualOpponentProfile[]> {
      return await client.mutation(convexFunctions.virtualOpponents.ensureDefaultVirtualOpponentsLoaded, {})
    },
    async listVirtualOpponents(): Promise<VirtualOpponentProfile[]> {
      return await client.query(convexFunctions.virtualOpponents.listVirtualOpponents, {})
    },
  }
}
