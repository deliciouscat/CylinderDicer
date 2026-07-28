import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const { GAMEPLAY_BOT_SPECS } = require(
	'../../../.tmp/convex-domain/convex/bots/specs.js',
)
const { CHARACTER_CATALOG } = require(
	'../../../.tmp/convex-domain/shared/game/characters.js',
)

test('gameplay bot names are pinned to explicit character identities', () => {
	assert.deepEqual(
		GAMEPLAY_BOT_SPECS.map((spec) => [
			spec.displayName,
			spec.characterKey,
			CHARACTER_CATALOG[spec.characterKey]?.skin,
		]),
		[
			['Hush Feather', 'hush-feather', 'hush-feather'],
			['Samuel Saber', 'samuel-saber', 'samuel-saber'],
			['Zippo Jay', 'zippo-jay', 'zippo-jay'],
			['Calamity Kate', 'calamity-kate', 'calamity-kate'],
			['The Kid', 'the-kid', 'the-kid'],
		],
	)
})

test('Defold character key order matches the shared legacy fallback order', () => {
	const lua = fs.readFileSync('play/game/characters.lua', 'utf8')
	const keyBlock = lua.match(/M\.KEYS\s*=\s*\{([\s\S]*?)\}/)?.[1]
	assert.ok(keyBlock, 'missing Defold character key catalog')
	const luaKeys = [...keyBlock.matchAll(/"([^"]+)"/g)].map((match) => match[1])

	assert.deepEqual(luaKeys, Object.keys(CHARACTER_CATALOG))
})
