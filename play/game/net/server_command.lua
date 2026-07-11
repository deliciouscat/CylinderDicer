local bridge = require("main.game_bridge")

local M = {}

local counter = 0
local pending_command = nil

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

function M.submit(state, command_type, payload)
	if not bridge.is_web() then
		return { status = "local" }
	end
	if state and state.match and state.match.local_simulator == true then
		return { status = "local" }
	end
	if M.is_pending(state) then
		return {
			status = "busy",
			pending = M.snapshot(state),
		}
	end

	local command_id = next_command_id(command_type)
	local revision = state and state.match and state.match.revision
	bridge.emit("PLAYER_COMMAND", {
		commandId = command_id,
		matchId = match_id(state),
		revision = revision,
		type = command_type,
		payload = payload or {},
	})
	pending_command = {
		command_id = command_id,
		type = command_type,
		revision = tonumber(revision) or 0,
	}
	return {
		status = "sent",
		command_id = command_id,
		revision = pending_command.revision,
	}
end

function M.emit(state, command_type, payload)
	return M.submit(state, command_type, payload).status ~= "local"
end

function M.is_pending(state)
	if not pending_command then
		return false
	end
	local current_revision = tonumber(state and state.match and state.match.revision) or 0
	if current_revision > (pending_command.revision or 0) then
		pending_command = nil
		return false
	end
	return true
end

function M.resolve(revision)
	if not pending_command then
		return
	end
	local resolved_revision = tonumber(revision)
	if not resolved_revision or resolved_revision > (pending_command.revision or 0) then
		pending_command = nil
	end
end

function M.clear_pending()
	pending_command = nil
end

function M.snapshot(state)
	return {
		pending = pending_command ~= nil,
		command_id = pending_command and pending_command.command_id or nil,
		type = pending_command and pending_command.type or nil,
		revision = pending_command and pending_command.revision or nil,
		current_revision = tonumber(state and state.match and state.match.revision) or 0,
	}
end

return M
