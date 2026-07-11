local M = {}

local components = {}

local function copy(value)
	if type(value) ~= "table" then
		return value
	end

	local result = {}
	for key, child in pairs(value) do
		result[key] = copy(child)
	end
	return result
end

function M.set(component, data)
	components[component] = copy(data or {})
end

function M.snapshot()
	return copy(components)
end

function M.clear()
	components = {}
end

return M
