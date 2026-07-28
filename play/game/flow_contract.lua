local ruleset = require("game.ruleset")

local M = {}

M.BIDDING_OPEN_DELAY_SECONDS = ruleset.BIDDING_OPEN_DELAY_MS / 1000
M.SHAKE_TIMEOUT_SECONDS = ruleset.SHAKE_TIMEOUT_MS / 1000
M.DICE_CHECK_TIMEOUT_SECONDS = ruleset.DICE_CHECK_TIMEOUT_MS / 1000
M.BIDDING_TIMEOUT_SECONDS = ruleset.BIDDING_TIMEOUT_MS / 1000
M.BID_RELOAD_TIMEOUT_SECONDS = ruleset.BID_RELOAD_TIMEOUT_MS / 1000
M.DUEL_REVEAL_INTERVAL_SECONDS = ruleset.DUEL_REVEAL_INTERVAL_MS / 1000
M.DUEL_REVEAL_DURATION_SECONDS = ruleset.DUEL_REVEAL_DURATION_MS / 1000
M.DUEL_REVEAL_HOLD_SECONDS = ruleset.DUEL_REVEAL_HOLD_MS / 1000
M.DUEL_EXECUTE_INTRO_SECONDS = ruleset.DUEL_EXECUTE_INTRO_MS / 1000
M.DUEL_ROULETTE_STEP_SECONDS = ruleset.DUEL_ROULETTE_STEP_MS / 1000
M.DUEL_PERFECT_STEP_SECONDS = ruleset.DUEL_PERFECT_STEP_MS / 1000
M.DUEL_COMPLETE_HOLD_SECONDS = ruleset.DUEL_COMPLETE_HOLD_MS / 1000

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
	if phase == "cup_shake" then
		return {
			type = "shake.timeout",
			delay = M.SHAKE_TIMEOUT_SECONDS,
		}
	end
	if phase == "dice_check" then
		return {
			type = "dice.check.timeout",
			delay = M.DICE_CHECK_TIMEOUT_SECONDS,
		}
	end
	if phase == "bidding_gap" then
		return {
			type = "bidding.open",
			delay = M.BIDDING_OPEN_DELAY_SECONDS,
		}
	end
	if phase == "bidding" and state.pending_load and state.pending_load.source == "bid"
		and state.bidding and state.bidding.reload_gate then
		return {
			type = "bid.reload_timeout",
			delay = M.BID_RELOAD_TIMEOUT_SECONDS,
		}
	end
	if phase == "bidding" then
		return {
			type = "bidding.timeout",
			delay = M.BIDDING_TIMEOUT_SECONDS,
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
