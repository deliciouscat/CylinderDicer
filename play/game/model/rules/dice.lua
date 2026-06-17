local M = {}

M.SKULL_FACE = 1

local fallback_seed = 12345

local function fallback_int(min, max)
	fallback_seed = (fallback_seed * 1103515245 + 12345) % 2147483647
	return min + (fallback_seed % (max - min + 1))
end

local function rng_int(rng, min, max)
	if rng and type(rng.int) == "function" then
		return rng:int(min, max)
	end

	if rng and type(rng.random) == "function" then
		return rng:random(min, max)
	end

	if math.random then
		return math.random(min, max)
	end

	return fallback_int(min, max)
end

function M.roll(count, rng)
	local values = {}
	for i = 1, count do
		values[i] = rng_int(rng, 1, 6)
	end
	return values
end

function M.count_face(players, face)
	local total = 0

	for _, player in pairs(players.by_id or {}) do
		if not player.eliminated then
			for _, value in ipairs(player.dice or {}) do
				if value == face then
					total = total + 1
				end
			end
		end
	end

	return total
end

function M.display_kind(face)
	if face == M.SKULL_FACE then
		return "skull"
	end
	return "pip"
end

return M
