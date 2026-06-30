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
import type { MatchCommand, MatchCommandType } from './protocol/commands'
import { getLatestMatchState, getMatchParticipant, writeStateAndPublicView } from './matches'
import { requireCurrentUser, type GenericCtx } from './users'

function toConvexValue<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T
}

const commandTypeValidator = v.union(
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
	for (const participant of participants) {
		await ctx.db.patch(participant._id, {
			status: 'complete',
			updatedAt: now,
		})
	}
}

export const submitMatchCommand = mutationGeneric({
	args: {
		matchId: v.id('matches'),
		commandId: v.string(),
		revision: v.number(),
		type: commandTypeValidator,
		payload: v.optional(v.any()),
	},
	returns: v.any(),
	handler: async (ctx: GenericCtx, args: any) => {
		const currentUser = await requireCurrentUser(ctx)
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

		const participant = await getMatchParticipant(ctx, args.matchId, currentUser._id)
		if (!participant || participant.status !== 'active') {
			return {
				ok: false,
				matchId: args.matchId,
				code: 'NOT_A_PARTICIPANT',
				message: 'not_a_participant',
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
			}
		}

		const actorPlayerId = participant.playerId
		if (!actorPlayerId) {
			return {
				ok: false,
				matchId: args.matchId,
				code: 'NOT_A_PARTICIPANT',
				message: 'actor_player_not_found',
				revision: state.revision,
			}
		}

		const command: MatchCommand = {
			matchId: args.matchId,
			commandId: args.commandId,
			revision: args.revision,
			type: args.type as MatchCommandType,
			payload: args.payload,
			actorUserId: currentUser._id,
			actorPlayerId,
		}
		const action = commandToAction(command, actorPlayerId)
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
		await ctx.db.insert(
			'matchCommands',
			toConvexValue({
				matchId: args.matchId,
				commandId: args.commandId,
				actorUserId: currentUser._id,
				actorPlayerId,
				type: args.type,
				payload: args.payload ?? {},
				resultRevision: result.state.revision,
				createdAt: now,
			}),
		)

		for (const emitted of result.events) {
			await ctx.db.insert(
				'matchEvents',
				toConvexValue({
					matchId: args.matchId,
					revision: result.state.revision,
					type: emitted.type,
					actorUserId: currentUser._id,
					payload: emitted.payload ?? {},
					createdAt: now,
				}),
			)
		}

		await ctx.db.patch(args.matchId, {
			status: result.state.match.status,
			revision: result.state.revision,
			updatedAt: now,
		})
		if (result.state.match.status === 'complete') {
			await markParticipantsComplete(ctx, args.matchId, now)
		}
		await writeStateAndPublicView(ctx, result.state)

		return {
			ok: true,
			matchId: args.matchId,
			revision: result.state.revision,
			events: result.events,
		}
	},
})
