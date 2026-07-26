local M = {}

local MIN_DELTA = 8
local MAX_DELTA = 96
local MIN_DURATION = 0.75
local MAX_DURATION = 4.0
local SIGMOID_STEEPNESS = 8

local function sigmoid(value)
	return 1 / (1 + math.exp(-value))
end

function M.reel_duration(delta)
	local magnitude = math.abs(tonumber(delta) or 0)
	if magnitude <= MIN_DELTA then
		return MIN_DURATION
	end
	if magnitude >= MAX_DELTA then
		return MAX_DURATION
	end

	local normalized = (magnitude - MIN_DELTA) / (MAX_DELTA - MIN_DELTA)
	local low = sigmoid(-SIGMOID_STEEPNESS / 2)
	local high = sigmoid(SIGMOID_STEEPNESS / 2)
	local curved = (sigmoid((normalized - 0.5) * SIGMOID_STEEPNESS) - low) / (high - low)
	return MIN_DURATION + (MAX_DURATION - MIN_DURATION) * curved
end

function M.ease_in_out(value)
	local t = math.max(0, math.min(1, tonumber(value) or 0))
	return 0.5 - 0.5 * math.cos(math.pi * t)
end

function M.score_at(elapsed, before, after)
	before = tonumber(before) or 0
	after = tonumber(after) or before
	local hold = 0.5
	local duration = M.reel_duration(after - before)
	if elapsed <= hold then
		return before, false, duration
	end
	local progress = math.min(1, (elapsed - hold) / duration)
	local value = before + (after - before) * M.ease_in_out(progress)
	return value, progress >= 1, duration
end

function M.digit_frame(value, place_value, direction)
	local scaled = math.max(0, value) / place_value
	if direction >= 0 then
		local base = math.floor(scaled)
		return base % 10, (base + 1) % 10, scaled - base
	end
	local base = math.ceil(scaled)
	return base % 10, (base - 1) % 10, base - scaled
end

function M.local_result(state)
	local result = state.match and state.match.result
	local local_player_id = state.match and state.match.local_player_id
	if result then
		for _, placement in ipairs(result.placements or {}) do
			if placement.player_id == local_player_id or placement.playerId == local_player_id then
				return placement, result
			end
		end
	end

	local player_count = #(state.players and state.players.order or {})
	local place = state.match and state.match.winner_id == local_player_id and 1 or player_count
	return {
		player_id = local_player_id,
		place = math.max(1, place),
		player_count = math.max(1, player_count),
		rated = false,
	}, {
		player_count = math.max(1, player_count),
		rated = false,
	}
end

return M
