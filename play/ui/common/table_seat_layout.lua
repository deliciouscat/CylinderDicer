local M = {}

local DEFAULTS = {
	center_x = 0.0,
	arc_base_y = 42.0,
	arc_radius_x = 520.0,
	arc_radius_y = 165.0,
	start_angle = 20.0,
	end_angle = 160.0,
	character_offset_y = 94.0,
	local_character_y = 244.0,
	local_cup_y = 8.0,
}

local function option(options, key)
	if options and options[key] ~= nil then
		return options[key]
	end
	return DEFAULTS[key]
end

local function collect_opponents(player_order, local_player_id)
	local opponents = {}
	for _, player_id in ipairs(player_order or {}) do
		if player_id ~= local_player_id then
			opponents[#opponents + 1] = player_id
		end
	end
	return opponents
end

local function angle_for(index, count, start_angle, end_angle)
	if count <= 1 then
		return 90.0
	end
	local step = (end_angle - start_angle) / (count - 1)
	return end_angle - step * (index - 1)
end

local function depth_ratio(angle)
	return math.max(0.0, math.sin(math.rad(angle)))
end

function M.build(player_order, local_player_id, options)
	local opponents = collect_opponents(player_order, local_player_id)
	local start_angle = option(options, "start_angle")
	local end_angle = option(options, "end_angle")
	local center_x = option(options, "center_x")
	local base_y = option(options, "arc_base_y")
	local radius_x = option(options, "arc_radius_x")
	local radius_y = option(options, "arc_radius_y")
	local character_offset_y = option(options, "character_offset_y")
	local seats = {}

	for index, player_id in ipairs(opponents) do
		local angle = angle_for(index, #opponents, start_angle, end_angle)
		local radians = math.rad(angle)
		local depth = depth_ratio(angle)
		local x = center_x + math.cos(radians) * radius_x
		local cup_y = base_y + math.sin(radians) * radius_y

		seats[index] = {
			player_id = player_id,
			angle = angle,
			depth = depth,
			cup = {
				x = x,
				y = cup_y,
				scale = 0.54 - depth * 0.13,
			},
			character = {
				x = x,
				y = cup_y + character_offset_y,
				scale = 0.78 - depth * 0.17,
			},
		}
	end

	return {
		local_player_id = local_player_id,
		local_seat = {
			character = {
				x = center_x,
				y = option(options, "local_character_y"),
				scale = 1.0,
			},
			cup = {
				x = center_x,
				y = option(options, "local_cup_y"),
				scale = 1.0,
			},
		},
		opponents = seats,
	}
end

return M
