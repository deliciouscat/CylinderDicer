local actions = require "game.model.actions"
local turn_machine = require "game.model.turn_machine"
local bidding = require "game.model.rules.bidding"
local cylinder = require "game.model.rules.cylinder"
local dice = require "game.model.rules.dice"
local duel = require "game.model.rules.duel"

local M = {}

local DEFAULT_STATE = {
	match = {
		session_id = nil,
		match_id = nil,
		mode = "casual",
		local_player_id = nil,
		status = "idle",
		turn_count = 0,
		events_hash = "0",
		winner_id = nil,
	},
	players = {
		order = {},
		by_id = {},
	},
	turn = {
		kind = "setup",
		active_player_id = nil,
		previous_player_id = nil,
		round_index = 0,
		is_first_shake = true,
	},
	bidding = {
		current_bid = nil,
		recent_bids = {},
		my_bid = {
			count = 1,
			face = 2,
		},
		rail = {
			selected_count = 1,
			window_start = 1,
			window_size = 10,
		},
	},
	duel = nil,
	pending_load = nil,
	ui = {
		locale = "ko",
		hint_key = "hud.hint.waiting",
		cosmetics = {},
	},
}

local function is_array(t)
	if type(t) ~= "table" then
		return false
	end

	local max = 0
	local count = 0
	for key, _ in pairs(t) do
		if type(key) ~= "number" then
			return false
		end
		if key > max then
			max = key
		end
		count = count + 1
	end

	return max == count
end

local function clone(value)
	if type(value) ~= "table" then
		return value
	end

	local next = {}
	for key, item in pairs(value) do
		if type(item) ~= "function" then
			next[key] = clone(item)
		end
	end
	return next
end

local function stable_serialize(value)
	local value_type = type(value)
	if value_type == "nil" then
		return "nil"
	end
	if value_type ~= "table" then
		return tostring(value)
	end

	if is_array(value) then
		local parts = {}
		for i, item in ipairs(value) do
			parts[i] = stable_serialize(item)
		end
		return "[" .. table.concat(parts, ",") .. "]"
	end

	local keys = {}
	for key, item in pairs(value) do
		if type(item) ~= "function" then
			keys[#keys + 1] = key
		end
	end
	table.sort(keys, function(a, b)
		return tostring(a) < tostring(b)
	end)

	local parts = {}
	for _, key in ipairs(keys) do
		parts[#parts + 1] = tostring(key) .. "=" .. stable_serialize(value[key])
	end
	return "{" .. table.concat(parts, ",") .. "}"
end

local function append_event_hash(state, action)
	local text = (state.match.events_hash or "0") .. "|" .. action.type .. "|" .. stable_serialize(action.payload)
	local hash = 5381
	for i = 1, #text do
		hash = ((hash * 33) + string.byte(text, i)) % 2147483647
	end
	state.match.events_hash = tostring(hash)
end

local function publish_all()
	return { "match", "players", "turn", "bidding", "duel", "ui" }
end

local function update_bullets(player)
	if player and player.cylinder then
		player.bullets = cylinder.loaded_count(player.cylinder)
	end
end

local function update_all_bullets(players)
	for _, player in pairs(players.by_id or {}) do
		update_bullets(player)
	end
end

local function normalize_player(player, local_player_id)
	local next = clone(player)
	next.id = next.id or next.player_id
	next.name = next.name or next.id
	next.hp = next.hp or 3
	next.dice_count = next.dice_count or 5
	next.dice = next.dice or {}
	next.skin = next.skin or "default"
	next.portrait_state = next.portrait_state or "front"
	next.eliminated = next.eliminated == true
	next.is_local = next.id == local_player_id
	next.cylinder = next.cylinder or cylinder.new(6)

	if next.initial_loaded_slots then
		next.cylinder = cylinder.load_many(next.cylinder, next.initial_loaded_slots)
	end

	update_bullets(next)
	return next
end

local function alive_count(players)
	local count = 0
	local last
	for _, player_id in ipairs(players.order or {}) do
		local player = players.by_id[player_id]
		if player and not player.eliminated and (player.hp or 0) > 0 then
			count = count + 1
			last = player_id
		end
	end
	return count, last
end

local function reset_my_bid(next)
	next.bidding.my_bid = {
		count = 1,
		face = 2,
	}
	next.bidding.rail.selected_count = 1
	next.bidding.rail.window_start = 1
end

local function set_hint(next)
	if next.match.status == "complete" then
		next.ui.hint_key = "hud.hint.complete"
	elseif next.pending_load then
		next.ui.hint_key = "hud.hint.load"
	elseif next.turn.kind == "bidding" then
		next.ui.hint_key = "hud.hint.bidding"
	elseif next.turn.kind == "shaking" then
		next.ui.hint_key = "hud.hint.shaking"
	elseif next.turn.kind == "dualing" then
		next.ui.hint_key = "hud.hint.duel"
	else
		next.ui.hint_key = "hud.hint.waiting"
	end
end

local function apply_transition(next, transition)
	if not transition.ok then
		return transition.reason
	end

	next.turn = transition.turn

	if transition.effects and transition.effects.pending_load then
		next.pending_load = clone(transition.effects.pending_load)
	end

	return nil
end

local function complete_setup_if_ready(next)
	if next.pending_load then
		return nil
	end

	local transition = turn_machine.next(next.turn, "setup_complete", next)
	local err = apply_transition(next, transition)
	if err then
		return err
	end

	next.turn.kind = "shaking"
	next.ui.hint_key = "hud.hint.shaking"
	return nil
end

local function complete_shake_load_if_ready(next)
	if next.pending_load then
		return nil
	end

	local transition = turn_machine.next(next.turn, "load_complete", next)
	local err = apply_transition(next, transition)
	if err then
		return err
	end

	next.turn.kind = "bidding"
	set_hint(next)
	return nil
end

local handlers = {}

handlers[actions.types.MATCH_INIT] = function(state, action)
	local payload = action.payload or {}
	local next = clone(DEFAULT_STATE)
	local local_player_id = payload.local_player_id or payload.playerId or payload.player_id

	next.match.session_id = payload.session_id or payload.sessionId
	next.match.match_id = payload.match_id or payload.matchId
	next.match.mode = payload.mode or "casual"
	next.match.local_player_id = local_player_id
	next.match.status = "ready"
	next.ui.locale = payload.locale or "ko"
	next.ui.cosmetics = clone(payload.cosmetics or {})

	for _, player in ipairs(payload.players or {}) do
		local normalized = normalize_player(player, local_player_id)
		next.players.order[#next.players.order + 1] = normalized.id
		next.players.by_id[normalized.id] = normalized
	end

	if #next.players.order == 0 and local_player_id then
		local local_player = normalize_player({
			id = local_player_id,
			name = "Player",
		}, local_player_id)
		next.players.order[1] = local_player.id
		next.players.by_id[local_player.id] = local_player
	end

	next.turn.active_player_id = payload.first_player_id or payload.firstPlayerId or local_player_id or next.players.order[1]
	next.pending_load = payload.pending_load
	if next.pending_load == nil and payload.requires_setup_load ~= false then
		next.pending_load = {
			player_id = local_player_id,
			source = "setup",
			count = 3,
		}
	end

	set_hint(next)
	append_event_hash(next, action)
	return next, publish_all()
end

handlers[actions.types.COSMETICS_APPLY] = function(state, action)
	local next = clone(state)
	next.ui.cosmetics = clone(action.payload.cosmetics or {})
	append_event_hash(next, action)
	return next, { "ui" }
end

handlers[actions.types.SETUP_LOAD_INITIAL] = function(state, action)
	if state.turn.kind ~= "setup" then
		return state, nil, "not_setup_turn"
	end

	local next = clone(state)
	local pending = next.pending_load
	local player_id = action.payload.player_id or (pending and pending.player_id)

	if not pending or pending.source ~= "setup" then
		return state, nil, "no_setup_load_pending"
	end
	if pending.player_id ~= player_id then
		return state, nil, "wrong_pending_player"
	end

	local player = next.players.by_id[player_id]
	if not player then
		return state, nil, "unknown_player"
	end

	local loaded, ok, err = cylinder.load(player.cylinder, action.payload.slot_index)
	if not ok then
		return state, nil, err
	end

	player.cylinder = loaded
	update_bullets(player)
	next.pending_load = cylinder.consume_pending(pending)

	local transition_err = complete_setup_if_ready(next)
	if transition_err then
		return state, nil, transition_err
	end

	set_hint(next)
	append_event_hash(next, action)
	return next, { "players", "turn", "ui" }
end

handlers[actions.types.SHAKE_ROLL] = function(state, action)
	if state.turn.kind ~= "shaking" then
		return state, nil, "not_shaking_turn"
	end

	local next = clone(state)
	for _, player_id in ipairs(next.players.order or {}) do
		local player = next.players.by_id[player_id]
		if player and not player.eliminated then
			player.dice = dice.roll(player.dice_count or 5, action.payload.rng)
		end
	end

	if next.turn.is_first_shake then
		next.turn.kind = "bidding"
		next.turn.previous_player_id = next.turn.active_player_id
		next.turn.is_first_shake = false
	else
		next.pending_load = {
			player_id = next.turn.active_player_id,
			source = "shake",
			count = 1,
		}
	end

	set_hint(next)
	append_event_hash(next, action)
	return next, { "players", "turn", "ui" }
end

handlers[actions.types.BULLET_LOAD] = function(state, action)
	local pending = state.pending_load
	if not pending then
		return state, nil, "no_load_pending"
	end

	local next = clone(state)
	local player_id = action.payload.player_id or pending.player_id
	if player_id ~= pending.player_id then
		return state, nil, "wrong_pending_player"
	end

	local player = next.players.by_id[player_id]
	if not player then
		return state, nil, "unknown_player"
	end

	local loaded, ok, err = cylinder.load(player.cylinder, action.payload.slot_index)
	if not ok then
		return state, nil, err
	end

	player.cylinder = loaded
	update_bullets(player)
	next.pending_load = cylinder.consume_pending(next.pending_load)

	if pending.source == "setup" then
		local transition_err = complete_setup_if_ready(next)
		if transition_err then
			return state, nil, transition_err
		end
	elseif pending.source == "shake" then
		local transition_err = complete_shake_load_if_ready(next)
		if transition_err then
			return state, nil, transition_err
		end
	end

	set_hint(next)
	append_event_hash(next, action)
	return next, { "players", "turn", "ui" }
end

handlers[actions.types.BID_SELECT_COUNT] = function(state, action)
	local next = clone(state)
	local count = bidding.clamp_count(action.payload.count or next.bidding.my_bid.count)
	local rail = next.bidding.rail
	local half = math.floor((rail.window_size or 10) / 2)

	next.bidding.my_bid.count = count
	rail.selected_count = count
	rail.window_start = bidding.clamp_count(count - half, {
		min_count = 1,
		max_count = math.max(1, bidding.DEFAULT_LIMITS.max_count - rail.window_size + 1),
		min_face = 1,
		max_face = 6,
	})

	return next, { "bidding" }
end

handlers[actions.types.BID_SELECT_FACE] = function(state, action)
	local next = clone(state)
	next.bidding.my_bid.face = bidding.clamp_face(action.payload.face or next.bidding.my_bid.face)
	return next, { "bidding" }
end

handlers[actions.types.BID_RAISE] = function(state, action)
	if state.turn.kind ~= "bidding" then
		return state, nil, "not_bidding_turn"
	end

	local bid = clone(action.payload.bid or state.bidding.my_bid)
	bid.player_id = bid.player_id or state.turn.active_player_id

	if bid.player_id ~= state.turn.active_player_id then
		return state, nil, "wrong_bid_player"
	end

	local check = bidding.validate(state.bidding.current_bid, bid, bidding.DEFAULT_LIMITS)
	if not check.ok then
		return state, nil, check.reason
	end

	local next = clone(state)
	next.bidding.current_bid = bid
	next.bidding.my_bid = {
		count = bid.count,
		face = bid.face,
	}
	next.bidding.recent_bids[#next.bidding.recent_bids + 1] = bid
	next.match.turn_count = next.match.turn_count + 1

	local transition = turn_machine.next(next.turn, "bid_raised", next)
	local err = apply_transition(next, transition)
	if err then
		return state, nil, err
	end

	set_hint(next)
	append_event_hash(next, action)
	return next, { "match", "bidding", "turn", "ui" }
end

handlers[actions.types.BID_CHALLENGE] = function(state, action)
	if state.turn.kind ~= "bidding" then
		return state, nil, "not_bidding_turn"
	end
	if not state.bidding.current_bid then
		return state, nil, "no_previous_bid"
	end

	local next = clone(state)
	local previous_id = next.bidding.current_bid.player_id
	local challenger_id = next.turn.active_player_id

	next.turn.kind = "dualing"
	next.turn.previous_player_id = previous_id
	next.turn.active_player_id = challenger_id
	next.pending_load = nil
	next.duel = duel.begin(next, challenger_id, previous_id)
	next.match.turn_count = next.match.turn_count + 1

	set_hint(next)
	append_event_hash(next, action)
	return next, { "match", "turn", "duel", "ui" }
end

handlers[actions.types.DUEL_RESOLVE_CHOICE] = function(state, action)
	local next = clone(state)
	if next.duel then
		next.duel.choice = clone(action.payload.choice or {})
	end
	append_event_hash(next, action)
	return next, { "duel" }
end

handlers[actions.types.ROUND_ADVANCE] = function(state, action)
	if state.turn.kind ~= "dualing" or not state.duel then
		return state, nil, "not_dueling_turn"
	end

	local next = clone(state)
	next.players = duel.apply_resolution(next.players, next.duel)
	update_all_bullets(next.players)

	local count, winner_id = alive_count(next.players)
	next.duel.phase = "complete"

	if count <= 1 then
		next.match.status = "complete"
		next.match.winner_id = winner_id
		next.turn.kind = "complete"
		next.pending_load = nil
		set_hint(next)
		append_event_hash(next, action)
		return next, publish_all()
	end

	local previous_active = next.turn.active_player_id
	next.turn.kind = "shaking"
	next.turn.previous_player_id = previous_active
	next.turn.active_player_id = turn_machine.next_alive_after(next.players, previous_active)
	next.turn.round_index = (next.turn.round_index or 0) + 1
	next.turn.is_first_shake = false
	next.bidding.current_bid = nil
	next.bidding.recent_bids = {}
	next.duel = nil
	next.pending_load = nil
	reset_my_bid(next)

	set_hint(next)
	append_event_hash(next, action)
	return next, publish_all()
end

handlers[actions.types.MATCH_COMPLETE] = function(state, action)
	local next = clone(state)
	next.match.status = "complete"
	next.match.winner_id = action.payload.winner_id
	next.turn.kind = "complete"
	set_hint(next)
	append_event_hash(next, action)
	return next, { "match", "turn", "ui" }
end

function M.reduce(state, action)
	local handler = handlers[action.type]
	if not handler then
		return {
			state = state,
			changed_topics = {},
		}
	end

	local next, topics, err = handler(state, action)
	if err then
		return {
			state = state,
			changed_topics = {},
			error = err,
		}
	end

	return {
		state = next or state,
		changed_topics = topics or {},
	}
end

function M.initial_state()
	return clone(DEFAULT_STATE)
end

function M.clone(value)
	return clone(value)
end

return M
