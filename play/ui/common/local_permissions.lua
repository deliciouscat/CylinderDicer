local selectors = require("game.model.selectors")

local M = {}

function M.can_bid(state)
	return selectors.is_hud(state, "bidding") and selectors.is_my_turn(state)
end

function M.can_load(state)
	local pending = state.pending_load
	local local_player_id = state.match.local_player_id
	return pending ~= nil and pending.player_id == local_player_id
end

return M
