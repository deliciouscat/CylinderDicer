local M = {}

local ALL_COMPONENTS = {
	"/ui#shake",
	"/ui#player_carousel",
	"/ui#rail",
	"/ui#local_hud",
	"/ui#bid_controls",
	"/ui#duel",
}

local COMPONENTS_BY_HUD = {
	revolver_reload = { "/ui#player_carousel" },
	cup_shake = { "/ui#shake", "/ui#player_carousel" },
	bidding = { "/ui#player_carousel", "/ui#rail", "/ui#local_hud", "/ui#bid_controls" },
	duel = { "/ui#duel" },
	complete = { "/ui#duel" },
}

local HUD_BY_PHASE = {
	revolver_reload = "revolver_reload",
	cup_shake = "cup_shake",
	dice_check = "cup_shake",
	bidding_gap = "cup_shake",
	bidding = "bidding",
	duel = "duel",
	complete = "complete",
}

local BACKGROUND_BY_HUD = {
	revolver_reload = "bidding",
	loading = "bidding",
	cup_shake = "shaking",
	bidding = "bidding",
	duel = "dualing",
	complete = "dualing",
}

local function phase(state)
	return state.flow and state.flow.phase or "waiting"
end

local function is_local_pending_load(state)
	local pending = state.pending_load
	return pending ~= nil and pending.player_id == state.match.local_player_id
end

local function hud(state)
	local current_phase = phase(state)
	if current_phase == "bidding" and state.pending_load and state.pending_load.source == "bid" then
		if is_local_pending_load(state) then
			return "revolver_reload"
		end
		if state.bidding and state.bidding.reload_gate then
			return "loading"
		end
		return "bidding"
	end
	if current_phase == "revolver_reload" and state.pending_load and not is_local_pending_load(state) then
		return "loading"
	end
	return HUD_BY_PHASE[current_phase] or state.turn.kind
end

function M.describe(state)
	local hud_kind = hud(state)
	local cylinder_anchor = "offscreen"
	if state.pending_load and hud_kind == "revolver_reload" then
		cylinder_anchor = "focal"
	elseif hud_kind == "loading" then
		cylinder_anchor = "focal"
	elseif hud_kind == "bidding" then
		cylinder_anchor = "hud"
	end

	return {
		phase = phase(state),
		hud = hud_kind,
		components = COMPONENTS_BY_HUD[hud_kind] or {},
		background = BACKGROUND_BY_HUD[hud_kind] or "shaking",
		cylinder_anchor = cylinder_anchor,
	}
end

function M.all_components()
	return ALL_COMPONENTS
end

return M
