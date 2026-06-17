local actions = require "game.model.actions"
local selectors = require "game.model.selectors"

local M = {}
M.__index = M

local function camel_or_snake(payload, camel, snake)
	return payload[snake] or payload[camel]
end

local function mock_players(local_player_id)
	return {
		{
			id = local_player_id,
			name = "You",
			hp = 3,
			dice_count = 5,
			skin = "rosemund",
		},
		{
			id = "opponent-1",
			name = "Hush Feather",
			hp = 3,
			dice_count = 5,
			skin = "hush-feather",
			initial_loaded_slots = { 1, 3, 5 },
		},
		{
			id = "opponent-2",
			name = "Samuel Saber",
			hp = 3,
			dice_count = 5,
			skin = "samuel-saber",
			initial_loaded_slots = { 1, 3, 5 },
		},
		{
			id = "opponent-3",
			name = "Calamity Kate",
			hp = 3,
			dice_count = 5,
			skin = "calamity-kate",
			initial_loaded_slots = { 1, 3, 5 },
		},
	}
end

local function normalize_players(payload, local_player_id)
	local players = payload.players
	if not players or #players == 0 then
		return mock_players(local_player_id)
	end

	local normalized = {}
	for i, player in ipairs(players) do
		normalized[i] = {}
		for key, value in pairs(player) do
			normalized[i][key] = value
		end

		normalized[i].id = normalized[i].id or normalized[i].playerId or normalized[i].player_id
		if normalized[i].id ~= local_player_id and not normalized[i].initial_loaded_slots and not normalized[i].cylinder then
			normalized[i].initial_loaded_slots = { 1, 3, 5 }
		end
	end

	return normalized
end

local function to_internal(payload, cosmetics)
	local local_player_id = camel_or_snake(payload, "playerId", "player_id") or "local-player"

	return {
		session_id = camel_or_snake(payload, "sessionId", "session_id"),
		match_id = camel_or_snake(payload, "matchId", "match_id"),
		local_player_id = local_player_id,
		mode = payload.mode or "casual",
		locale = payload.locale or "ko",
		cosmetics = cosmetics or {},
		players = normalize_players(payload, local_player_id),
		first_player_id = payload.firstPlayerId or payload.first_player_id or local_player_id,
		requires_setup_load = payload.requiresSetupLoad ~= false and payload.requires_setup_load ~= false,
	}
end

local HANDLERS = {}

function HANDLERS.START_MATCH(self, payload)
	payload = payload or {}
	local cosmetics = self.cosmetics.apply(payload.cosmetics or {})
	local internal = to_internal(payload, cosmetics)
	local result = self.store:dispatch(actions.match_init(internal))

	if result.ok then
		self.bridge.emit("MATCH_READY", {
			matchId = internal.match_id,
			mode = internal.mode,
		})
	else
		self.bridge.emit("UNKNOWN_MESSAGE", {
			type = "START_MATCH",
			error = result.error,
		})
	end
end

function HANDLERS.SET_COSMETICS(self, payload)
	payload = payload or {}
	local raw = payload.cosmetics or payload
	local cosmetics = self.cosmetics.apply(raw)
	self.store:dispatch(actions.cosmetics_apply(cosmetics))
	self.bridge.emit("COSMETICS_APPLIED", {
		cosmetics = cosmetics,
	})
end

function HANDLERS.PING(self)
	self.bridge.emit("PONG")
end

function M.new(bridge, store, cosmetics)
	return setmetatable({
		bridge = bridge,
		store = store,
		cosmetics = cosmetics,
	}, M)
end

function M:on_bridge_message(message)
	message = message or {}
	local message_type = message.type
	local handler = HANDLERS[message_type]

	if handler then
		handler(self, message.payload or message)
	else
		self.bridge.emit("UNKNOWN_MESSAGE", {
			type = message_type,
		})
	end
end

function M:submit_result()
	self.bridge.emit("SUBMIT_MATCH_RESULT", selectors.match_result_payload(self.store:get_state()))
end

function M.to_internal(payload, cosmetics)
	return to_internal(payload or {}, cosmetics or {})
end

return M
