local M = {}

M.BIDDING_OPEN_DELAY_SECONDS = 3.0
M.DUEL_REVEAL_INTERVAL_SECONDS = 0.16
M.DUEL_REVEAL_DURATION_SECONDS = 0.34
M.DUEL_REVEAL_HOLD_SECONDS = 3.0
M.DUEL_EXECUTE_INTRO_SECONDS = 0.45
M.DUEL_ROULETTE_STEP_SECONDS = 0.66
M.DUEL_PERFECT_STEP_SECONDS = 1.18
M.DUEL_COMPLETE_HOLD_SECONDS = 1.0

local function alive_player_count(state)
	local count = 0
	for _, player_id in ipairs(state.players.order or {}) do
		local player = state.players.by_id[player_id]
		if player and not player.eliminated and (player.hp or 0) > 0 then
			count = count + 1
		end
	end
	return count
end

function M.automatic_transition(state)
	local phase = state.flow and state.flow.phase
	if phase == "bidding_gap" then
		return {
			type = "bidding.open",
			delay = M.BIDDING_OPEN_DELAY_SECONDS,
		}
	end

	local duel = state.duel
	if phase ~= "duel" or not duel then
		return nil
	end

	if duel.phase == "ready" and not duel.resolution then
		return {
			type = "duel.execute",
			delay = math.max(0, alive_player_count(state) - 1) * M.DUEL_REVEAL_INTERVAL_SECONDS
				+ M.DUEL_REVEAL_DURATION_SECONDS
				+ M.DUEL_REVEAL_HOLD_SECONDS,
		}
	end

	if duel.phase == "executing" and duel.resolution then
		local resolution = duel.resolution
		local step_seconds = resolution.kind == "perfect_duel"
			and M.DUEL_PERFECT_STEP_SECONDS
			or M.DUEL_ROULETTE_STEP_SECONDS
		return {
			type = "round.advance",
			delay = M.DUEL_EXECUTE_INTRO_SECONDS
				+ #(resolution.steps or {}) * step_seconds
				+ M.DUEL_COMPLETE_HOLD_SECONDS,
		}
	end

	return nil
end

return M
