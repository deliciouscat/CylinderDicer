local cylinder = require("game.model.rules.cylinder")

local M = {}

function M.active_load(state)
	return state and state.pending_load or nil
end

function M.lane(state)
	if state and state.bidding and state.bidding.reload_gate then
		return "gated"
	end
	return M.active_load(state) and "loading" or "clear"
end

function M.begin_load(state, pending)
	state.pending_load = pending
end

function M.clear_active_load(state)
	state.pending_load = nil
end

function M.consume_active_load(state)
	state.pending_load = cylinder.consume_pending(state.pending_load)
	return state.pending_load
end

function M.queue_bid_load(state, pending, countdown_seconds)
	state.bidding = state.bidding or {}
	if state.pending_load and state.pending_load.source == "bid" then
		state.bidding.deferred_load = pending
		state.bidding.reload_gate = {
			countdown_seconds = countdown_seconds,
			epoch = ((state.bidding.reload_gate and state.bidding.reload_gate.epoch) or 0) + 1,
		}
		return
	end
	if not pending then
		return
	end

	state.pending_load = pending
	state.bidding.deferred_load = nil
	state.bidding.reload_gate = nil
end

function M.promote_deferred_bid_load(state)
	state.pending_load = state.bidding and state.bidding.deferred_load or nil
	if state.bidding then
		state.bidding.deferred_load = nil
		state.bidding.reload_gate = nil
	end
	return state.pending_load
end

function M.reset_bid_reload(state)
	if state.bidding then
		state.bidding.deferred_load = nil
		state.bidding.reload_gate = nil
	end
end

return M
