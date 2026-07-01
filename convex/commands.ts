/**
 * # 개요
 * 클라이언트와 QA 도구가 제출한 match command를 서버 권위형으로 검증·적용하는 핵심 mutation 모듈이다.
 * Defold/Vue/opponent-controller는 결과를 직접 쓰지 않고 이 모듈에 intent만 제출한다.
 *
 * # 의존성
 * - `convex/protocol/commands.ts`: command 타입.
 * - `convex/protocol/errors.ts`: reject reason.
 * - `convex/match/reducer.ts`: authoritative state transition.
 * - `convex/match/snapshots.ts`: public view/private delta 생성.
 * - `convex/schema.ts`: matchCommands, matchEvents, matchSnapshots.
 *
 * # I/O
 * - 입력:
 *   - `submitMatchCommand(commandId, matchId, revision, type, payload)`.
 *   - authenticated actor user.
 * - 출력:
 *   - accepted result: next revision, events, snapshots.
 *   - rejected result: stable error code and message.
 *
 * # 의사코드
 * ```text
 * validate auth
 * validate actor belongs to match
 * dedupe by matchId + commandId
 * load latest authoritative state from snapshot/event log
 * reject if client revision is stale beyond allowed policy
 * reduce state with command
 * append command row and event rows
 * write compact state and changed public/private views
 * return accepted result
 * ```
 */
import { mutationGeneric } from 'convex/server'
import { v } from 'convex/values'
import { commandToAction } from './match/actions'
import { reduceMatchState } from './match/reducer'
import { buildPrivateDelta, buildPublicSnapshot } from './match/snapshots'
import type { MatchCommand, MatchCommandType } from './protocol/commands'
import { getLatestMatchState, getMatchParticipant, writeStateAndPublicView } from './matches'
import { requireCurrentUser, type GenericCtx } from './users'

const MAX_COMMAND_ID_LENGTH = 160
const MAX_PAYLOAD_JSON_LENGTH = 4096
const RETENTION_MS_BY_MODE = {
	dev: 6 * 60 * 60 * 1000,
	casual: 7 * 24 * 60 * 60 * 1000,
	ranked: 30 * 24 * 60 * 60 * 1000,
}

function toConvexValue<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T
}

function jsonLength(value: unknown): number {
	if (value === undefined) {
		return 0
	}
	return JSON.stringify(value).length
}

function commandExpiresAt(mode: keyof typeof RETENTION_MS_BY_MODE | undefined, now: number) {
	return now + RETENTION_MS_BY_MODE[mode ?? 'dev']
}

export const matchCommandTypeValidator = v.union(
	v.literal('setup.load_initial'),
	v.literal('shake.complete'),
	v.literal('dice.check'),
	v.literal('bidding.open'),
	v.literal('bullet.load'),
	v.literal('bid.raise'),
	v.literal('bid.challenge'),
	v.literal('duel.execute'),
	v.literal('round.advance'),
)

export interface ApplyMatchCommandInput {
	matchId: string
	commandId: string
	revision: number
	type: MatchCommandType
	payload?: unknown
	actorUserId?: string
	actorVirtualOpponentId?: string
	actorPlayerId: string
	source?: 'player' | 'admin' | 'bot'
	submittedByUserId?: string
	stalePrivateDeltaPlayerId?: string
}

async function findDuplicateCommand(ctx: GenericCtx, matchId: string, commandId: string) {
	return await ctx.db
		.query('matchCommands')
		.withIndex('by_match_command', (q: any) => q.eq('matchId', matchId).eq('commandId', commandId))
		.first()
}

async function markParticipantsComplete(ctx: GenericCtx, matchId: string, now: number) {
	const participants = await ctx.db
		.query('matchParticipants')
		.withIndex('by_match', (q: any) => q.eq('matchId', matchId))
		.collect()
	let updated = 0
	for (const participant of participants) {
		if (participant.status !== 'complete') {
			updated += 1
			await ctx.db.patch(participant._id, {
				status: 'complete',
				updatedAt: now,
			})
		}
	}
	const verifiedParticipants = await ctx.db
		.query('matchParticipants')
		.withIndex('by_match', (q: any) => q.eq('matchId', matchId))
		.collect()
	const remainingActive = verifiedParticipants.filter((participant: any) => participant.status === 'active')
	return {
		total: verifiedParticipants.length,
		updated,
		remainingActive: remainingActive.length,
		allComplete: remainingActive.length === 0,
	}
}

export async function applyMatchCommand(
	ctx: GenericCtx,
	args: ApplyMatchCommandInput,
) {
	if (args.commandId.length > MAX_COMMAND_ID_LENGTH) {
		return {
			ok: false,
			matchId: args.matchId,
			code: 'COMMAND_ID_TOO_LONG',
			message: 'command_id_too_long',
			details: {
				maxLength: MAX_COMMAND_ID_LENGTH,
			},
		}
	}
	const payloadLength = jsonLength(args.payload)
	if (payloadLength > MAX_PAYLOAD_JSON_LENGTH) {
		return {
			ok: false,
			matchId: args.matchId,
			code: 'PAYLOAD_TOO_LARGE',
			message: 'payload_too_large',
			details: {
				maxLength: MAX_PAYLOAD_JSON_LENGTH,
				actualLength: payloadLength,
			},
		}
	}
	if (!args.actorUserId && !args.actorVirtualOpponentId) {
		return {
			ok: false,
			matchId: args.matchId,
			code: 'ACTOR_NOT_FOUND',
			message: 'actor_not_found',
		}
	}

	const duplicate = await findDuplicateCommand(ctx, args.matchId, args.commandId)
	if (duplicate) {
		return {
			ok: true,
			matchId: args.matchId,
			revision: duplicate.resultRevision,
			deduped: true,
		}
	}

	const match = await ctx.db.get(args.matchId)
	if (!match) {
		return {
			ok: false,
			matchId: args.matchId,
			code: 'MATCH_NOT_FOUND',
			message: 'match_not_found',
		}
	}

	const state = await getLatestMatchState(ctx, args.matchId)
	if (!state) {
		return {
			ok: false,
			matchId: args.matchId,
			code: 'MATCH_NOT_FOUND',
			message: 'match_state_not_found',
		}
	}

	if (args.revision !== state.revision) {
		return {
			ok: false,
			matchId: args.matchId,
			code: 'STALE_REVISION',
			message: 'stale_revision',
			revision: state.revision,
			publicSnapshot: buildPublicSnapshot(state),
			privateDelta: buildPrivateDelta(state, args.stalePrivateDeltaPlayerId ?? args.actorPlayerId),
		}
	}

	const command: MatchCommand = {
		matchId: args.matchId,
		commandId: args.commandId,
		revision: args.revision,
		type: args.type,
		payload: args.payload,
		actorUserId: args.actorUserId,
		actorVirtualOpponentId: args.actorVirtualOpponentId,
		actorPlayerId: args.actorPlayerId,
	}
	const action = commandToAction(command, args.actorPlayerId)
	const result = reduceMatchState(state, action)

	if (!result.ok) {
		return {
			ok: false,
			matchId: args.matchId,
			code: result.error.code,
			message: result.error.message,
			details: result.error.details,
			revision: state.revision,
		}
	}

	const now = Date.now()
	const expiresAt = commandExpiresAt(match.mode, now)
	await ctx.db.insert(
		'matchCommands',
		toConvexValue({
			matchId: args.matchId,
			commandId: args.commandId,
			actorUserId: args.actorUserId,
			actorVirtualOpponentId: args.actorVirtualOpponentId,
			actorPlayerId: args.actorPlayerId,
			submittedByUserId: args.submittedByUserId,
			source: args.source ?? 'player',
			type: args.type,
			payload: args.payload ?? {},
			resultRevision: result.state.revision,
			createdAt: now,
			expiresAt,
		}),
	)

	for (const emitted of result.events) {
		await ctx.db.insert(
			'matchEvents',
			toConvexValue({
				matchId: args.matchId,
				revision: result.state.revision,
				type: emitted.type,
				actorUserId: args.actorUserId,
				actorVirtualOpponentId: args.actorVirtualOpponentId,
				payload: emitted.payload ?? {},
				createdAt: now,
				expiresAt,
			}),
		)
	}

	await ctx.db.patch(args.matchId, {
		status: result.state.match.status,
		revision: result.state.revision,
		updatedAt: now,
	})
	let participantsCompleted
	if (result.state.match.status === 'complete') {
		participantsCompleted = await markParticipantsComplete(ctx, args.matchId, now)
	}
	await writeStateAndPublicView(ctx, result.state)

	return {
		ok: true,
		matchId: args.matchId,
		revision: result.state.revision,
		events: result.events,
		participantsCompleted,
	}
}

export const submitMatchCommand = mutationGeneric({
	args: {
		matchId: v.id('matches'),
		commandId: v.string(),
		revision: v.number(),
		type: matchCommandTypeValidator,
		payload: v.optional(v.any()),
	},
	returns: v.any(),
	handler: async (ctx: GenericCtx, args: any) => {
		const currentUser = await requireCurrentUser(ctx)

		const match = await ctx.db.get(args.matchId)
		if (!match) {
			return {
				ok: false,
				matchId: args.matchId,
				code: 'MATCH_NOT_FOUND',
				message: 'match_not_found',
			}
		}

		const participant = await getMatchParticipant(ctx, args.matchId, currentUser._id)
		if (!participant || participant.status !== 'active') {
			return {
				ok: false,
				matchId: args.matchId,
				code: 'NOT_A_PARTICIPANT',
				message: 'not_a_participant',
			}
		}

		const actorPlayerId = participant.playerId
		if (!actorPlayerId) {
			return {
				ok: false,
				matchId: args.matchId,
				code: 'NOT_A_PARTICIPANT',
				message: 'actor_player_not_found',
			}
		}

		return await applyMatchCommand(ctx, {
			matchId: args.matchId,
			commandId: args.commandId,
			revision: args.revision,
			type: args.type as MatchCommandType,
			payload: args.payload,
			actorUserId: currentUser._id,
			actorPlayerId,
			source: 'player',
		})
	},
})
