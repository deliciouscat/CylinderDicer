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

export type MatchMode = 'dev' | 'casual' | 'ranked'
export type MatchStatus = 'idle' | 'ready' | 'complete'
export type TurnKind = 'setup' | 'shaking' | 'bidding' | 'dualing' | 'complete'
export type PendingLoadSource = 'setup' | 'shake' | 'bid' | 'duel' | 'exact_duel'

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
	skin?: string
	portraitState?: string
}

export interface BidState {
	playerId: string
  count: number
  face: number
}

export interface TurnState {
	kind: TurnKind
	activePlayerId?: string
	previousPlayerId?: string
	roundIndex: number
	isFirstShake: boolean
}

export interface BiddingState {
	currentBid?: BidState
	recentBids: BidState[]
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

export interface DuelJudgeState {
	verdict: 'SHORT' | 'OVER' | 'EXACT'
	actual: number
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
}

export interface MatchState {
	match: MatchMetaState
	matchId: string
	mode: MatchMode
	revision: number
	rngSeed: number
	players: {
		order: string[]
		byId: Record<string, PlayerState>
	}
	turn: TurnState
	bidding: BiddingState
	flow: FlowState
	shake: ShakeState
	duel?: DuelState
	pendingLoad?: PendingLoadState
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
		name: string
		hp?: number
		diceCount?: number
		initialLoadedSlots?: number[]
	}>
}

export const SHAKE_REQUIRED_COUNT = 6
export const DICE_CHECK_DELAY_SECONDS = 3

export function createCylinder(size = 6): CylinderState {
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

	for (const player of input.players) {
		const cylinder = createCylinder(6)
		for (const slotIndex of player.initialLoadedSlots ?? []) {
			if (slotIndex >= 1 && slotIndex <= cylinder.slots.length) {
				cylinder.slots[slotIndex - 1] = true
			}
		}

		const normalized: PlayerState = {
			id: player.id,
			userId: player.userId,
			virtualOpponentId: player.virtualOpponentId,
			participantKind: player.participantKind ?? (player.virtualOpponentId ? 'virtual' : 'human'),
			name: player.name || player.id,
			hp: player.hp ?? 3,
			bullets: cylinder.slots.filter(Boolean).length,
			diceCount: player.diceCount ?? 5,
			dice: [],
			cylinder,
			eliminated: (player.hp ?? 3) <= 0,
			isLocal: player.id === localPlayerId,
			skin: 'default',
			portraitState: 'front',
		}

		order.push(normalized.id)
		playersById[normalized.id] = normalized
	}

	const activePlayerId = input.firstPlayerId ?? localPlayerId ?? order[0]
	const state: MatchState = {
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
		turn: {
			kind: 'setup',
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
		ui: {
			locale: input.locale ?? 'ko',
			hintKey: 'hud.hint.waiting',
			cosmetics: input.cosmetics ?? {},
		},
	}

	if (input.requiresSetupLoad !== false && localPlayerId) {
		const pending = pendingForPlayer(state, localPlayerId, 'setup', 3)
		if (pending) {
			state.pendingLoad = pending
			state.flow.phase = 'revolver_reload'
			state.turn.kind = 'setup'
		} else {
			state.flow.phase = 'cup_shake'
			state.turn.kind = 'shaking'
			resetShake(state)
		}
	} else {
		state.flow.phase = 'cup_shake'
		state.turn.kind = 'shaking'
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
	} else if (state.pendingLoad) {
		state.ui.hintKey = 'hud.hint.load'
	} else if (state.flow.phase === 'dice_check') {
		state.ui.hintKey = 'hud.hint.dice_check'
	} else if (state.flow.phase === 'bidding_gap') {
		state.ui.hintKey = 'hud.hint.bidding_soon'
	} else if (state.turn.kind === 'bidding') {
		state.ui.hintKey = 'hud.hint.bidding'
	} else if (state.turn.kind === 'shaking') {
		state.ui.hintKey = 'hud.hint.shaking'
	} else if (state.turn.kind === 'dualing') {
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
