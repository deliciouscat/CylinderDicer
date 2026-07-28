import type { MatchCommandType } from './commands'
import { GAME_RULESET } from '../../shared/game/ruleset'

export type NormalizedCommandPayload =
	| undefined
	| { slotIndex: number }
	| {
		bid: {
			playerId?: string
			count: number
			face: number
		}
	}

export type CommandPayloadParseResult =
	| { ok: true; payload: NormalizedCommandPayload }
	| { ok: false; reason: string }

const EMPTY_PAYLOAD_COMMANDS = new Set<MatchCommandType>([
	'shake.complete',
	'dice.check',
	'bid.challenge',
	'shake.timeout',
	'dice.check.timeout',
	'bidding.timeout',
	'bidding.open',
	'bid.reload_timeout',
	'duel.execute',
	'round.advance',
])

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function hasOnlyKeys(record: Record<string, unknown>, allowed: string[]): boolean {
	const allowedKeys = new Set(allowed)
	return Object.keys(record).every((key) => allowedKeys.has(key))
}

export function isFiniteSafeInteger(
	value: unknown,
	minimum: number,
	maximum: number,
): value is number {
	return typeof value === 'number'
		&& Number.isFinite(value)
		&& Number.isSafeInteger(value)
		&& value >= minimum
		&& value <= maximum
}

function emptyPayload(payload: unknown): boolean {
	return payload === undefined
		|| payload === null
		|| (isRecord(payload) && Object.keys(payload).length === 0)
}

function parseSlotPayload(payload: unknown): CommandPayloadParseResult {
	if (!isRecord(payload) || !hasOnlyKeys(payload, ['slotIndex', 'slot_index'])) {
		return { ok: false, reason: 'slot_payload_shape' }
	}
	const hasCamel = Object.hasOwn(payload, 'slotIndex')
	const hasSnake = Object.hasOwn(payload, 'slot_index')
	if (hasCamel === hasSnake) {
		return { ok: false, reason: 'slot_payload_shape' }
	}
	const slotIndex = hasCamel ? payload.slotIndex : payload.slot_index
	if (!isFiniteSafeInteger(slotIndex, 1, GAME_RULESET.cylinder.slots)) {
		return { ok: false, reason: 'slot_index_range' }
	}
	return { ok: true, payload: { slotIndex } }
}

function parseBidPayload(payload: unknown): CommandPayloadParseResult {
	if (!isRecord(payload)) {
		return { ok: false, reason: 'bid_payload_shape' }
	}
	const rawBid = Object.hasOwn(payload, 'bid') ? payload.bid : payload
	if (
		!isRecord(rawBid)
		|| !hasOnlyKeys(rawBid, ['playerId', 'player_id', 'count', 'face'])
	) {
		return { ok: false, reason: 'bid_payload_shape' }
	}
	if (Object.hasOwn(payload, 'bid') && !hasOnlyKeys(payload, ['bid'])) {
		return { ok: false, reason: 'bid_payload_shape' }
	}

	const hasCamelPlayer = Object.hasOwn(rawBid, 'playerId')
	const hasSnakePlayer = Object.hasOwn(rawBid, 'player_id')
	if (hasCamelPlayer && hasSnakePlayer) {
		return { ok: false, reason: 'bid_player_shape' }
	}
	const rawPlayerId = hasCamelPlayer ? rawBid.playerId : rawBid.player_id
	if (
		rawPlayerId !== undefined
		&& (typeof rawPlayerId !== 'string' || rawPlayerId.length === 0)
	) {
		return { ok: false, reason: 'bid_player_shape' }
	}
	if (
		!isFiniteSafeInteger(
			rawBid.count,
			GAME_RULESET.bidding.countMin,
			GAME_RULESET.bidding.countMax,
		)
	) {
		return { ok: false, reason: 'count_range' }
	}
	if (
		!isFiniteSafeInteger(
			rawBid.face,
			GAME_RULESET.dice.faceMin,
			GAME_RULESET.dice.faceMax,
		)
	) {
		return { ok: false, reason: 'face_range' }
	}
	return {
		ok: true,
		payload: {
			bid: {
				...(rawPlayerId === undefined ? {} : { playerId: rawPlayerId }),
				count: rawBid.count,
				face: rawBid.face,
			},
		},
	}
}

export function parseCommandPayload(
	type: MatchCommandType,
	payload: unknown,
): CommandPayloadParseResult {
	if (type === 'setup.load_initial' || type === 'bullet.load') {
		return parseSlotPayload(payload)
	}
	if (type === 'bid.raise') {
		return parseBidPayload(payload)
	}
	if (EMPTY_PAYLOAD_COMMANDS.has(type)) {
		return emptyPayload(payload)
			? { ok: true, payload: undefined }
			: { ok: false, reason: 'unexpected_payload' }
	}
	return { ok: false, reason: 'unknown_command_type' }
}
