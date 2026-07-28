import {
  CHARACTER_KEYS,
  DEFAULT_CHARACTER_KEY,
  isCharacterKey,
  type CharacterKey,
} from '../../../shared/game/characters'

export function normalizeCharacterSelection(value: unknown): CharacterKey {
  return isCharacterKey(value) ? value : DEFAULT_CHARACTER_KEY
}

export function moveCharacterSelection(
  current: CharacterKey,
  offset: number,
): CharacterKey {
  const currentIndex = CHARACTER_KEYS.indexOf(current)
  const normalizedOffset = Number.isFinite(offset) ? Math.trunc(offset) : 0
  const nextIndex = (
    currentIndex + normalizedOffset + CHARACTER_KEYS.length
  ) % CHARACTER_KEYS.length
  return CHARACTER_KEYS[nextIndex]
}

export function characterDirectionFromWheel(deltaX: number, deltaY: number): -1 | 0 | 1 {
  const primaryDelta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY
  if (!Number.isFinite(primaryDelta) || Math.abs(primaryDelta) < 2) {
    return 0
  }
  return primaryDelta > 0 ? 1 : -1
}
