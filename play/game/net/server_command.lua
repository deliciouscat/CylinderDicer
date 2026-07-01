local bridge = require("main.game_bridge")

local M = {}

local counter = 0

local function next_command_id(command_type)
	counter = counter + 1
	return table.concat({
		"defold",
		tostring(os.time()),
		tostring(counter),
		tostring(command_type),
	}, "-")
end

local function match_id(state)
	return state and state.match and state.match.match_id or nil
end

function M.emit(state, command_type, payload)
	if not bridge.is_web() then
		return false
	end
	if state and state.match and state.match.local_simulator == true then
		return false
	end

	bridge.emit("PLAYER_COMMAND", {
		commandId = next_command_id(command_type),
		matchId = match_id(state),
		revision = state and state.match and state.match.revision,
		type = command_type,
		payload = payload or {},
	})
	return true
end

return M
