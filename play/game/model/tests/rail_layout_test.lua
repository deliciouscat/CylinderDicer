local rail_layout = require("ui.rail.rail_layout")

local M = {}

local function assert_eq(actual, expected, label)
	if actual ~= expected then
		error((label or "assert_eq") .. ": expected " .. tostring(expected) .. ", got " .. tostring(actual), 2)
	end
end

function M.test_selected_count_is_always_centered()
	assert_eq(rail_layout.value_for_index(1, rail_layout.CENTER_INDEX), 1, "minimum centered")
	assert_eq(rail_layout.value_for_index(18, rail_layout.CENTER_INDEX), 18, "middle centered")
	assert_eq(rail_layout.value_for_index(36, rail_layout.CENTER_INDEX), 36, "maximum centered")
end

function M.test_out_of_range_cells_hide_their_number_boards()
	assert_eq(rail_layout.value_for_index(1, 1), nil, "left overflow hidden")
	assert_eq(rail_layout.value_for_index(36, rail_layout.CELL_COUNT), nil, "right overflow hidden")
	assert_eq(rail_layout.value_for_index(1, rail_layout.CENTER_INDEX + 1), 2, "next value visible")
	assert_eq(rail_layout.value_for_index(36, rail_layout.CENTER_INDEX - 1), 35, "previous value visible")
end

function M.test_large_jumps_are_bounded_to_the_cell_buffer()
	assert_eq(rail_layout.step_to_target(1, 36), 1, "forward step bounded")
	assert_eq(rail_layout.step_to_target(36, 1), -1, "backward step bounded")
	assert_eq(rail_layout.step_to_target(12, 14), 1, "nearby step bounded")
end

return M
