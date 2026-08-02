local cylinder = require("game.model.rules.cylinder")
local ruleset = require("game.ruleset")

local M = {}

local KEY_MAP = {
	actorChoice = "actor_choice",
	activePlayerId = "active_player_id",
	availableActions = "available_actions",
	chamberIndex = "chamber_index",
	challengerId = "challenger_id",
	characterKey = "character_key",
	cylinderSlotsBefore = "cylinder_slots_before",
	currentBid = "current_bid",
	diceCheckDelaySeconds = "dice_check_delay_seconds",
	countdownSeconds = "countdown_seconds",
	eventsHash = "events_hash",
	hpChanges = "hp_changes",
	isFirstShake = "is_first_shake",
	isLocal = "is_local",
	localPlayerId = "local_player_id",
	matchId = "match_id",
	needsChoice = "needs_choice",
	pendingLoad = "pending_load",
	participantKind = "participant_kind",
	playerId = "player_id",
	portraitState = "portrait_state",
	previousBidderId = "previous_bidder_id",
	previousPlayerId = "previous_player_id",
	requiredCount = "required_count",
	reloadPlayerId = "reload_player_id",
	reloadSource = "reload_source",
	rouletteSubjectId = "roulette_subject_id",
	roundIndex = "round_index",
	skullRoulette = "skull_roulette",
	spinSteps = "spin_steps",
	hpBefore = "hp_before",
	hpAfter = "hp_after",
	shooterId = "shooter_id",
	slotIndex = "slot_index",
	suggestedBid = "suggested_bid",
	targetChoice = "target_choice",
	targetId = "target_id",
	turnCount = "turn_count",
	virtualOpponentId = "virtual_opponent_id",
	viewerPlayerId = "viewer_player_id",
	winnerId = "winner_id",
	playerCount = "player_count",
	mmrBefore = "mmr_before",
	mmrAfter = "mmr_after",
	mmrDelta = "mmr_delta",
}

local PHASE_TURN_KIND = {
	bidding = "bidding",
	complete = "complete",
	cup_shake = "shaking",
	dice_check = "shaking",
	bidding_gap = "shaking",
	duel = "dualing",
}

local function clone(value)
	if type(value) ~= "table" then
		return value
	end
	local next = {}
	for key, item in pairs(value) do
		next[key] = clone(item)
	end
	return next
end

local function update_bullets(player)
	player.bullets = cylinder.loaded_count(player.cylinder)
end

local function normalize_keys(value)
	if type(value) ~= "table" then
		return value
	end
	local next = {}
	for key, item in pairs(value) do
		next[KEY_MAP[key] or key] = normalize_keys(item)
	end
	return next
end

local function normalize_server_cylinder(raw)
	if type(raw) ~= "table" or type(raw.slots) ~= "table" then
		return nil
	end
	local slots = {}
	local slot_count = 0
	for index, _ in pairs(raw.slots) do
		local numeric = tonumber(index)
		if numeric and numeric > slot_count then
			slot_count = numeric
		end
	end
	for index, _ in ipairs(raw.slots) do
		slot_count = math.max(slot_count, index)
	end
	if slot_count == 0 then
		return nil
	end
	for index = 1, slot_count do
		local loaded = raw.slots[index]
		if loaded == nil then
			loaded = raw.slots[tostring(index)]
		end
		slots[index] = {
			loaded = type(loaded) == "table" and loaded.loaded == true or loaded == true,
		}
	end
	return {
		chamber_index = raw.chamber_index or raw.chamberIndex or 1,
		slots = slots,
	}
end

local function turn_kind(phase, pending)
	if phase == "revolver_reload" then
		if pending and pending.source == "bid" then
			return "bidding"
		end
		if pending and pending.source == "setup" then
			return "setup"
		end
		return "shaking"
	end
	return PHASE_TURN_KIND[phase] or phase
end

function M.normalize_player(player, local_player_id)
	local next = clone(player)
	next.id = next.id or next.player_id
	next.participant_kind = next.participant_kind or next.participantKind
	next.virtual_opponent_id = next.virtual_opponent_id or next.virtualOpponentId
	next.name = next.name or next.id
	next.hp = next.hp or ruleset.INITIAL_HP
	next.dice_count = next.dice_count or ruleset.DICE_PER_PLAYER
	next.dice = next.dice or {}
	next.character_key = next.character_key or next.skin
	next.skin = next.skin or "default"
	next.portrait_state = next.portrait_state or "front"
	next.eliminated = next.eliminated == true
	next.is_local = next.id == local_player_id
	next.cylinder = next.cylinder or cylinder.new()
	if next.initial_loaded_slots then
		next.cylinder = cylinder.load_many(next.cylinder, next.initial_loaded_slots)
	end
	update_bullets(next)
	return next
end

function M.apply(state, payload)
	payload = payload or {}
	local public = normalize_keys(
		payload.publicSnapshot or payload.public_snapshot or payload.snapshot or payload
	)
	local private = normalize_keys(
		payload.privateDelta
			or payload.private_delta
			or (payload.snapshot and payload.snapshot.private)
			or {}
	)
	local snapshot = normalize_keys(payload.snapshot or {})
	local incoming_revision = tonumber(public.revision or snapshot.revision or payload.revision) or 0
	local current_revision = tonumber(state.match.revision) or 0
	if incoming_revision > 0 and current_revision > 0 and incoming_revision < current_revision then
		return state
	end

	local next = clone(state)
	local match = public.match or snapshot.match or {}
	local turn = public.turn or snapshot.turn or {}
	local bidding_snapshot = public.bidding or snapshot.bidding or {}
	local local_player_id = private.viewer_player_id
		or snapshot.viewer_player_id
		or match.local_player_id
		or next.match.local_player_id

	next.match.match_id = public.match_id or snapshot.match_id or payload.matchId or next.match.match_id
	local previous_match_status = next.match.status
	next.match.status = match.status or next.match.status
	next.match.mode = match.mode or next.match.mode
	next.match.local_player_id = local_player_id
	next.match.turn_count = match.turn_count or next.match.turn_count
	next.match.events_hash = match.events_hash or next.match.events_hash
	next.match.winner_id = match.winner_id
	next.match.result = match.result
	if next.match.status == "complete" and previous_match_status ~= "complete" then
		next.ui.spectating = false
	end
	next.match.revision = public.revision or snapshot.revision or payload.revision or next.match.revision
	next.available_actions = clone(private.available_actions or snapshot.available_actions or {})

	next.flow.phase = public.phase or snapshot.phase or next.flow.phase
	next.flow.dice_check_delay_seconds = public.dice_check_delay_seconds
		or snapshot.dice_check_delay_seconds
		or next.flow.dice_check_delay_seconds
	next.pending_load = normalize_keys(public.pending_load or snapshot.pending_load)
	next.turn.active_player_id = turn.active_player_id or public.active_player_id or snapshot.active_player_id
	next.turn.previous_player_id = turn.previous_player_id
		or public.previous_player_id
		or snapshot.previous_player_id
	next.turn.round_index = turn.round_index or next.turn.round_index
	if turn.is_first_shake ~= nil then
		next.turn.is_first_shake = turn.is_first_shake == true
	end
	next.turn.kind = turn.kind or turn_kind(next.flow.phase, next.pending_load)

	if public.players then
		next.players.order = {}
		for _, player in ipairs(public.players) do
			local player_id = player.id or player.player_id
			if player_id then
				next.players.order[#next.players.order + 1] = player_id
				local existing = next.players.by_id[player_id] or M.normalize_player({
					id = player_id,
					name = player.name,
				}, local_player_id)
				existing.id = player_id
				existing.name = player.name or existing.name
				existing.hp = player.hp or existing.hp
				existing.bullets = player.bullets or existing.bullets
				existing.eliminated = player.eliminated == true
				existing.character_key = player.character_key or existing.character_key
				existing.skin = player.skin or existing.skin
				existing.portrait_state = player.portrait_state or existing.portrait_state
				existing.is_local = player_id == local_player_id
				next.players.by_id[player_id] = existing
			end
		end
	end

	local local_player = local_player_id and next.players.by_id[local_player_id]
	if local_player then
		if private.dice then
			local_player.dice = clone(private.dice)
		end
		local server_cylinder = normalize_server_cylinder(private.cylinder)
		if server_cylinder then
			local_player.cylinder = server_cylinder
			update_bullets(local_player)
		end
	end

	next.bidding.current_bid = normalize_keys(bidding_snapshot.current_bid)
	next.bidding.skull_roulette = normalize_keys(bidding_snapshot.skull_roulette)
	next.bidding.reload_gate = normalize_keys(bidding_snapshot.reload_gate)
	local draft_bid = bidding_snapshot.current_bid or bidding_snapshot.suggested_bid
	if draft_bid then
		next.bidding.my_bid = {
			count = draft_bid.count or next.bidding.my_bid.count,
			face = draft_bid.face or next.bidding.my_bid.face,
		}
		next.bidding.rail.selected_count = next.bidding.my_bid.count
	end
	if public.shake or snapshot.shake then
		next.shake = normalize_keys(public.shake or snapshot.shake)
	end
	next.duel = normalize_keys(public.duel or snapshot.duel)
	return next
end

return M
