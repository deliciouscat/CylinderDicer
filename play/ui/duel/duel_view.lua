local M = {}

function M.combat_pair_ids(duel, resolution, step)
	duel = duel or {}
	resolution = resolution or {}

	if resolution.kind == "perfect_duel" then
		return resolution.actor_id or duel.previous_bidder_id,
			step and step.target_id or duel.challenger_id
	end

	local left_id = resolution.shooter_id
		or (step and step.shooter_id)
		or duel.previous_bidder_id
	local right_id = resolution.target_id
		or (step and step.target_id)
		or duel.challenger_id
	return left_id, right_id
end

local function step_subject_id(step)
	return step and (step.roulette_subject_id or step.shooter_id or step.actor_id) or nil
end

function M.visible_bullets(player_id, player, base_player, resolution, step_index, step_progress, sequence_complete, apply_progress)
	local bullets = base_player and base_player.bullets or player and player.bullets or 0
	if not base_player then
		return math.max(0, bullets)
	end

	for index, step in ipairs((resolution and resolution.steps) or {}) do
		if index > step_index and not sequence_complete then
			break
		end
		local applied = sequence_complete
			or index < step_index
			or step_progress >= (apply_progress or 0.0)
		if applied and step.consumed == true and step_subject_id(step) == player_id then
			bullets = bullets - 1
		end
	end

	return math.max(0, bullets)
end

return M
