local M = {}

M.MIN = 0.0
M.MAX = 100.0
M.IMPULSE = 24.0
M.DECAY_PER_SECOND = 12.0

local function clamp(value)
	return math.max(M.MIN, math.min(M.MAX, tonumber(value) or M.MIN))
end

function M.add(value, impulse)
	return clamp((tonumber(value) or M.MIN) + (tonumber(impulse) or M.IMPULSE))
end

function M.decay(value, dt, rate)
	local elapsed = math.max(0.0, tonumber(dt) or 0.0)
	local decay_rate = math.max(0.0, tonumber(rate) or M.DECAY_PER_SECOND)
	return clamp((tonumber(value) or M.MIN) - elapsed * decay_rate)
end

function M.ratio(value)
	return clamp(value) / M.MAX
end

function M.complete(value)
	return clamp(value) >= M.MAX
end

return M
