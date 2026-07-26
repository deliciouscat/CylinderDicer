local duel_view = require("ui.duel.duel_view")

local M = {}

local function assert_eq(actual, expected, label)
	if actual ~= expected then
		error((label or "assert_eq") .. ": expected " .. tostring(expected) .. ", got " .. tostring(actual), 2)
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

return M
