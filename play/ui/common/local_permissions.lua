local selectors = require("game.model.selectors")

local M = {}

local function is_local_simulator(state)
	return state.match and state.match.local_simulator == true
end

local function has_server_action(state, action_type)
	for _, action in ipairs(state.available_actions or {}) do
		if action.type == action_type then
			return true
		end
	end
	return false
end

function M.can_bid(state)
	if is_local_simulator(state) then
		return selectors.is_hud(state, "bidding") and selectors.is_my_turn(state)
	end
	return has_server_action(state, "bid")
end

function M.can_challenge(state)
	if is_local_simulator(state) then
		return M.can_bid(state) and selectors.has_previous_bid(state)
	end
	return has_server_action(state, "challenge")
end

function M.can_load(state)
	if not is_local_simulator(state) then
		return has_server_action(state, "load")
	end
	local pending = state.pending_load
	local local_player_id = state.match.local_player_id
	return pending ~= nil and pending.player_id == local_player_id
end

function M.can_shake(state)
	if is_local_simulator(state) then
		return selectors.phase(state) == "cup_shake"
	end
	return has_server_action(state, "shake_complete")
end

function M.can_check(state)
	if is_local_simulator(state) then
		return selectors.phase(state) == "dice_check"
	end
	return has_server_action(state, "check")
end

return M
