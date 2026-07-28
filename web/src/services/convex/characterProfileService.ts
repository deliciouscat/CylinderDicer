import type { ConvexClient } from 'convex/browser'
import type { CharacterKey } from '@shared/game/characters'
import { convexFunctions } from './functionReferences'

export interface CharacterProfile {
  _id: string
  clerkId: string
  displayName?: string
  characterKey?: CharacterKey
  createdAt: number
  updatedAt: number
}

export function createCharacterProfileService(client: ConvexClient) {
  return {
    async ensureCurrentUser(): Promise<CharacterProfile> {
      return await client.mutation(convexFunctions.users.createOrUpdateCurrentUser, {})
    },
    async setCharacter(characterKey: CharacterKey): Promise<CharacterProfile> {
      return await client.mutation(convexFunctions.users.setCurrentUserCharacter, { characterKey })
    },
  }
}
