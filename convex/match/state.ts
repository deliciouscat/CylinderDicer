/**
 * # 개요
 * Convex 서버가 소유하는 authoritative match state 타입과 초기 상태 builder를 정의한다.
 * 이 state는 클라이언트 표시용 snapshot이 아니라 reducer가 판정에 사용하는 원본 모델이다.
 *
 * # 의존성
 * - `convex/protocol/snapshots.ts`: 외부로 노출할 phase/view 타입과 맞춘다.
 * - `convex/match/turnMachine.ts`: active/previous player 전이.
 * - `convex/match/rules*.ts`: bid, dice, cylinder, duel 규칙.
 *
 * # I/O
 * - 입력:
 *   - match id.
 *   - 참가 player descriptors.
 *   - mode/dev seed options.
 * - 출력:
 *   - `MatchState`.
 *   - default player/cylinder/dice state.
 *
 * # 의사코드
 * ```text
 * receive match participants
 * create ordered players map
 * initialize hp, bullets, cylinder, dice, eliminated flags
 * set initial phase to revolver_reload or cup_shake
 * set active player according to first seat policy
 * return authoritative state
 * ```
 */
import type { MatchPhase } from '../protocol/snapshots'
import { GAME_RULESET } from '../../shared/game/ruleset'
import {
	CHARACTER_KEYS,
	isCharacterKey,
	legacySeatCharacterKey,
} from '../../shared/game/characters'

export type MatchMode = 'dev' | 'casual' | 'ranked'
export type MatchStatus = 'idle' | 'ready' | 'complete'
export type ParticipantControlMode = 'human' | 'qa_manual' | 'server_bot'
export type TurnKind = 'setup' | 'shaking' | 'bidding' | 'dualing' | 'complete'
export type PendingLoadSource = 'setup' | 'shake' | 'bid' | 'duel' | 'exact_duel'

export const CURRENT_MATCH_STATE_VERSION = 2

export interface CylinderState {
	chamberIndex: number
	slots: boolean[]
}

export interface PlayerState {
	id: string
	userId?: string
	virtualOpponentId?: string
	participantKind?: 'human' | 'virtual'
	name: string
	hp: number
	bullets: number
	diceCount: number
	dice: number[]
	cylinder: CylinderState
	eliminated: boolean
	isLocal?: boolean
	characterKey?: string
	skin?: string
	portraitState?: string
}

export interface BidState {
	playerId: string
  count: number
  face: number
}

export interface TurnState {
	activePlayerId?: string
	previousPlayerId?: string
	roundIndex: number
	isFirstShake: boolean
}

export interface BiddingState {
	currentBid?: BidState
	recentBids: BidState[]
	skullRoulette?: SkullRouletteState
	myBid: {
		count: number
		face: number
	}
	rail: {
		selectedCount: number
		windowStart: number
		windowSize: number
	}
}

export interface SkullRouletteState {
	playerId: string
	spinSteps: number
	hit: boolean
	slotIndex: number
	consumed: boolean
	hpBefore: number
	hpAfter: number
	sequence: number
}

export interface FlowState {
	phase: MatchPhase | 'waiting'
	diceCheckDelaySeconds: number
	epoch: number
}

export interface ShakeState {
	requiredCount: number
	counts: Record<string, number>
	checked: Record<string, boolean>
	reloadPlayerId?: string
	reloadSource?: PendingLoadSource
}

export interface PendingLoadState {
	playerId: string
	count: number
	source: PendingLoadSource
}

export interface ReloadGateState {
	countdownSeconds: number
	epoch: number
}

/**
 * Orthogonal reload lane. `pending` is intentionally independent from
 * `turn.activePlayerId`: during bidding the previous bidder may reload while
 * the next bidder still owns the decision turn.
 */
export interface ReloadState {
	pending?: PendingLoadState
	deferred?: PendingLoadState
	gate?: ReloadGateState
}

export interface DuelJudgeState {
	verdict: 'SHORT' | 'OVER' | 'EXACT'
	actual: number
	requiredCount: number
	delta: number
	rawDelta: number
}

export interface DuelStepState {
	kind: 'roulette' | 'perfect_duel'
	targetId: string
	rouletteSubjectId?: string
	actorId?: string
	shooterId?: string
	actorChoice?: 'trigger'
	targetChoice?: 'take_hit'
	hit: boolean
	slotIndex: number
	consumed: boolean
	needsChoice?: boolean
}

export interface DuelResolutionState {
	kind: 'duel_shots' | 'perfect_duel'
	verdict?: 'SHORT' | 'OVER' | 'EXACT'
	challengerId?: string
	previousBidderId?: string
	targetId?: string
	rouletteSubjectId?: string
	actorId?: string
	shooterId?: string
	targets?: string[]
	cylinderSlotsBefore: boolean[]
	steps: DuelStepState[]
	hpChanges: Record<string, number>
	reloadPlayerId?: string
}

export interface DuelState {
	phase: 'ready' | 'executing' | 'complete'
	bid: BidState
	challengerId: string
	previousBidderId: string
	players: Array<Omit<PlayerState, 'cylinder'>>
	judge: DuelJudgeState
	revolverSpin?: {
		playerId: string
		steps: number
	}
	choice?: unknown
	resolution?: DuelResolutionState
}

export interface MatchMetaState {
	sessionId?: string
	matchId: string
	mode: MatchMode
	localPlayerId?: string
	status: MatchStatus
	turnCount: number
	eventsHash: string
	winnerId?: string
	result?: MatchResultState
}

export interface MatchResultEntry {
	playerId: string
	place: number
	playerCount: number
	rated: boolean
	mmrBefore?: number
	mmrAfter?: number
	mmrDelta?: number
}

export interface MatchResultState {
	playerCount: number
	placements: MatchResultEntry[]
	rated: boolean
}

export interface MatchState {
	stateVersion: number
	match: MatchMetaState
	matchId: string
	mode: MatchMode
	revision: number
	rngSeed: number
	players: {
		order: string[]
		byId: Record<string, PlayerState>
	}
	eliminationOrder: string[]
	turn: TurnState
	bidding: BiddingState
	flow: FlowState
	shake: ShakeState
	duel?: DuelState
	reload: ReloadState
	ui: {
		locale: string
		hintKey: string
		cosmetics: Record<string, unknown>
	}
}

export interface CreateInitialStateInput {
	matchId: string
	mode: MatchMode
	sessionId?: string
	localPlayerId?: string
	firstPlayerId?: string
	locale?: string
	cosmetics?: Record<string, unknown>
	requiresSetupLoad?: boolean
	rngSeed?: number
	players: Array<{
		id: string
		userId?: string
		virtualOpponentId?: string
		participantKind?: 'human' | 'virtual'
		controlMode?: ParticipantControlMode
		botProfileId?: string
		botStrategyKey?: string
		botStrategyVersion?: string
		botParameters?: Record<string, unknown>
		name: string
		characterKey?: string
		skin?: string
		portraitState?: string
		hp?: number
		diceCount?: number
		initialLoadedSlots?: number[]
		startingMmr?: number
	}>
}

export const DEFAULT_PLAYER_SKINS = CHARACTER_KEYS

export const SHAKE_REQUIRED_COUNT = GAME_RULESET.shake.requiredActions
export const DICE_CHECK_DELAY_SECONDS = 3
export const BID_RELOAD_COUNTDOWN_SECONDS = 3

export function createCylinder(size = GAME_RULESET.cylinder.slots): CylinderState {
	return {
		chamberIndex: 1,
		slots: Array.from({ length: size }, () => false),
	}
}

export function cloneState<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T
}

export function createInitialMatchState(input: CreateInitialStateInput): MatchState {
	const localPlayerId = input.localPlayerId ?? input.players[0]?.id
	const playersById: Record<string, PlayerState> = {}
	const order: string[] = []

	for (const [playerIndex, player] of input.players.entries()) {
		const cylinder = createCylinder()
		for (const slotIndex of player.initialLoadedSlots ?? []) {
			if (slotIndex >= 1 && slotIndex <= cylinder.slots.length) {
				cylinder.slots[slotIndex - 1] = true
			}
		}

		const fallbackCharacterKey = legacySeatCharacterKey(playerIndex)
		const characterKey = player.characterKey
			?? (isCharacterKey(player.skin) ? player.skin : fallbackCharacterKey)
		const normalized: PlayerState = {
			id: player.id,
			userId: player.userId,
			virtualOpponentId: player.virtualOpponentId,
			participantKind: player.participantKind ?? (player.virtualOpponentId ? 'virtual' : 'human'),
			name: player.name || player.id,
			hp: player.hp ?? GAME_RULESET.cylinder.initialHp,
			bullets: cylinder.slots.filter(Boolean).length,
			diceCount: player.diceCount ?? GAME_RULESET.dice.perPlayer,
			dice: [],
			cylinder,
			eliminated: (player.hp ?? 6) <= 0,
			isLocal: player.id === localPlayerId,
			characterKey,
			skin: player.skin ?? characterKey,
			portraitState: player.portraitState ?? 'front',
		}

		order.push(normalized.id)
		playersById[normalized.id] = normalized
	}

	const activePlayerId = input.firstPlayerId ?? localPlayerId ?? order[0]
	const state: MatchState = {
		stateVersion: CURRENT_MATCH_STATE_VERSION,
		match: {
			sessionId: input.sessionId,
			matchId: input.matchId,
			mode: input.mode,
			localPlayerId,
			status: 'ready',
			turnCount: 0,
			eventsHash: '0',
		},
		matchId: input.matchId,
		mode: input.mode,
		revision: 0,
		rngSeed: input.rngSeed ?? 12345,
		players: {
			order,
			byId: playersById,
		},
		eliminationOrder: [],
		turn: {
			activePlayerId,
			roundIndex: 0,
			isFirstShake: true,
		},
		bidding: {
			recentBids: [],
			myBid: {
				count: 1,
				face: 2,
			},
			rail: {
				selectedCount: 1,
				windowStart: 1,
				windowSize: 10,
			},
		},
			flow: {
				phase: 'waiting',
				diceCheckDelaySeconds: DICE_CHECK_DELAY_SECONDS,
				epoch: 0,
			},
		shake: {
			requiredCount: SHAKE_REQUIRED_COUNT,
			counts: {},
			checked: {},
		},
		reload: {},
		ui: {
			locale: input.locale ?? 'ko',
			hintKey: 'hud.hint.waiting',
			cosmetics: input.cosmetics ?? {},
		},
	}

	if (input.requiresSetupLoad !== false) {
		const pending = nextSetupPending(state)
		if (pending) {
			state.reload.pending = pending
			state.flow.phase = 'revolver_reload'
		} else {
			state.flow.phase = 'cup_shake'
			resetShake(state)
		}
	} else {
		state.flow.phase = 'cup_shake'
		resetShake(state)
	}

	setHint(state)
	state.flow.epoch = 1
	return state
}

export function isAlive(player: PlayerState | undefined): boolean {
	return Boolean(player && !player.eliminated && player.hp > 0)
}

export function loadedCount(cylinder: CylinderState): number {
	return cylinder.slots.filter(Boolean).length
}

export function updateBullets(player: PlayerState): void {
	player.bullets = loadedCount(player.cylinder)
}

export function updateAllBullets(state: MatchState): void {
	for (const player of Object.values(state.players.byId)) {
		updateBullets(player)
	}
}

export function emptySlotCount(player: PlayerState | undefined): number {
	if (!player) {
		return 0
	}
	return Math.max(0, player.cylinder.slots.length - loadedCount(player.cylinder))
}

export function pendingForPlayer(
	state: MatchState,
	playerId: string,
	source: PendingLoadSource,
	count: number,
): PendingLoadState | undefined {
	const player = state.players.byId[playerId]
	const loadCount = Math.min(count, emptySlotCount(player))
	if (!player || loadCount <= 0) {
		return undefined
	}

	return {
		playerId,
		source,
		count: loadCount,
	}
}

export function nextSetupPending(
	state: MatchState,
	afterPlayerId?: string,
): PendingLoadState | undefined {
	const order = state.players.order
	const startIndex = afterPlayerId ? order.indexOf(afterPlayerId) + 1 : 0
	const targetCount = GAME_RULESET.cylinder.initialLoadedSlots.length

	for (let offset = 0; offset < order.length; offset += 1) {
		const playerId = order[(startIndex + offset) % order.length]
		const player = state.players.byId[playerId]
		if (!player || player.participantKind === 'virtual' || player.virtualOpponentId) {
			continue
		}

		const remainingCount = Math.max(0, targetCount - loadedCount(player.cylinder))
		const pending = pendingForPlayer(state, playerId, 'setup', remainingCount)
		if (pending) {
			return pending
		}
	}

	return undefined
}

export function resetShake(
	state: MatchState,
	options: {
		reloadPlayerId?: string
		reloadSource?: PendingLoadSource
	} = {},
): void {
	state.shake = {
		requiredCount: SHAKE_REQUIRED_COUNT,
		counts: {},
		checked: {},
		reloadPlayerId: options.reloadPlayerId,
		reloadSource: options.reloadSource,
	}
}

export function resetMyBid(state: MatchState): void {
	state.bidding.myBid = {
		count: 1,
		face: 2,
	}
	state.bidding.rail.selectedCount = 1
	state.bidding.rail.windowStart = 1
}

export function setHint(state: MatchState): void {
	if (state.match.status === 'complete') {
		state.ui.hintKey = 'hud.hint.complete'
	} else if (state.reload.pending) {
		state.ui.hintKey = 'hud.hint.load'
	} else if (state.flow.phase === 'dice_check') {
		state.ui.hintKey = 'hud.hint.dice_check'
	} else if (state.flow.phase === 'bidding_gap') {
		state.ui.hintKey = 'hud.hint.bidding_soon'
	} else if (state.flow.phase === 'bidding') {
		state.ui.hintKey = 'hud.hint.bidding'
	} else if (state.flow.phase === 'cup_shake') {
		state.ui.hintKey = 'hud.hint.shaking'
	} else if (state.flow.phase === 'duel') {
		state.ui.hintKey = 'hud.hint.duel'
	} else {
		state.ui.hintKey = 'hud.hint.waiting'
	}
}

export function aliveCount(state: MatchState): { count: number; lastPlayerId?: string } {
	let count = 0
	let lastPlayerId: string | undefined
	for (const playerId of state.players.order) {
		const player = state.players.byId[playerId]
		if (isAlive(player)) {
			count += 1
			lastPlayerId = playerId
		}
	}
	return { count, lastPlayerId }
}
