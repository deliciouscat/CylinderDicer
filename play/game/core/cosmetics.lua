local M = {}

local DEFAULT = "default"
local state = {
	dice = DEFAULT,
	cup = DEFAULT,
	revolver = DEFAULT,
	rail = DEFAULT,
	background = DEFAULT,
	characters = DEFAULT,
}

local KEY_MAP = {
	diceSkin = "dice",
	cupSkin = "cup",
	revolverSkin = "revolver",
	railSkin = "rail",
	backgroundSkin = "background",
	characterSkin = "characters",
	dice = "dice",
	cup = "cup",
	revolver = "revolver",
	rail = "rail",
	background = "background",
	characters = "characters",
}

local function copy(t)
	local next = {}
	for key, value in pairs(t or {}) do
		next[key] = value
	end
	return next
end

function M.apply(payload)
	payload = payload or {}

	for external_key, internal_key in pairs(KEY_MAP) do
		if payload[external_key] then
			state[internal_key] = payload[external_key]
		end
	end

	return copy(state)
end

function M.current()
	return copy(state)
end

function M.resolve(kind, skin_id, name)
	local id = skin_id or state[kind] or DEFAULT
	local file_name = name or "image"
	local path = ("/assets/images/%s/%s/%s.png"):format(kind, id, file_name)

	return {
		path = path,
		atlas = nil,
		animation = file_name,
		fallback = id == DEFAULT,
	}
end

return M
