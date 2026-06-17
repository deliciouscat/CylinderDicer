local M = {}

local T = {
	reveal = 0.6,
	pan = 0.6,
	judge = 0.8,
	shot = 0.5,
}

function M.build(duel, judge, resolution)
	local steps = {}

	steps[#steps + 1] = {
		name = "reveal_dice",
		duration = T.reveal,
		payload = {
			players = duel.players or {},
		},
	}

	steps[#steps + 1] = {
		name = "pan_to_table",
		duration = T.pan,
		payload = {},
	}

	steps[#steps + 1] = {
		name = "judge",
		duration = T.judge,
		payload = judge or duel.judge,
		sound = "shot",
	}

	for _, shot in ipairs((resolution and resolution.steps) or {}) do
		steps[#steps + 1] = {
			name = "shot",
			duration = T.shot,
			payload = shot,
			sound = shot.hit and "hit" or "miss",
			needs_choice = shot.needs_choice == true,
		}
	end

	steps[#steps + 1] = {
		name = "complete",
		duration = 0,
		payload = {},
	}

	return steps
end

return M
