local M = {}

M.MIN_FACE = 1
M.MAX_FACE = 6
M.MIN_TABLE_VARIANT = 1
M.MAX_TABLE_VARIANT = 5

local function normalized_face(face)
	face = tonumber(face) or M.MIN_FACE
	return math.max(M.MIN_FACE, math.min(M.MAX_FACE, math.floor(face)))
end

local function normalized_integer(value, fallback)
	value = tonumber(value)
	if not value then
		return fallback
	end
	return math.floor(value)
end

function M.front_animation(face)
	return ("f%d_a0"):format(normalized_face(face))
end

function M.bid_animation(face)
	return M.front_animation(face)
end

function M.table_animation(face, die_index, round_index)
	face = normalized_face(face)
	die_index = normalized_integer(die_index, 1)
	round_index = normalized_integer(round_index, 0)

	-- Stable cosmetic randomness: changing face, die position, or round changes
	-- the angle without consuming the gameplay RNG or flickering on re-render.
	local seed = face * 73856093 + die_index * 19349663 + round_index * 83492791
	local variant = math.abs(seed) % M.MAX_TABLE_VARIANT + M.MIN_TABLE_VARIANT
	return ("f%d_a%d"):format(face, variant)
end

return M
