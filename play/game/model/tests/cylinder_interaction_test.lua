local cylinder = require("game.model.rules.cylinder")
local slot_geometry = require("ui.cylinder_overlay.slot_geometry")

local M = {}

local function assert_eq(actual, expected, label)
	if actual ~= expected then
		error((label or "assert_eq") .. ": expected " .. tostring(expected) .. ", got " .. tostring(actual), 2)
	end
end

function M.test_click_geometry_matches_gui_slot_order()
	local center_x = 640
	local center_y = 372
	local radius = 245
	local positions = {
		{ 640, 434 },
		{ 694, 403 },
		{ 694, 341 },
		{ 640, 310 },
		{ 586, 341 },
		{ 586, 403 },
	}

	for expected, position in ipairs(positions) do
		local actual = slot_geometry.slot_at(
			position[1],
			position[2],
			center_x,
			center_y,
			radius,
			6
		)
		assert_eq(actual, expected, "screen slot " .. tostring(expected))
	end
end

function M.test_load_fills_only_selected_slot()
	local current = cylinder.new()
	local loaded, ok = cylinder.load(current, 1)

	assert_eq(ok, true, "load succeeds")
	assert_eq(loaded.slots[1].loaded, true, "selected slot loaded")
	assert_eq(loaded.slots[2].loaded, false, "next slot remains empty")
	assert_eq(loaded.chamber_index, 1, "load does not rotate chamber")
	assert_eq(current.chamber_index, 1, "input cylinder remains unchanged")
end

function M.test_spin_pulls_skipped_slots_forward()
	local current = cylinder.new()
	current = cylinder.load(current, 1)
	current = cylinder.load(current, 3)

	local spun = cylinder.spin(current, 1)
	assert_eq(spun.slots[1].loaded, false, "old slot 2 moves to front")
	assert_eq(spun.slots[2].loaded, true, "old slot 3 follows")
	assert_eq(spun.slots[6].loaded, true, "old slot 1 wraps to back")
	assert_eq(spun.chamber_index, 1, "trigger starts at rotated front")
end

function M.test_six_step_spin_is_full_rotation()
	local current = cylinder.new()
	current = cylinder.load(current, 2)

	local spun = cylinder.spin(current, 6)
	for index = 1, 6 do
		assert_eq(spun.slots[index].loaded, current.slots[index].loaded, "full rotation slot " .. tostring(index))
	end
end

return M
