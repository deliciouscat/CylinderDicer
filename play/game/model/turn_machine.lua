local M = {}

local PHASE_TRANSITIONS = {
	waiting = {
		start_reload = "revolver_reload",
		start_shake = "cup_shake",
		preview_bidding = "bidding",
	},
	revolver_reload = {
		reload_complete_setup = "cup_shake",
		reload_complete_shake = "dice_check",
		reload_complete_duel = "cup_shake",
		reload_complete_exact_duel = "cup_shake",
	},
	cup_shake = {
		shake_complete_first = "dice_check",
		shake_complete_reload = "revolver_reload",
		shake_complete_no_reload = "dice_check",
	},
	dice_check = {
		all_checked = "bidding_gap",
	},
	bidding_gap = {
		open_bidding = "bidding",
	},
	bidding = {
		challenge = "duel",
	},
	duel = {
		match_complete = "complete",
		round_shake = "cup_shake",
		duel_reload = "revolver_reload",
		exact_reload = "revolver_reload",
	},
	complete = {},
}

local TURN_KIND_BY_PHASE = {
	waiting = "setup",
	revolver_reload = "setup",
	cup_shake = "shaking",
	dice_check = "shaking",
	bidding_gap = "shaking",
	bidding = "bidding",
	duel = "dualing",
	complete = "complete",
}

local function alive_order(players)
	local order = {}
	for _, player_id in ipairs(players.order or {}) do
		local player = players.by_id[player_id]
		if player and not player.eliminated and (player.hp or 0) > 0 then
			order[#order + 1] = player_id
		end
	end
	return order
end

local function next_alive_after(players, player_id)
	local order = alive_order(players)
	if #order == 0 then
		return nil
	end

	if not player_id then
		return order[1]
	end

	local all_order = players.order or {}
	local start_index
	for i, id in ipairs(all_order) do
		if id == player_id then
			start_index = i
			break
		end
	end

	if start_index then
		for offset = 1, #all_order do
			local candidate_id = all_order[((start_index + offset - 1) % #all_order) + 1]
			local candidate = players.by_id[candidate_id]
			if candidate and not candidate.eliminated and (candidate.hp or 0) > 0 then
				return candidate_id
			end
		end
	end

	return order[1]
end

local function phase(state)
	return state and state.flow and state.flow.phase or "waiting"
end

local function kind_for_phase(next_phase)
	return TURN_KIND_BY_PHASE[next_phase]
end

function M.phase(state)
	return phase(state)
end

function M.kind_for_phase(next_phase)
	return kind_for_phase(next_phase)
end

function M.derive_kind(state)
	local current_phase = phase(state)
	if current_phase == "revolver_reload" then
		local source = state.pending_load and state.pending_load.source
		if source == "bid" then
			return "bidding"
		end
		if source == "shake" or source == "duel" or source == "exact_duel" then
			return "shaking"
		end
	end
	return kind_for_phase(current_phase)
end

function M.sync_kind(state)
	state.turn = state.turn or {}
	state.turn.kind = M.derive_kind(state) or state.turn.kind
	return state.turn.kind
end

function M.enter_phase(state, next_phase, options)
	options = options or {}
	state.flow = state.flow or {}
	state.flow.phase = next_phase
	if options.dice_check_delay_seconds then
		state.flow.dice_check_delay_seconds = options.dice_check_delay_seconds
	end
	M.sync_kind(state)
	return state
end

function M.transition_phase(state, event, options)
	local current = phase(state)
	local next_phase = (PHASE_TRANSITIONS[current] or {})[event]
	if not next_phase then
		return {
			ok = false,
			reason = "invalid_phase_transition",
			from = current,
			event = event,
		}
	end

	M.enter_phase(state, next_phase, options)
	return {
		ok = true,
		from = current,
		to = next_phase,
		event = event,
	}
end

function M.alive_order(players)
	return alive_order(players)
end

function M.next_alive_after(players, player_id)
	return next_alive_after(players, player_id)
end

return M
