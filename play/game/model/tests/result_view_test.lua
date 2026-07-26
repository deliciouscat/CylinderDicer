local result_view = require("ui.result.result_view")

local M = {}

local function assert_close(actual, expected, tolerance, label)
	if math.abs(actual - expected) > tolerance then
		error(("%s: expected %.4f, got %.4f"):format(label, expected, actual))
	end
end

local function assert_eq(actual, expected, label)
	if actual ~= expected then
		error(("%s: expected %s, got %s"):format(label, tostring(expected), tostring(actual)))
	end
end

function M.test_reel_duration_has_bounded_sigmoid_endpoints()
	assert_close(result_view.reel_duration(0), 0.75, 0.0001, "zero delta minimum")
	assert_close(result_view.reel_duration(8), 0.75, 0.0001, "eight delta minimum")
	assert_close(result_view.reel_duration(96), 4.0, 0.0001, "ninety-six delta maximum")
	assert_close(result_view.reel_duration(-200), 4.0, 0.0001, "absolute delta maximum")
	local midpoint = result_view.reel_duration(52)
	assert_close(midpoint, 2.375, 0.001, "normalized sigmoid midpoint")
end

function M.test_score_holds_then_eases_to_final_value()
	local score, complete = result_view.score_at(0.49, 1000, 1016)
	assert_eq(score, 1000, "half-second hold")
	assert_eq(complete, false, "hold incomplete")
	local duration = result_view.reel_duration(16)
	score, complete = result_view.score_at(0.5 + duration, 1000, 1016)
	assert_close(score, 1016, 0.0001, "final score")
	assert_eq(complete, true, "reel complete")
end

function M.test_local_result_selects_only_viewer_placement()
	local placement = result_view.local_result({
		match = {
			local_player_id = "local",
			result = {
				player_count = 4,
				placements = {
					{ player_id = "other", place = 1 },
					{ player_id = "local", place = 3, mmr_before = 1000, mmr_after = 994 },
				},
			},
		},
		players = { order = { "other", "local" } },
	})
	assert_eq(placement.place, 3, "local placement")
	assert_eq(placement.mmr_after, 994, "local rating")
end

return M
