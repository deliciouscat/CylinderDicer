local M = {}

local cache = {}
local current = "ko"

local function decode_flat_json(text)
	local data = {}
	if not text then
		return data
	end

	for key, value in text:gmatch('"([^"]+)"%s*:%s*"([^"]*)"') do
		value = value:gsub('\\"', '"')
		data[key] = value
	end

	return data
end

local function load_resource(path)
	if sys and sys.load_resource then
		local ok, content = pcall(sys.load_resource, path)
		if ok then
			return content
		end
	end

	local file = io and io.open and io.open("play" .. path, "r")
	if not file and io and io.open then
		file = io.open(path:gsub("^/", ""), "r")
	end
	if not file then
		return nil
	end

	local content = file:read("*a")
	file:close()
	return content
end

local function load_locale(locale)
	local content = load_resource("/assets/locale/" .. locale .. ".json")
	if not content then
		return {}
	end

	if json and json.decode then
		local ok, decoded = pcall(json.decode, content)
		if ok and decoded then
			return decoded
		end
	end

	return decode_flat_json(content)
end

function M.set_locale(locale)
	current = locale or "ko"
	cache[current] = cache[current] or load_locale(current)
end

function M.get_locale()
	return current
end

function M.t(key, params)
	cache[current] = cache[current] or load_locale(current)
	local template = cache[current][key]
	if not template then
		return "[[" .. tostring(key) .. "]]"
	end

	return (template:gsub("{(%w+)}", function(name)
		local value = params and params[name]
		if value == nil then
			return "{" .. name .. "}"
		end
		return tostring(value)
	end))
end

return M
