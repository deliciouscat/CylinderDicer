local bidding = require("game.model.rules.bidding")
local dice = require("game.model.rules.dice")
local cylinder = require("game.model.rules.cylinder")
local turn_machine = require("game.model.turn_machine")

local M = {}

local HUD_BY_PHASE = {
	revolver_reload = "revolver_reload",
	cup_shake = "cup_shake",
	dice_check = "cup_shake",
	bidding_gap = "cup_shake",
	bidding = "bidding",
	duel = "duel",
	complete = "complete",
}

local BG_BY_HUD = {
	revolver_reload = "bidding",
	loading = "shaking",
	cup_shake = "shaking",
	bidding = "bidding",
	duel = "dualing",
	complete = "dualing",
}

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
	local phase = M.phase(state)
	if phase == "revolver_reload" and state.pending_load and not M.is_local_pending_load(state) then
		return "loading"
	end
	return HUD_BY_PHASE[phase] or state.turn.kind
end

function M.is_hud(state, hud)
	return M.hud_kind(state) == hud
end

function M.background_location(state)
	return BG_BY_HUD[M.hud_kind(state)] or "shaking"
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
	if state.pending_load and M.is_hud(state, "revolver_reload") then
		return "focal"
	end

	if M.is_hud(state, "bidding") then
		return "hud"
	end

	return "offscreen"
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
