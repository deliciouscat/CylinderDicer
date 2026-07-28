export const CHARACTER_CATALOG = {
	rosemund: { skin: 'rosemund' },
	'hush-feather': { skin: 'hush-feather' },
	'samuel-saber': { skin: 'samuel-saber' },
	'zippo-jay': { skin: 'zippo-jay' },
	'calamity-kate': { skin: 'calamity-kate' },
	'the-kid': { skin: 'the-kid' },
} as const

export type CharacterKey = keyof typeof CHARACTER_CATALOG

export const CHARACTER_KEYS = Object.freeze(
	Object.keys(CHARACTER_CATALOG) as CharacterKey[],
)

export const DEFAULT_CHARACTER_KEY: CharacterKey = 'rosemund'

export function isCharacterKey(value: unknown): value is CharacterKey {
	return typeof value === 'string' && value in CHARACTER_CATALOG
}

export function characterSkin(characterKey: CharacterKey): string {
	return CHARACTER_CATALOG[characterKey].skin
}

export function legacySeatCharacterKey(seatIndex: number): CharacterKey {
	const normalizedIndex = Number.isSafeInteger(seatIndex)
		? Math.max(0, seatIndex)
		: 0
	return CHARACTER_KEYS[normalizedIndex % CHARACTER_KEYS.length]
}
