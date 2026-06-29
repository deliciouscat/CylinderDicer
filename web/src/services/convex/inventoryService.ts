/**
 * # 개요
 * dice/cup skin, currency, equipped cosmetics 같은 inventory 데이터를 다루는 service wrapper다.
 * match rendering에 필요한 cosmetic payload는 이 레이어를 통해 준비한다.
 *
 * # 의존성
 * - `convex/schema.ts`: inventories table.
 * - `shared/protocol/game-bridge.ts`: SET_COSMETICS payload.
 * - `web/src/services/convex/authService.ts`: 현재 사용자.
 *
 * # I/O
 * - 입력:
 *   - current user id.
 *   - equip cosmetic request.
 * - 출력:
 *   - inventory snapshot.
 *   - equipped cosmetics payload.
 *
 * # 의사코드
 * ```text
 * read inventory for current user
 * map equipped skin ids to Defold cosmetic payload
 * submit equip mutation when user changes cosmetics
 * emit SET_COSMETICS before or during match start
 * ```
 */
export interface EquippedCosmetics {
  diceSkin: string
  cupSkin: string
}

export interface InventorySnapshot {
  coins: number
  gems: number
  equipped: EquippedCosmetics
}
