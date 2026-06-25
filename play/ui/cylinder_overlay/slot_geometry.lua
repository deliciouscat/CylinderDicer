local M = {}

local TWO_PI = math.pi * 2

function M.slot_at(x, y, center_x, center_y, radius, slot_count)
	local dx = x - center_x
	local dy = y - center_y
	if math.sqrt(dx * dx + dy * dy) > radius then
		return nil
	end

	local sector = TWO_PI / slot_count
	local clockwise_from_top = math.atan2(dx, dy)
	if clockwise_from_top < 0 then
		clockwise_from_top = clockwise_from_top + TWO_PI
	end

	return math.floor((clockwise_from_top + sector * 0.5) / sector) % slot_count + 1
end

return M
