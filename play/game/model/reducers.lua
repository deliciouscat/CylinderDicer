local actions = require("game.model.actions")
local turn_machine = require("game.model.turn_machine")
local bidding = require("game.model.rules.bidding")
local cylinder = require("game.model.rules.cylinder")
local dice = require("game.model.rules.dice")
local duel = require("game.model.rules.duel")
local ruleset = require("game.ruleset")
local server_snapshot = require("game.model.server_snapshot")

local M = {}

local SHAKE_REQUIRED_COUNT = ruleset.SHAKE_REQUIRED_ACTIONS
local DICE_CHECK_DELAY_SECONDS = 3
local BID_RELOAD_COUNTDOWN_SECONDS = 3

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
		result = nil,
		local_simulator = false,
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
		deferred_load = nil,
		reload_gate = nil,
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
	flow = {
		phase = "waiting",
		dice_check_delay_seconds = DICE_CHECK_DELAY_SECONDS,
	},
	shake = {
		required_count = SHAKE_REQUIRED_COUNT,
		counts = {},
		checked = {},
	},
	duel = nil,
	pending_load = nil,
	available_actions = {},
	ui = {
		locale = "ko",
		hint_key = "hud.hint.waiting",
		cosmetics = {},
		spectating = false,
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
	return { "match", "players", "turn", "bidding", "duel", "flow", "shake", "capabilities", "ui" }
end

local set_hint

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

local function empty_slot_count(player)
	if not player or not player.cylinder or not player.cylinder.slots then
		return 0
	end

	return math.max(0, #player.cylinder.slots - cylinder.loaded_count(player.cylinder))
end

local function pending_for_player(state, player_id, source, count)
	local player = state.players.by_id[player_id]
	if not player then
		return nil
	end

	local load_count = math.min(count or 0, empty_slot_count(player))
	if load_count <= 0 then
		return nil
	end

	return {
		player_id = player_id,
		source = source,
		count = load_count,
	}
end

local function enter_phase(next, phase, turn_kind)
	turn_machine.enter_phase(next, phase, {
		dice_check_delay_seconds = DICE_CHECK_DELAY_SECONDS,
		turn_kind = turn_kind,
	})
end

local function transition_phase(next, event, turn_kind)
	local transition = turn_machine.transition_phase(next, event, {
		dice_check_delay_seconds = DICE_CHECK_DELAY_SECONDS,
		turn_kind = turn_kind,
	})
	return transition.ok, transition.reason
end

local function reset_shake(next, options)
	options = options or {}
	next.shake = {
		required_count = SHAKE_REQUIRED_COUNT,
		counts = {},
		checked = {},
		reload_player_id = options.reload_player_id,
		reload_source = options.reload_source,
	}
end

local function is_alive(player)
	return player and not player.eliminated and (player.hp or 0) > 0
end

local function roll_player_dice(next, player_id, rng)
	local player = next.players.by_id[player_id]
	if is_alive(player) then
		player.dice = dice.roll(player.dice_count or 5, rng)
	end
end

local function enter_revolver_reload(next, pending, event)
	next.pending_load = pending
	local turn_kind
	if pending and pending.source == "bid" then
		turn_kind = "bidding"
	elseif pending and (pending.source == "shake" or pending.source == "duel" or pending.source == "exact_duel") then
		turn_kind = "shaking"
	end
	if event then
		return transition_phase(next, event, turn_kind)
	end
	enter_phase(next, "revolver_reload", turn_kind)
	return true
end

local function enter_cup_shake(next, event, shake_options)
	next.pending_load = nil
	if event then
		local ok, err = transition_phase(next, event)
		if not ok then
			return ok, err
		end
	else
		enter_phase(next, "cup_shake")
	end
	reset_shake(next, shake_options)
	return true
end

local function enter_dice_check(next, event)
	next.pending_load = nil
	if event then
		local ok, err = transition_phase(next, event)
		if not ok then
			return ok, err
		end
	else
		enter_phase(next, "dice_check")
	end
	next.shake.checked = {}
	return true
end

local function all_alive_shaken(next)
	local required = next.shake.required_count or SHAKE_REQUIRED_COUNT
	for _, player_id in ipairs(next.players.order or {}) do
		local player = next.players.by_id[player_id]
		local count = (next.shake.counts or {})[player_id] or 0
		if is_alive(player) and count < required then
			return false
		end
	end
	return true
end

local function finish_shake_phase(next, fallback_player_id)
	next.turn.previous_player_id = next.turn.active_player_id

	if next.turn.is_first_shake then
		next.turn.is_first_shake = false
		return enter_dice_check(next, "shake_complete_first")
	end

	next.turn.is_first_shake = false
	local reload_player_id = next.shake.reload_player_id
	local reload_source = next.shake.reload_source
	local pending = nil
	if reload_player_id then
		pending = pending_for_player(next, reload_player_id, reload_source or "shake", 1)
	elseif reload_source ~= "duel" then
		pending = pending_for_player(next, next.turn.active_player_id or fallback_player_id, "shake", 1)
	end
	if pending then
		return enter_revolver_reload(next, pending, "shake_complete_reload")
	end
	return enter_dice_check(next, "shake_complete_no_reload")
end

local function all_alive_checked(next)
	for _, player_id in ipairs(next.players.order or {}) do
		local player = next.players.by_id[player_id]
		if is_alive(player) and not next.shake.checked[player_id] then
			return false
		end
	end
	return true
end

local function enter_bidding_gap(next, event)
	next.pending_load = nil
	if event then
		return transition_phase(next, event)
	end
	enter_phase(next, "bidding_gap")
	return true
end

local function enter_bidding(next, event)
	next.pending_load = nil
	if event then
		return transition_phase(next, event)
	end
	enter_phase(next, "bidding")
	return true
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

local function duel_reload_player_id(state, resolution)
	if not resolution or resolution.kind ~= "duel_shots" then
		return nil
	end

	for _, step in ipairs(resolution.steps or {}) do
		if step.consumed == true then
			local player_id = step.roulette_subject_id or step.target_id
			if is_alive(state.players.by_id[player_id]) then
				return player_id
			end
		end
	end

	return nil
end

local function reset_my_bid(next)
	next.bidding.my_bid = {
		count = 1,
		face = 2,
	}
	next.bidding.rail.selected_count = 1
	next.bidding.rail.window_start = 1
end

function set_hint(next)
	if next.match.status == "complete" then
		next.ui.hint_key = "hud.hint.complete"
	elseif next.pending_load then
		next.ui.hint_key = "hud.hint.load"
	elseif next.flow and next.flow.phase == "dice_check" then
		next.ui.hint_key = "hud.hint.dice_check"
	elseif next.flow and next.flow.phase == "bidding_gap" then
		next.ui.hint_key = "hud.hint.bidding_soon"
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

local function complete_setup_if_ready(next)
	if next.pending_load then
		return nil
	end

	local ok, err = enter_cup_shake(next, "reload_complete_setup")
	if not ok then
		return err
	end
	return nil
end

local function complete_shake_load_if_ready(next)
	if next.pending_load then
		return nil
	end

	local ok, err = enter_dice_check(next, "reload_complete_shake")
	if not ok then
		return err
	end
	return nil
end

local function complete_duel_load_if_ready(next)
	if next.pending_load then
		return nil
	end

	local ok, err = enter_cup_shake(next, "reload_complete_duel", {
		reload_source = "duel",
	})
	if not ok then
		return err
	end
	return nil
end

local function apply_bidding_preview(next)
	local local_player_id = next.match.local_player_id or next.players.order[1]
	next.pending_load = nil
	enter_bidding(next)
	next.turn.active_player_id = local_player_id
	next.turn.previous_player_id = local_player_id
	next.turn.is_first_shake = false
	next.bidding.my_bid = {
		count = 5,
		face = 2,
	}
	next.bidding.rail.selected_count = 5
	next.bidding.rail.window_start = 1

	for _, player_id in ipairs(next.players.order or {}) do
		local player = next.players.by_id[player_id]
		if player and #player.dice == 0 then
			player.dice = dice.roll(player.dice_count or 5)
		end
	end

	set_hint(next)
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
	next.match.local_simulator = payload.local_simulator == true or payload.localSimulator == true
	next.ui.locale = payload.locale or "ko"
	next.ui.cosmetics = clone(payload.cosmetics or {})

	for _, player in ipairs(payload.players or {}) do
		local normalized = server_snapshot.normalize_player(player, local_player_id)
		next.players.order[#next.players.order + 1] = normalized.id
		next.players.by_id[normalized.id] = normalized
	end

	if #next.players.order == 0 and local_player_id then
		local local_player = server_snapshot.normalize_player({
			id = local_player_id,
			name = "Player",
		}, local_player_id)
		next.players.order[1] = local_player.id
		next.players.by_id[local_player.id] = local_player
	end

	next.turn.active_player_id = payload.first_player_id or payload.firstPlayerId or local_player_id or next.players.order[1]
	next.pending_load = payload.pending_load
	if next.pending_load == nil and payload.requires_setup_load ~= false then
		next.pending_load = pending_for_player(next, local_player_id, "setup", 3)
	end

	if next.pending_load then
		local ok, err = enter_revolver_reload(next, next.pending_load, "start_reload")
		if not ok then
			return state, nil, err
		end
	else
		local ok, err = enter_cup_shake(next, "start_shake")
		if not ok then
			return state, nil, err
		end
	end

	if payload.preview == "bidding" then
		apply_bidding_preview(next)
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

handlers[actions.types.SERVER_SNAPSHOT_APPLY] = function(state, action)
	local next = server_snapshot.apply(state, action.payload or {})
	if next ~= state then
		set_hint(next)
	end
	return next, publish_all()
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
	return next, { "players", "turn", "flow", "shake", "ui" }
end

handlers[actions.types.SHAKE_COMPLETE] = function(state, action)
	if state.turn.kind ~= "shaking" or not state.flow or state.flow.phase ~= "cup_shake" then
		return state, nil, "not_shaking_turn"
	end

	local next = clone(state)
	local player_id = action.payload.player_id or next.turn.active_player_id or next.match.local_player_id
	if not is_alive(next.players.by_id[player_id]) then
		return state, nil, "unknown_player"
	end

	local required = next.shake.required_count or SHAKE_REQUIRED_COUNT
	if ((next.shake.counts or {})[player_id] or 0) >= required then
		return state, nil, "already_shaken"
	end
	next.shake.counts[player_id] = required

	roll_player_dice(next, player_id, action.payload.rng)
	if not all_alive_shaken(next) then
		set_hint(next)
		append_event_hash(next, action)
		return next, { "players", "shake", "ui" }
	end

	local ok, err = finish_shake_phase(next, player_id)
	if not ok then
		return state, nil, err
	end

	set_hint(next)
	append_event_hash(next, action)
	return next, { "players", "turn", "flow", "shake", "ui" }
end

handlers[actions.types.SHAKE_TIMEOUT] = function(state, action)
	if state.turn.kind ~= "shaking" or not state.flow or state.flow.phase ~= "cup_shake" then
		return state, nil, "not_shaking_turn"
	end

	local next = clone(state)
	local required = next.shake.required_count or SHAKE_REQUIRED_COUNT
	for _, player_id in ipairs(next.players.order or {}) do
		local player = next.players.by_id[player_id]
		local count = (next.shake.counts or {})[player_id] or 0
		if is_alive(player) and count < required then
			next.shake.counts[player_id] = required
			roll_player_dice(next, player_id, action.payload.rng)
		end
	end

	local ok, err = finish_shake_phase(next, next.turn.active_player_id)
	if not ok then
		return state, nil, err
	end

	set_hint(next)
	append_event_hash(next, action)
	return next, { "players", "turn", "flow", "shake", "ui" }
end

handlers[actions.types.DICE_CHECK_TIMEOUT] = function(state, action)
	if state.turn.kind ~= "shaking" or not state.flow or state.flow.phase ~= "dice_check" then
		return state, nil, "not_dice_check_turn"
	end

	local next = clone(state)
	for _, player_id in ipairs(next.players.order or {}) do
		local player = next.players.by_id[player_id]
		if is_alive(player) and not next.shake.checked[player_id] then
			next.shake.checked[player_id] = true
		end
	end

	local ok, err = enter_bidding_gap(next, "all_checked")
	if not ok then
		return state, nil, err
	end

	set_hint(next)
	append_event_hash(next, action)
	return next, { "turn", "flow", "shake", "ui" }
end

handlers[actions.types.DICE_CHECK] = function(state, action)
	if state.turn.kind ~= "shaking" or not state.flow or state.flow.phase ~= "dice_check" then
		return state, nil, "not_dice_check_turn"
	end

	local next = clone(state)
	local player_id = action.payload.player_id or next.match.local_player_id
	if not is_alive(next.players.by_id[player_id]) then
		return state, nil, "unknown_player"
	end

	next.shake.checked[player_id] = true
	if all_alive_checked(next) then
		local ok, err = enter_bidding_gap(next, "all_checked")
		if not ok then
			return state, nil, err
		end
	end

	set_hint(next)
	append_event_hash(next, action)
	return next, { "turn", "flow", "shake", "ui" }
end

handlers[actions.types.BIDDING_OPEN] = function(state, action)
	if state.turn.kind ~= "shaking" or not state.flow or state.flow.phase ~= "bidding_gap" then
		return state, nil, "not_bidding_gap"
	end

	local next = clone(state)
	local ok, err = enter_bidding(next, "open_bidding")
	if not ok then
		return state, nil, err
	end

	set_hint(next)
	append_event_hash(next, action)
	return next, { "turn", "flow", "ui" }
end

local function timeout_bid(state)
	local player_id = state.turn and state.turn.active_player_id
	if not player_id then
		return nil
	end
	local current = state.bidding and state.bidding.current_bid
	if not current then
		return { player_id = player_id, count = 1, face = 1 }
	end
	if (current.count or 1) < bidding.DEFAULT_LIMITS.max_count then
		return { player_id = player_id, count = current.count + 1, face = 1 }
	end
	return nil
end

handlers[actions.types.BIDDING_TIMEOUT] = function(state, action)
	if state.turn.kind ~= "bidding" or not state.flow or state.flow.phase ~= "bidding" then
		return state, nil, "not_bidding_turn"
	end

	local bid = timeout_bid(state)
	if bid then
		local fallback = actions.bid_raise(bid)
		local next, topics, err = handlers[actions.types.BID_RAISE](state, fallback)
		if not err then
			append_event_hash(next, action)
			return next, topics, nil
		end
	end
	if state.bidding.current_bid and not state.pending_load then
		local fallback = actions.bid_challenge()
		local next, topics, err = handlers[actions.types.BID_CHALLENGE](state, fallback)
		if not err then
			append_event_hash(next, action)
			return next, topics, nil
		end
	end
	return state, nil, "bidding_timeout_no_fallback"
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

	if next.pending_load then
		if pending.source == "bid" then
			next.flow.phase = "bidding"
			next.turn.kind = "bidding"
		else
			enter_revolver_reload(next, next.pending_load)
		end
	elseif pending.source == "setup" then
		local transition_err = complete_setup_if_ready(next)
		if transition_err then
			return state, nil, transition_err
		end
	elseif pending.source == "shake" then
		local transition_err = complete_shake_load_if_ready(next)
		if transition_err then
			return state, nil, transition_err
		end
	elseif pending.source == "duel" then
		local transition_err = complete_duel_load_if_ready(next)
		if transition_err then
			return state, nil, transition_err
		end
	elseif pending.source == "bid" then
		next.pending_load = next.bidding.deferred_load
		next.bidding.deferred_load = nil
		next.bidding.reload_gate = nil
		next.flow.phase = "bidding"
		next.turn.kind = "bidding"
	elseif pending.source == "exact_duel" then
		local ok, err = enter_cup_shake(next, "reload_complete_exact_duel", {
			reload_source = "duel",
		})
		if not ok then
			return state, nil, err
		end
	end

	set_hint(next)
	append_event_hash(next, action)
	return next, { "players", "turn", "flow", "shake", "ui" }
end

handlers[actions.types.BID_RELOAD_TIMEOUT] = function(state, action)
	local pending = state.pending_load
	if not state.flow or state.flow.phase ~= "bidding"
		or not pending or pending.source ~= "bid"
		or not state.bidding.reload_gate then
		return state, nil, "no_bid_reload_timeout"
	end

	local next = clone(state)
	local player = next.players.by_id[pending.player_id]
	local slot_index = nil
	for index, slot in ipairs(player and player.cylinder and player.cylinder.slots or {}) do
		if not slot.loaded then
			slot_index = index
			break
		end
	end
	if not player or not slot_index then
		return state, nil, "no_empty_load_slot"
	end

	local loaded, ok, err = cylinder.load(player.cylinder, slot_index)
	if not ok then
		return state, nil, err
	end
	player.cylinder = loaded
	update_bullets(player)
	next.pending_load = next.bidding.deferred_load
	next.bidding.deferred_load = nil
	next.bidding.reload_gate = nil
	next.flow.phase = "bidding"
	next.turn.kind = "bidding"
	set_hint(next)
	append_event_hash(next, action)
	return next, { "players", "turn", "bidding", "flow", "ui" }
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
	if state.bidding.reload_gate then
		return state, nil, "load_pending"
	end
	if state.pending_load and state.pending_load.source ~= "bid" then
		return state, nil, "load_pending"
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
	local bidder = next.players.by_id[bid.player_id]
	if not bidder then
		return state, nil, "unknown_player"
	end

	if bid.face == 1 then
		bidder.cylinder = cylinder.spin(bidder.cylinder, action.payload.spin_steps or 1)
		local triggered, shots = cylinder.trigger(bidder.cylinder, 1)
		bidder.cylinder = triggered
		local shot = shots[1]
		local hp_before = bidder.hp or 0
		if shot and shot.hit then
			bidder.hp = math.max(0, hp_before - 1)
			bidder.eliminated = bidder.hp <= 0
		end
		update_bullets(bidder)
		next.bidding.skull_roulette = {
			player_id = bidder.id,
			spin_steps = action.payload.spin_steps or 1,
			hit = shot and shot.hit == true or false,
			slot_index = shot and shot.slot_index or bidder.cylinder.chamber_index,
			consumed = shot and shot.consumed == true or false,
			hp_before = hp_before,
			hp_after = bidder.hp,
			sequence = (next.match.turn_count or 0) + 1,
		}
		next.match.turn_count = (next.match.turn_count or 0) + 1

		if not is_alive(bidder) then
			reset_my_bid(next)
			local count, winner_id = alive_count(next.players)
			if count <= 1 then
				next.match.status = "complete"
				next.match.winner_id = winner_id
				next.pending_load = nil
				enter_phase(next, "complete")
			else
				next.turn.active_player_id = turn_machine.next_alive_after(next.players, bidder.id)
				next.turn.previous_player_id = next.bidding.current_bid and next.bidding.current_bid.player_id or nil
				next.turn.kind = "bidding"
				next.flow.phase = "bidding"
			end
			set_hint(next)
			append_event_hash(next, action)
			return next, { "match", "players", "bidding", "turn", "flow", "ui" }
		end
	end

	next.bidding.current_bid = bid
	next.bidding.my_bid = {
		count = bid.count,
		face = bid.face,
	}
	next.bidding.recent_bids[#next.bidding.recent_bids + 1] = bid
	if bid.face ~= 1 then
		next.match.turn_count = next.match.turn_count + 1
	end

	local previous_active = next.turn.active_player_id
	next.turn = {
		kind = "bidding",
		active_player_id = turn_machine.next_alive_after(next.players, previous_active),
		previous_player_id = previous_active,
		round_index = next.turn.round_index or 0,
		is_first_shake = next.turn.is_first_shake,
	}

	local pending = pending_for_player(next, previous_active, "bid", 1)
	if state.pending_load and state.pending_load.source == "bid" then
		next.pending_load = clone(state.pending_load)
		next.bidding.deferred_load = pending
		next.bidding.reload_gate = {
			countdown_seconds = BID_RELOAD_COUNTDOWN_SECONDS,
			epoch = 1,
		}
	else
		next.pending_load = pending
		next.bidding.deferred_load = nil
		next.bidding.reload_gate = nil
	end
	next.flow.phase = "bidding"
	next.turn.kind = "bidding"

	set_hint(next)
	append_event_hash(next, action)
	return next, { "match", "bidding", "turn", "flow", "ui" }
end

handlers[actions.types.BID_CHALLENGE] = function(state, action)
	if state.turn.kind ~= "bidding" then
		return state, nil, "not_bidding_turn"
	end
	if state.pending_load then
		return state, nil, "load_pending"
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
	local ok, err = transition_phase(next, "challenge")
	if not ok then
		return state, nil, err
	end
	next.duel = duel.begin(next, challenger_id, previous_id)
	next.duel.revolver_spin = duel.spin_revolver(next, next.duel, action.payload.spin_steps)
	next.match.turn_count = next.match.turn_count + 1

	set_hint(next)
	append_event_hash(next, action)
	return next, { "match", "turn", "duel", "flow", "ui" }
end

handlers[actions.types.DUEL_RESOLVE_CHOICE] = function(state, action)
	local next = clone(state)
	if next.duel then
		next.duel.choice = clone(action.payload.choice or {})
	end
	append_event_hash(next, action)
	return next, { "duel" }
end

handlers[actions.types.DUEL_EXECUTE] = function(state, action)
	if state.turn.kind ~= "dualing" or not state.duel then
		return state, nil, "not_dueling_turn"
	end
	if state.duel.resolution then
		return state, nil, "duel_already_executed"
	end

	local next = clone(state)
	next.duel.resolution = duel.resolve(next, next.duel)
	next.duel.phase = "executing"
	update_all_bullets(next.players)

	set_hint(next)
	append_event_hash(next, action)
	return next, { "players", "duel", "ui" }
end

handlers[actions.types.ROUND_ADVANCE] = function(state, action)
	if state.turn.kind ~= "dualing" or not state.duel then
		return state, nil, "not_dueling_turn"
	end

	local next = clone(state)
	local resolution = next.duel.resolution
	if not resolution then
		resolution = duel.resolve(next, next.duel)
		update_all_bullets(next.players)
	end

	local count, winner_id = alive_count(next.players)
	local exact_reload_player_id = next.duel.previous_bidder_id
	local reload_player_id = duel_reload_player_id(next, resolution)
	next.duel.resolution = resolution
	next.duel.phase = "complete"

	if count <= 1 then
		next.match.status = "complete"
		next.match.winner_id = winner_id
		next.turn.kind = "complete"
		next.pending_load = nil
		local ok, err = transition_phase(next, "match_complete")
		if not ok then
			return state, nil, err
		end
		set_hint(next)
		append_event_hash(next, action)
		return next, publish_all()
	end

	local challenger_id = next.duel.challenger_id
	local next_round_first_player_id = challenger_id
	if not is_alive(next.players.by_id[next_round_first_player_id]) then
		next_round_first_player_id = turn_machine.next_alive_after(next.players, next_round_first_player_id)
	end

	next.turn.kind = "shaking"
	next.turn.previous_player_id = challenger_id
	next.turn.active_player_id = next_round_first_player_id
	next.turn.round_index = (next.turn.round_index or 0) + 1
	next.turn.is_first_shake = false
	next.bidding.current_bid = nil
	next.bidding.recent_bids = {}
	next.bidding.deferred_load = nil
	next.bidding.reload_gate = nil
	next.bidding.skull_roulette = nil
	next.duel = nil
	reset_my_bid(next)

	if resolution and resolution.kind == "perfect_duel" then
		local pending = pending_for_player(next, exact_reload_player_id, "exact_duel", 3)
		if pending then
			local ok, err = enter_revolver_reload(next, pending, "exact_reload")
			if not ok then
				return state, nil, err
			end
		else
			local ok, err = enter_cup_shake(next, "round_shake", {
				reload_source = "duel",
			})
			if not ok then
				return state, nil, err
			end
		end
	else
		local pending = nil
		if reload_player_id then
			pending = pending_for_player(next, reload_player_id, "duel", 1)
		end
		local ok, err
		if pending then
			ok, err = enter_revolver_reload(next, pending, "duel_reload")
		else
			ok, err = enter_cup_shake(next, "round_shake", {
				reload_source = "duel",
			})
		end
		if not ok then
			return state, nil, err
		end
	end

	set_hint(next)
	append_event_hash(next, action)
	return next, publish_all()
end

handlers[actions.types.MATCH_COMPLETE] = function(state, action)
	local next = clone(state)
	next.match.status = "complete"
	next.match.winner_id = action.payload.winner_id
	next.match.result = clone(action.payload.result)
	next.turn.kind = "complete"
	enter_phase(next, "complete")
	set_hint(next)
	append_event_hash(next, action)
	return next, { "match", "turn", "flow", "ui" }
end

handlers[actions.types.RESULT_SPECTATE] = function(state, action)
	local next = clone(state)
	next.ui.spectating = true
	return next, { "ui" }
end

-- Standalone local-simulator visual fixture only. It is not mapped to a server
-- command and qa_cli keeps it behind mode=dev + local_simulator=true.
handlers[actions.types.QA_RESULT_PREVIEW] = function(state, action)
	local next = clone(state)
	local player_id = next.match.local_player_id
	local player = next.players.by_id[player_id]
	local player_count = tonumber(action.payload.player_count) or #next.players.order
	local place = math.max(1, math.min(player_count, tonumber(action.payload.place) or player_count))
	local before = tonumber(action.payload.mmr_before) or 1000
	local after = tonumber(action.payload.mmr_after) or before
	local is_complete = action.payload.match_complete == true
	if player and place > 1 then
		player.hp = 0
		player.eliminated = true
	end
	next.match.result = {
		player_count = player_count,
		rated = action.payload.rated ~= false,
		placements = {
			{
				player_id = player_id,
				place = place,
				player_count = player_count,
				rated = action.payload.rated ~= false,
				mmr_before = before,
				mmr_after = after,
				mmr_delta = after - before,
			},
		},
	}
	next.ui.spectating = false
	if is_complete then
		next.match.status = "complete"
		next.match.winner_id = place == 1 and player_id or next.players.order[1]
		next.turn.kind = "complete"
		enter_phase(next, "complete")
	end
	return next, publish_all()
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
