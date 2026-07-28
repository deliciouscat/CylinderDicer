local ruleset = require("game.ruleset")

local M = {}

M.CELL_COUNT = 13
M.CENTER_INDEX = 7
M.CELL_SPACING = 106
M.MIN_COUNT = ruleset.BID_COUNT_MIN
M.MAX_COUNT = ruleset.BID_COUNT_MAX
M.MAX_ANIMATED_STEP = 1
M.NORMAL_PANEL_ANIMATION = "bid_normal"
M.CHECKED_PANEL_ANIMATION = "bid_check"

function M.value_for_index(center_count, index)
	local value = center_count + index - M.CENTER_INDEX
	if value < M.MIN_COUNT or value > M.MAX_COUNT then
		return nil
	end
	return value
end

function M.panel_animation(value, current_bid_count)
	if value ~= nil and value == current_bid_count then
		return M.CHECKED_PANEL_ANIMATION
	end
	return M.NORMAL_PANEL_ANIMATION
end

function M.step_to_target(displayed_count, target_count)
	local delta = target_count - displayed_count
	if delta < -M.MAX_ANIMATED_STEP then
		return -M.MAX_ANIMATED_STEP
	end
	if delta > M.MAX_ANIMATED_STEP then
		return M.MAX_ANIMATED_STEP
	end
	return delta
end

function M.animation_duration(step)
	return 0.18 + math.max(0, math.abs(step) - 1) * 0.025
end

return M
