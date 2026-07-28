local M = {}

local TWO_PI = math.pi * 2.0
local LOCAL_REVEAL_DICE_ANCHOR_OFFSET_Y = 30.0
local LOCAL_REVEAL_DICE_WIDTH = 48.0
local LOCAL_REVEAL_DICE_HEIGHT = 52.0
local LOCAL_REVEAL_DICE_OFFSETS = {
	{ x = -67.0, y = -11.0 },
	{ x = -18.0, y = 23.0 },
	{ x = -1.0, y = -17.0 },
	{ x = 40.0, y = 17.0 },
	{ x = 68.0, y = -12.0 },
}
local REVEAL_DICE_DRAW_ORDER = { 2, 4, 1, 3, 5 }

local function clamp01(value)
	return math.max(0.0, math.min(1.0, value or 0.0))
end

local function ease_in_out(value)
	local t = clamp01(value)
	return t * t * (3.0 - 2.0 * t)
end

local function valid_slot_index(value, slot_count)
	local index = tonumber(value)
	if not index or index < 1 or index > slot_count or index % 1 ~= 0 then
		return nil
	end
	return index
end

function M.local_reveal_die_layout(cup_x, cup_y, die_index)
	local offset = LOCAL_REVEAL_DICE_OFFSETS[die_index]
	if not offset then
		return nil
	end
	return {
		x = (cup_x or 0.0) + offset.x,
		y = (cup_y or 0.0) - LOCAL_REVEAL_DICE_ANCHOR_OFFSET_Y + offset.y,
		width = LOCAL_REVEAL_DICE_WIDTH,
		height = LOCAL_REVEAL_DICE_HEIGHT,
	}
end

function M.reveal_dice_draw_order()
	local order = {}
	for index, die_index in ipairs(REVEAL_DICE_DRAW_ORDER) do
		order[index] = die_index
	end
	return order
end

local function cylinder_slots_at_step(resolution, step_index, step_progress, sequence_complete, slot_count, apply_progress)
	local slots = {}
	for index = 1, slot_count do
		slots[index] = resolution
			and resolution.cylinder_slots_before
			and resolution.cylinder_slots_before[index] == true
			or false
	end

	for index, previous_step in ipairs((resolution and resolution.steps) or {}) do
		if index > step_index then
			break
		end
		local applied = sequence_complete == true
			or index < step_index
			or clamp01(step_progress) >= (apply_progress or 0.42)
		local slot_index = valid_slot_index(previous_step.slot_index, slot_count)
		if applied and previous_step.consumed == true and slot_index then
			slots[slot_index] = false
		end
	end
	return slots
end

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

function M.cylinder_intro_angle(progress, slot_count)
	slot_count = math.max(1, slot_count or 6)
	local sector = TWO_PI / slot_count
	local previous_first_slot_angle = TWO_PI - sector
	return ease_in_out(progress) * (TWO_PI * 2.0 + previous_first_slot_angle)
end

function M.cylinder_step_visual(resolution, step_index, step_progress, sequence_complete, slot_count, apply_progress)
	slot_count = math.max(1, slot_count or 6)
	local steps = resolution and resolution.steps or {}
	local step = steps[step_index]
	if not step then
		return {
			visible = #steps > 0,
			slot_index = nil,
			loaded = false,
			angle = 0.0,
		}
	end

	local slot_index = valid_slot_index(step.slot_index, slot_count) or 1
	local previous_slot_index = slot_index - 1
	if previous_slot_index < 1 then
		previous_slot_index = slot_count
	end
	local previous_step = steps[step_index - 1]
	if previous_step then
		previous_slot_index = valid_slot_index(previous_step.slot_index, slot_count) or previous_slot_index
	end

	local sector = TWO_PI / slot_count
	local previous_angle = (previous_slot_index - 1) * sector
	local target_angle = (slot_index - 1) * sector
	while target_angle <= previous_angle do
		target_angle = target_angle + TWO_PI
	end
	local rotation_progress = ease_in_out(clamp01(step_progress) / 0.34)
	local angle = previous_angle + (target_angle - previous_angle) * rotation_progress
	local slots = cylinder_slots_at_step(
		resolution,
		step_index,
		step_progress,
		sequence_complete,
		slot_count,
		apply_progress
	)

	return {
		visible = true,
		slot_index = slot_index,
		slots = slots,
		loaded = slots[slot_index] == true,
		angle = angle,
	}
end

return M
