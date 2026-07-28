local M = {}

function M.visual_player_id(state, hud)
	local pending = state and state.pending_load
	if pending and (hud == "revolver_reload" or hud == "loading") then
		return pending.player_id
	end
	return state and state.match and state.match.local_player_id or nil
end

return M
