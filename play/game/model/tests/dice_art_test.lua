local dice_art = require("ui.common.dice_art")

local M = {}

local function assert_eq(actual, expected, label)
	if actual ~= expected then
		error((label or "assert_eq") .. ": expected " .. tostring(expected) .. ", got " .. tostring(actual), 2)
	end
end

local function assert_true(value, label)
	if not value then
		error(label or "assert_true", 2)
	end
end

function M.test_bid_dice_always_uses_the_front_image()
	assert_eq(dice_art.bid_animation(1), "f1_a0", "skull face")
	assert_eq(dice_art.bid_animation(6), "f6_a0", "six face")
	assert_eq(dice_art.front_animation(4), "f4_a0", "tray face")
end

function M.test_table_dice_use_only_random_angle_variants()
	for face = 1, 6 do
		for index = 1, 5 do
			local animation = dice_art.table_animation(face, index, 3)
			assert_true(animation:match("^f" .. tostring(face) .. "_a[1-5]$") ~= nil, animation)
		end
	end
end

function M.test_table_dice_variant_is_stable_per_round_and_changes_across_rounds()
	local first = dice_art.table_animation(4, 2, 7)
	assert_eq(dice_art.table_animation(4, 2, 7), first, "stable re-render")
	assert_true(dice_art.table_animation(4, 2, 8) ~= first, "next round angle")
end

return M
