local actions = require("game.model.actions")
local selectors = require("game.model.selectors")

local M = {}

local COMMAND_FILE = "/tmp/cylinderdicer_qa_commands.txt"
local STATUS_FILE = "/tmp/cylinderdicer_qa_status.txt"

local function trim(value)
	return (value or ""):match("^%s*(.-)%s*$")
end

local function split(line)
	local tokens = {}
	for token in line:gmatch("%S+") do
		tokens[#tokens + 1] = token
	end
	return tokens
end

local function lower(value)
	return string.lower(tostring(value or ""))
end

local function number_or_nil(value)
	local parsed = tonumber(value)
	if parsed then
		return parsed
	end
	return nil
end

local function dispatch(self, action)
	local result = self.store:dispatch(action)
	if result and not result.ok then
		print("[qa]", "error", result.error)
		return false
	end
	return true
end

local function state_summary(state)
	local bid = state.bidding.current_bid
	local pending = state.pending_load
	local parts = {
		"phase=" .. tostring(selectors.phase(state)),
		"hud=" .. tostring(selectors.hud_kind(state)),
		"turn=" .. tostring(state.turn.active_player_id),
		"prev=" .. tostring(state.turn.previous_player_id),
		"local=" .. tostring(state.match.local_player_id),
	}

	if bid then
		parts[#parts + 1] = ("bid=%s:%sx%s"):format(bid.player_id, tostring(bid.count), tostring(bid.face))
	end

	if pending then
		parts[#parts + 1] = ("pending=%s:%s:%s"):format(pending.player_id, pending.source, tostring(pending.count))
	end
	if selectors.is_hud(state, "bidding") then
		parts[#parts + 1] = "can_bid=true"
	end
	if selectors.phase(state) == "cup_shake" then
		local player_id = state.match.local_player_id
		local shake = selectors.shake_status(state, player_id)
		parts[#parts + 1] = ("shake=%s/%s"):format(
			tostring(shake.count),
			tostring(shake.required)
		)
	end

	return table.concat(parts, " ")
end

local function current_player(state)
	return state.players.by_id[state.turn.active_player_id]
end

local function first_empty_slot(player)
	for index, slot in ipairs((player and player.cylinder and player.cylinder.slots) or {}) do
		if not slot.loaded then
			return index
		end
	end
	return nil
end

local function qa_load(self, slot_index)
	local state = self.store:get_state()
	local pending = state.pending_load
	if not pending then
		print("[qa]", "no pending load")
		return false
	end

	local player = state.players.by_id[pending.player_id]
	local slot = slot_index or first_empty_slot(player)
	if not slot then
		print("[qa]", "no empty cylinder slot")
		return false
	end

	if pending.source == "setup" then
		return dispatch(self, actions.setup_load_initial(pending.player_id, slot))
	end
	return dispatch(self, actions.bullet_load(slot, pending.player_id))
end

local function qa_load_all(self)
	for _ = 1, 6 do
		local state = self.store:get_state()
		if not state.pending_load then
			return true
		end
		if not qa_load(self) then
			return false
		end
	end
	return true
end

local function qa_shake(self, count)
	local state = self.store:get_state()
	local player_id = state.turn.active_player_id
	local current = ((state.shake and state.shake.counts) or {})[player_id] or 0
	local required = (state.shake and state.shake.required_count) or 6
	local repeat_count = count or math.max(1, required - current)

	for _ = 1, repeat_count do
		if not dispatch(self, actions.shake_roll(player_id)) then
			return false
		end
	end
	return true
end

local function qa_check(self, player_id)
	local state = self.store:get_state()
	local id = player_id or state.match.local_player_id or state.turn.active_player_id
	return dispatch(self, actions.dice_check(id))
end

local function qa_bid(self, count, face)
	local state = self.store:get_state()
	local bid = {
		player_id = state.turn.active_player_id,
		count = count or state.bidding.my_bid.count,
		face = face or state.bidding.my_bid.face,
	}
	return dispatch(self, actions.bid_raise(bid))
end

local function qa_advance(self)
	local state = self.store:get_state()
	local phase = selectors.phase(state)

	if state.pending_load then
		return qa_load_all(self)
	end
	if phase == "cup_shake" then
		return qa_shake(self)
	end
	if phase == "dice_check" then
		return qa_check(self)
	end
	if phase == "bidding_gap" then
		return dispatch(self, actions.bidding_open())
	end
	if phase == "bidding" then
		return qa_bid(self)
	end
	if phase == "duel" then
		return dispatch(self, actions.round_advance())
	end

	print("[qa]", "no advance for", phase)
	return false
end

local function qa_to_bidding(self)
	for _ = 1, 10 do
		if selectors.phase(self.store:get_state()) == "bidding" then
			return true
		end
		if not qa_advance(self) then
			return false
		end
	end
	return selectors.phase(self.store:get_state()) == "bidding"
end

local function write_status(self)
	local summary = state_summary(self.store:get_state())
	if self.last_status == summary then
		return
	end

	self.last_status = summary
	local file = io.open(STATUS_FILE, "w")
	if file then
		file:write(summary .. "\n")
		file:close()
	end
end

local function process(self, line)
	local stripped = trim((line:gsub("#.*$", "")))
	if stripped == "" then
		return
	end

	local tokens = split(stripped)
	local command = lower(tokens[1])
	local state = self.store:get_state()

	if command == "help" then
		print("[qa]", "commands: state, advance, bidding, reload, load [slot], load-all, shake [n], check [player], open, count <n|+|->, face <n|up|down>, bid [count] [face], pass, challenge, resolve")
	elseif command == "state" then
		print("[qa]", state_summary(state))
	elseif command == "advance" then
		qa_advance(self)
	elseif command == "bidding" or command == "to-bidding" then
		qa_to_bidding(self)
	elseif command == "load" then
		qa_load(self, number_or_nil(tokens[2]))
	elseif command == "load-all" or command == "reload" then
		qa_load_all(self)
	elseif command == "shake" then
		qa_shake(self, number_or_nil(tokens[2]))
	elseif command == "check" then
		qa_check(self, tokens[2])
	elseif command == "open" then
		if selectors.phase(self.store:get_state()) == "bidding_gap" then
			dispatch(self, actions.bidding_open())
		else
			qa_to_bidding(self)
		end
	elseif command == "count" then
		local bid = state.bidding.my_bid
		local value = tokens[2]
		if value == "+" then
			dispatch(self, actions.bid_select_count(bid.count + 1))
		elseif value == "-" then
			dispatch(self, actions.bid_select_count(bid.count - 1))
		else
			dispatch(self, actions.bid_select_count(number_or_nil(value) or bid.count))
		end
	elseif command == "face" then
		local bid = state.bidding.my_bid
		local value = lower(tokens[2])
		if value == "up" or value == "+" then
			dispatch(self, actions.bid_select_face(bid.face + 1))
		elseif value == "down" or value == "-" then
			dispatch(self, actions.bid_select_face(bid.face - 1))
		else
			dispatch(self, actions.bid_select_face(number_or_nil(value) or bid.face))
		end
	elseif command == "bid" or command == "pass" then
		if selectors.phase(self.store:get_state()) ~= "bidding" then
			qa_to_bidding(self)
		end
		qa_bid(self, number_or_nil(tokens[2]), number_or_nil(tokens[3]))
	elseif command == "challenge" then
		if self.store:get_state().pending_load then
			qa_load_all(self)
		end
		if selectors.phase(self.store:get_state()) ~= "bidding" then
			qa_to_bidding(self)
		end
		dispatch(self, actions.bid_challenge())
	elseif command == "resolve" then
		dispatch(self, actions.round_advance())
	elseif command == "who" then
		local player = current_player(state)
		print("[qa]", player and player.name or state.turn.active_player_id)
	else
		print("[qa]", "unknown command", command)
	end
	write_status(self)
end

function M.new(store)
	if io and io.open then
		local command_file = io.open(COMMAND_FILE, "w")
		if command_file then
			command_file:close()
		end
		local status_file = io.open(STATUS_FILE, "w")
		if status_file then
			status_file:write("booting\n")
			status_file:close()
		end
	end

	print("[qa]", "command file:", COMMAND_FILE)
	print("[qa]", "status file:", STATUS_FILE)
	print("[qa]", "try: echo state >> " .. COMMAND_FILE)

	return {
		store = store,
		last_status = nil,
	}
end

function M.poll(self)
	if not self.store or not io or not io.open then
		return
	end

	local state = self.store:get_state()
	if not state.match or state.match.mode ~= "dev" then
		return
	end
	write_status(self)

	local file = io.open(COMMAND_FILE, "r")
	if not file then
		return
	end

	local chunk = file:read("*a") or ""
	file:close()
	if chunk == "" then
		return
	end

	local clear = io.open(COMMAND_FILE, "w")
	if clear then
		clear:close()
	end

	for line in chunk:gmatch("[^\r\n]+") do
		process(self, line)
	end
	write_status(self)
end

return M
