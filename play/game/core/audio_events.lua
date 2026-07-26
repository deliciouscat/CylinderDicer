local selectors = require("game.model.selectors")

local M = {}

local function is_complete(snapshot)
	return snapshot
		and (snapshot.status == "complete" or snapshot.phase == "complete")
end

function M.snapshot(state)
	if not state then
		return nil
	end

	local bullets = {}
	for _, player_id in ipairs(state.players and state.players.order or {}) do
		bullets[player_id] = selectors.player_bullets(state.players.by_id[player_id])
	end

	local pending = state.pending_load
	return {
		match_id = state.match and state.match.match_id or nil,
		status = state.match and state.match.status or nil,
		phase = state.flow and state.flow.phase or nil,
		local_player_id = state.match and state.match.local_player_id or nil,
		winner_id = state.match and state.match.winner_id or nil,
		pending_player_id = pending and pending.player_id or nil,
		pending_count = pending and pending.count or nil,
		bullets = bullets,
	}
end

function M.cues(previous, current)
	local cues = {}
	if not current then
		return cues
	end

	if not previous or previous.match_id ~= current.match_id then
		if current.match_id and not is_complete(current) then
			cues[#cues + 1] = "start_bell"
		end
		return cues
	end

	if not current.match_id then
		return cues
	end

	if previous.phase ~= "dice_check" and current.phase == "dice_check" then
		cues[#cues + 1] = "drop"
	end

	local pending_player_id = previous.pending_player_id
	if pending_player_id then
		local before = previous.bullets[pending_player_id] or 0
		local after = current.bullets[pending_player_id] or before
		local loaded = math.max(0, after - before)
		if loaded > 0 then
			local pending_finished = current.pending_player_id ~= pending_player_id
				or (previous.pending_count or 0) <= loaded
			cues[#cues + 1] = pending_finished and "clasp" or "reload"
		end
	end

	if not is_complete(previous) and is_complete(current) then
		cues[#cues + 1] = current.local_player_id == current.winner_id
			and "victory"
			or "placement"
	end

	return cues
end

return M
