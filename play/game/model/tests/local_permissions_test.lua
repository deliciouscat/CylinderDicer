local local_permissions = require("ui.common.local_permissions")
local selectors = require("game.model.selectors")

local M = {}

local function assert_eq(actual, expected, label)
	if actual ~= expected then
		error((label or "assert_eq") .. ": expected " .. tostring(expected) .. ", got " .. tostring(actual), 2)
	end
end

local function state(active_player_id, pending_player_id)
	return {
		match = {
			local_player_id = "local",
			mode = "dev",
			local_simulator = true,
		},
		turn = {
			kind = "bidding",
			active_player_id = active_player_id,
		},
		flow = {
			phase = "bidding",
		},
		pending_load = pending_player_id and {
			player_id = pending_player_id,
			source = "bid",
			count = 1,
		} or nil,
	}
end

function M.test_dev_mode_does_not_grant_opponent_bid_control()
	assert_eq(local_permissions.can_bid(state("opponent-1")), false, "opponent bid control")
	assert_eq(local_permissions.can_bid(state("local")), true, "local bid control")
end

function M.test_dev_mode_does_not_grant_opponent_load_control()
	assert_eq(local_permissions.can_load(state("opponent-1", "opponent-1")), false, "opponent load control")
	assert_eq(local_permissions.can_load(state("opponent-1", "local")), true, "local load control")
end

function M.test_bid_button_requires_count_cell_to_advance()
	local bidding_state = state("local")
	bidding_state.bidding = {
		current_bid = {
			player_id = "opponent-1",
			count = 3,
			face = 2,
		},
		my_bid = {
			count = 3,
			face = 4,
		},
	}
	assert_eq(selectors.is_my_bid_valid(bidding_state), false, "face-only raise")

	bidding_state.bidding.my_bid.count = 4
	bidding_state.bidding.my_bid.face = 1
	assert_eq(selectors.is_my_bid_valid(bidding_state), true, "count-cell raise")
end

function M.test_server_capabilities_override_phase_and_turn_inference()
	local server_state = state("local", "local")
	server_state.match.local_simulator = false
	server_state.available_actions = {}

	assert_eq(local_permissions.can_bid(server_state), false, "server bid absent")
	assert_eq(local_permissions.can_challenge(server_state), false, "server challenge absent")
	assert_eq(local_permissions.can_load(server_state), false, "server load absent")

	server_state.available_actions = {
		{ type = "bid" },
		{ type = "challenge" },
		{ type = "load", slots = { 2 }, remaining = 1 },
	}
	assert_eq(local_permissions.can_bid(server_state), true, "server bid present")
	assert_eq(local_permissions.can_challenge(server_state), true, "server challenge present")
	assert_eq(local_permissions.can_load(server_state), true, "server load present")
end

function M.test_server_checkpoint_capabilities_gate_shake_and_check()
	local server_state = state("local")
	server_state.match.local_simulator = false
	server_state.flow.phase = "cup_shake"
	server_state.available_actions = {}
	assert_eq(local_permissions.can_shake(server_state), false, "server shake absent")

	server_state.available_actions = { { type = "shake_complete" } }
	assert_eq(local_permissions.can_shake(server_state), true, "server shake present")

	server_state.flow.phase = "dice_check"
	server_state.available_actions = {}
	assert_eq(local_permissions.can_check(server_state), false, "server check absent")
	server_state.available_actions = { { type = "check" } }
	assert_eq(local_permissions.can_check(server_state), true, "server check present")
end

return M
