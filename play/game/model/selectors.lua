local bidding = require "game.model.rules.bidding"
local dice = require "game.model.rules.dice"
local cylinder = require "game.model.rules.cylinder"
local turn_machine = require "game.model.turn_machine"

local M = {}

function M.is_my_turn(state)
	return state.turn.active_player_id == state.match.local_player_id
end

function M.local_player(state)
	return state.players.by_id[state.match.local_player_id]
end

function M.visible_rail_range(state)
	local rail = state.bidding.rail
	return rail.window_start, rail.window_start + rail.window_size - 1
end

function M.is_my_bid_valid(state)
	return bidding.validate(state.bidding.current_bid, state.bidding.my_bid, bidding.DEFAULT_LIMITS).ok
end

function M.count_face(state, face)
	return dice.count_face(state.players, face or state.bidding.my_bid.face)
end

function M.hint_key(state)
	return state.ui.hint_key
end

function M.last_alive_player(state)
	local alive = turn_machine.alive_order(state.players)
	return alive[1]
end

function M.match_result_payload(state)
	return {
		matchId = state.match.match_id,
		winnerId = state.match.winner_id or M.last_alive_player(state),
		turnCount = state.match.turn_count,
		eventsHash = state.match.events_hash,
	}
end

function M.player_bullets(player)
	return cylinder.loaded_count(player.cylinder)
end

function M.cylinder_anchor(state)
	if state.pending_load and (state.turn.kind == "shaking" or state.turn.kind == "setup") then
		return "focal"
	end

	if state.turn.kind == "bidding" then
		return "hud"
	end

	return "offscreen"
end

function M.has_previous_bid(state)
	return state.bidding.current_bid ~= nil
end

return M
