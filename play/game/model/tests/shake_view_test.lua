local selectors = require("game.model.selectors")
local table_seat_layout = require("ui.common.table_seat_layout")

local M = {}

local function assert_eq(actual, expected, label)
	if actual ~= expected then
		error((label or "assert_eq") .. ": expected " .. tostring(expected) .. ", got " .. tostring(actual), 2)
	end
end

local function assert_near(actual, expected, epsilon, label)
	if math.abs(actual - expected) > (epsilon or 0.001) then
		error((label or "assert_near") .. ": expected " .. tostring(expected) .. ", got " .. tostring(actual), 2)
	end
end

function M.test_shake_status_clamps_ratio()
	local state = {
		shake = {
			required_count = 6,
			counts = {
				local_player = 8,
			},
		},
	}
	local status = selectors.shake_status(state, "local_player")
	assert_eq(status.count, 8, "count")
	assert_eq(status.required, 6, "required")
	assert_eq(status.ratio, 1.0, "ratio")
	assert_eq(status.complete, true, "complete")
end

function M.test_single_opponent_is_centered()
	local layout = table_seat_layout.build({ "local", "opponent" }, "local")
	assert_eq(#layout.opponents, 1, "opponent count")
	assert_near(layout.opponents[1].angle, 90.0, 0.001, "angle")
	assert_near(layout.opponents[1].cup.x, 0.0, 0.001, "center x")
end

function M.test_five_opponents_are_symmetric()
	local layout = table_seat_layout.build({
		"local",
		"opponent-1",
		"opponent-2",
		"opponent-3",
		"opponent-4",
		"opponent-5",
	}, "local")

	assert_eq(#layout.opponents, 5, "opponent count")
	assert_near(layout.opponents[1].cup.x, -layout.opponents[5].cup.x, 0.001, "outer symmetry")
	assert_near(layout.opponents[2].cup.x, -layout.opponents[4].cup.x, 0.001, "inner symmetry")
	assert_near(layout.opponents[3].cup.x, 0.0, 0.001, "center opponent")
end

return M
