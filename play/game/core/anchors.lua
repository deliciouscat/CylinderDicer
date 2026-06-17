local M = {}

local registry = {}
local viewport = {
	w = 1280,
	h = 720,
	scale = 1,
}

local function vector3(x, y, z)
	if vmath and vmath.vector3 then
		return vmath.vector3(x, y, z)
	end
	return {
		x = x,
		y = y,
		z = z,
	}
end

local FALLBACK = vector3(-9999, -9999, 0)

function M.set_viewport(width, height, scale)
	viewport = {
		w = width or viewport.w,
		h = height or viewport.h,
		scale = scale or viewport.scale,
	}
end

function M.register(name, position, space)
	registry[name] = {
		pos = position,
		space = space or "gui",
	}
end

function M.resolve(name)
	local anchor = registry[name]
	if not anchor then
		return FALLBACK
	end

	return anchor.pos or FALLBACK
end

function M.clear()
	registry = {}
end

function M.viewport()
	return {
		w = viewport.w,
		h = viewport.h,
		scale = viewport.scale,
	}
end

return M
