local duel_view = require("ui.duel.duel_view")

local M = {}

local function assert_eq(actual, expected, label)
	if actual ~= expected then
		error((label or "assert_eq") .. ": expected " .. tostring(expected) .. ", got " .. tostring(actual), 2)
	end
end

local function assert_close(actual, expected, epsilon, label)
	if math.abs(actual - expected) > (epsilon or 0.0001) then
		error((label or "assert_close") .. ": expected " .. tostring(expected) .. ", got " .. tostring(actual), 2)
	end
end

function M.test_short_places_challenger_shooter_left_and_previous_bidder_target_right()
	local left_id, right_id = duel_view.combat_pair_ids({
		previous_bidder_id = "local",
		challenger_id = "opponent",
	}, {
		kind = "duel_shots",
		verdict = "SHORT",
		shooter_id = "opponent",
		target_id = "local",
	})

	assert_eq(left_id, "opponent", "SHORT left attacker")
	assert_eq(right_id, "local", "SHORT right target")
end

function M.test_over_places_previous_bidder_shooter_left_and_challenger_target_right()
	local left_id, right_id = duel_view.combat_pair_ids({
		previous_bidder_id = "local",
		challenger_id = "opponent",
	}, {
		kind = "duel_shots",
		verdict = "OVER",
		shooter_id = "local",
		target_id = "opponent",
	})

	assert_eq(left_id, "local", "OVER left attacker")
	assert_eq(right_id, "opponent", "OVER right target")
end

function M.test_perfect_duel_keeps_actor_left_and_current_step_target_right()
	local left_id, right_id = duel_view.combat_pair_ids({
		previous_bidder_id = "local",
		challenger_id = "opponent-1",
	}, {
		kind = "perfect_duel",
		actor_id = "local",
	}, {
		target_id = "opponent-2",
	})

	assert_eq(left_id, "local", "perfect actor")
	assert_eq(right_id, "opponent-2", "perfect current target")
end

function M.test_local_duel_reveal_uses_the_open_shake_dice_spread()
	local first = duel_view.local_reveal_die_layout(100.0, 200.0, 1)
	local second = duel_view.local_reveal_die_layout(100.0, 200.0, 2)
	local third = duel_view.local_reveal_die_layout(100.0, 200.0, 3)
	local fifth = duel_view.local_reveal_die_layout(100.0, 200.0, 5)

	assert_eq(first.x, 33.0, "left edge")
	assert_eq(fifth.x, 168.0, "right edge")
	assert_eq(fifth.x - first.x, 135.0, "same horizontal spread as shake reveal")
	assert_eq(first.y, 159.0, "lower row is lifted clear of the duel hint")
	assert_eq(second.y, 193.0, "upper row follows the lifted reveal anchor")
	assert_eq(second.y - third.y, 40.0, "staggered two-row layout")
	assert_eq(first.width, 48.0, "shake reveal die width")
	assert_eq(first.height, 52.0, "shake reveal die height")
	assert_eq(duel_view.local_reveal_die_layout(0.0, 0.0, 6), nil, "invalid die index")
end

function M.test_duel_reveal_draws_the_lower_row_over_the_upper_row()
	local order = duel_view.reveal_dice_draw_order()
	assert_eq(order[1], 2, "upper-left drawn first")
	assert_eq(order[2], 4, "upper-right drawn second")
	assert_eq(order[3], 1, "lower-left covers upper row")
	assert_eq(order[4], 3, "lower-center covers upper row")
	assert_eq(order[5], 5, "lower-right covers upper row")
end

function M.test_bullet_count_decrements_only_when_a_consumed_shot_is_presented()
	local resolution = {
		steps = {
			{ shooter_id = "local", consumed = true },
			{ shooter_id = "local", consumed = false },
			{ shooter_id = "local", consumed = true },
		},
	}
	local player = { bullets = 1 }
	local base_player = { bullets = 3 }

	assert_eq(
		duel_view.visible_bullets("local", player, base_player, resolution, 1, 0.2, false, 0.42),
		3,
		"first shot has not consumed its bullet visually"
	)
	assert_eq(
		duel_view.visible_bullets("local", player, base_player, resolution, 1, 0.5, false, 0.42),
		2,
		"first consumed shot decrements once"
	)
	assert_eq(
		duel_view.visible_bullets("local", player, base_player, resolution, 2, 0.8, false, 0.42),
		2,
		"empty chamber does not decrement bullets"
	)
	assert_eq(
		duel_view.visible_bullets("local", player, base_player, resolution, 3, 0.8, false, 0.42),
		1,
		"later consumed shot reaches authoritative total"
	)
	assert_eq(
		duel_view.visible_bullets("opponent", { bullets = 4 }, { bullets = 4 }, resolution, 3, 1.0, true, 0.42),
		4,
		"other player bullets stay unchanged"
	)
end

function M.test_duel_cylinder_shows_full_loaded_layout_and_consumes_fired_slots()
	local resolution = {
		cylinder_slots_before = { true, true, true, false, false, false },
		steps = {
			{ slot_index = 1, hit = true, consumed = true },
			{ slot_index = 2, hit = true, consumed = true },
			{ slot_index = 3, hit = true, consumed = true },
		},
	}

	local first = duel_view.cylinder_step_visual(resolution, 1, 0.20, false, 6, 0.42)
	assert_eq(first.slot_index, 1, "first chamber")
	assert_eq(first.loaded, true, "first chamber loaded before fire")
	assert_eq(first.slots[1], true, "first bullet visible")
	assert_eq(first.slots[2], true, "second bullet visible before its turn")
	assert_eq(first.slots[3], true, "third bullet visible before its turn")
	local first_before_fire = duel_view.cylinder_step_visual(resolution, 1, 0.40, false, 6, 0.42)
	assert_close(first_before_fire.angle % (math.pi * 2.0), 0.0, 0.0001, "first chamber at marker")
	local first_after_fire = duel_view.cylinder_step_visual(resolution, 1, 0.50, false, 6, 0.42)
	assert_eq(first_after_fire.slots[1], false, "first consumed bullet hidden after fire")
	assert_eq(first_after_fire.slots[2], true, "second bullet remains loaded")
	assert_eq(first_after_fire.slots[3], true, "third bullet remains loaded")

	local second_before_fire = duel_view.cylinder_step_visual(resolution, 2, 0.40, false, 6, 0.42)
	assert_eq(second_before_fire.slot_index, 2, "second chamber")
	assert_eq(second_before_fire.loaded, true, "loaded chamber visible before fire")
	assert_eq(second_before_fire.slots[1], false, "previous consumed chamber stays empty")
	assert_eq(second_before_fire.slots[2], true, "current bullet remains before fire")
	assert_eq(second_before_fire.slots[3], true, "future loaded chamber remains visible")
	assert_close(
		second_before_fire.angle % (math.pi * 2.0),
		math.pi / 3.0,
		0.0001,
		"second chamber at marker"
	)

	local second_after_fire = duel_view.cylinder_step_visual(resolution, 2, 0.50, false, 6, 0.42)
	assert_eq(second_after_fire.loaded, false, "consumed bullet hidden after fire")
	assert_eq(second_after_fire.slots[2], false, "second consumed chamber is empty")
	assert_eq(second_after_fire.slots[3], true, "unfired bullet remains visible")
end

return M
