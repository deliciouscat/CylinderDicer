local bidding = require("game.model.rules.bidding")
local dice = require("game.model.rules.dice")
local cylinder = require("game.model.rules.cylinder")
local turn_machine = require("game.model.turn_machine")
local presentation = require("game.presentation")

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
	local current = state.bidding.current_bid
	local draft = state.bidding.my_bid
	if current and draft.count <= current.count then
		return false
	end
	return bidding.validate(current, draft, bidding.DEFAULT_LIMITS).ok
end

function M.count_face(state, face)
	return dice.count_face(state.players, face or state.bidding.my_bid.face)
end

function M.hint_key(state)
	return state.ui.hint_key
end

function M.shake_status(state, player_id)
	local shake = state.shake or {}
	local required = math.max(1, shake.required_count or 1)
	local count = math.max(0, (shake.counts or {})[player_id] or 0)
	return {
		count = count,
		required = required,
		ratio = math.min(1.0, count / required),
		complete = count >= required,
	}
end

function M.phase(state)
	return state.flow and state.flow.phase or "waiting"
end

function M.is_local_pending_load(state)
	local pending = state.pending_load
	return pending ~= nil and pending.player_id == state.match.local_player_id
end

function M.hud_kind(state)
	return presentation.describe(state).hud
end

function M.is_hud(state, hud)
	return M.hud_kind(state) == hud
end

function M.background_location(state)
	return presentation.describe(state).background
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
	if not player then
		return 0
	end
	local from_cylinder = cylinder.loaded_count(player.cylinder)
	if from_cylinder > 0 then
		return from_cylinder
	end
	return player.bullets or 0
end

function M.cylinder_anchor(state)
	return presentation.describe(state).cylinder_anchor
end

function M.reload_summary(state)
	local pending = state.pending_load
	if not pending then
		return nil
	end

	local player = state.players.by_id[pending.player_id]
	local source = pending.source or "setup"
	return {
		source = source,
		title_key = "reload.title." .. source,
		target_name = player and (player.name or player.id) or pending.player_id,
		remaining = pending.count or 0,
		next_key = "reload.next." .. source,
	}
end

function M.has_previous_bid(state)
	return state.bidding.current_bid ~= nil
end

return M
