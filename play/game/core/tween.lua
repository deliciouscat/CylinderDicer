local M = {}

local EASINGS = {}

function EASINGS.linear(t)
	return t
end

function EASINGS.in_out_quad(t)
	if t < 0.5 then
		return 2 * t * t
	end
	return -1 + ((4 - (2 * t)) * t)
end

function M.to(target, property, value, duration, easing, on_complete)
	if go and go.animate then
		go.animate(
			target,
			property,
			go.PLAYBACK_ONCE_FORWARD,
			value,
			easing or go.EASING_INOUTQUAD,
			duration or 0,
			0,
			on_complete
		)
	elseif on_complete then
		on_complete()
	end
end

function M.lerp(from, to, t)
	return from + ((to - from) * t)
end

function M.ease(name, t)
	local fn = EASINGS[name] or EASINGS.linear
	return fn(t)
end

return M
