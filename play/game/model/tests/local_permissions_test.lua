local local_permissions = require("ui.common.local_permissions")

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

return M
