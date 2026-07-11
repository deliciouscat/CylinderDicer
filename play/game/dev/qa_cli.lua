local actions = require("game.model.actions")
local selectors = require("game.model.selectors")
local server_command = require("game.net.server_command")
local visual_status = require("game.dev.visual_status")

local M = {}

local COMMAND_FILE = "/tmp/cylinderdicer_qa_commands.txt"
local STATUS_FILE = "/tmp/cylinderdicer_qa_status.txt"
local PROTOCOL_VERSION = 1

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
		return false, result.error
	end
	return true, nil
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

local function is_alive(player)
	return player and not player.eliminated and (player.hp or 0) > 0
end

local function first_empty_slot(player)
	for index, slot in ipairs((player and player.cylinder and player.cylinder.slots) or {}) do
		if not slot.loaded then
			return index
		end
	end
	return nil
end

local function empty_slots(player)
	local slots = {}
	for index, slot in ipairs((player and player.cylinder and player.cylinder.slots) or {}) do
		if not slot.loaded then
			slots[#slots + 1] = index
		end
	end
	return slots
end

local function qa_load(self, slot_index, actor_id)
	local state = self.store:get_state()
	local pending = state.pending_load
	if not pending then
		print("[qa]", "no pending load")
		return false, "no_load_pending"
	end
	if actor_id and actor_id ~= pending.player_id then
		return false, "wrong_pending_player"
	end

	local player = state.players.by_id[pending.player_id]
	local slot = slot_index or first_empty_slot(player)
	if not slot then
		print("[qa]", "no empty cylinder slot")
		return false, "no_empty_slot"
	end

	if pending.source == "setup" then
		return dispatch(self, actions.setup_load_initial(pending.player_id, slot))
	end
	return dispatch(self, actions.bullet_load(slot, pending.player_id))
end

local function qa_load_all(self, actor_id)
	for _ = 1, 6 do
		local state = self.store:get_state()
		if not state.pending_load then
			return true, nil
		end
		local ok, err = qa_load(self, nil, actor_id)
		if not ok then
			return false, err
		end
	end
	return true, nil
end

local function qa_shake(self, count, actor_id)
	local state = self.store:get_state()
	local player_id = actor_id or state.match.local_player_id or state.turn.active_player_id
	if not is_alive(state.players.by_id[player_id]) then
		return false, "unknown_player"
	end
	local current = ((state.shake and state.shake.counts) or {})[player_id] or 0
	local required = (state.shake and state.shake.required_count) or 6
	local repeat_count = count or math.max(1, required - current)

	for _ = 1, repeat_count do
		local ok, err = dispatch(self, actions.shake_roll(player_id))
		if not ok then
			return false, err
		end
	end
	return true, nil
end

local function qa_shake_all(self)
	local order = self.store:get_state().players.order or {}
	for _, player_id in ipairs(order) do
		local state = self.store:get_state()
		local player = state.players.by_id[player_id]
		local shake = selectors.shake_status(state, player_id)
		if is_alive(player) and not shake.complete then
			local ok, err = qa_shake(self, nil, player_id)
			if not ok then
				return false, err
			end
		end
	end
	return true, nil
end

local function qa_check(self, player_id)
	local state = self.store:get_state()
	local id = player_id or state.match.local_player_id or state.turn.active_player_id
	return dispatch(self, actions.dice_check(id))
end

local function qa_check_all(self)
	local order = self.store:get_state().players.order or {}
	for _, player_id in ipairs(order) do
		local state = self.store:get_state()
		local player = state.players.by_id[player_id]
		if is_alive(player) and not state.shake.checked[player_id] then
			local ok, err = qa_check(self, player_id)
			if not ok then
				return false, err
			end
		end
	end
	return true, nil
end

local function qa_bid(self, count, face, actor_id)
	local state = self.store:get_state()
	if actor_id and actor_id ~= state.turn.active_player_id then
		return false, "wrong_active_player"
	end
	local bid = {
		player_id = actor_id or state.turn.active_player_id,
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
		return qa_shake_all(self)
	end
	if phase == "dice_check" then
		return qa_check_all(self)
	end
	if phase == "bidding_gap" then
		return dispatch(self, actions.bidding_open())
	end
	if phase == "bidding" then
		return qa_bid(self)
	end
	if phase == "duel" then
		if state.duel and not state.duel.resolution then
			return dispatch(self, actions.duel_execute())
		end
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

local function suggested_bid(state)
	local current = state.bidding.current_bid
	if not current then
		return {
			count = math.max(1, state.bidding.my_bid.count or 1),
			face = math.max(1, state.bidding.my_bid.face or 1),
		}
	end
	if current.face < 6 then
		return {
			count = current.count,
			face = current.face + 1,
		}
	end
	return {
		count = math.min(36, current.count + 1),
		face = 1,
	}
end

local function available_actions(state, player_id)
	local result = {}
	local phase = selectors.phase(state)
	local pending = state.pending_load

	if pending and pending.player_id == player_id then
		local player = state.players.by_id[player_id]
		result[#result + 1] = {
			type = "load",
			slots = empty_slots(player),
			remaining = pending.count,
		}
		result[#result + 1] = {
			type = "load_all",
			remaining = pending.count,
		}
		return result
	end

	if phase == "cup_shake" then
		local player = state.players.by_id[player_id]
		local shake = selectors.shake_status(state, player_id)
		if is_alive(player) and not shake.complete then
			result[#result + 1] = {
				type = "shake",
				remaining = math.max(0, shake.required - shake.count),
			}
		end
	elseif phase == "dice_check" then
		local player = state.players.by_id[player_id]
		if is_alive(player) and not state.shake.checked[player_id] then
			result[#result + 1] = { type = "check" }
		end
	elseif player_id ~= state.turn.active_player_id then
		return result
	elseif phase == "bidding_gap" then
		result[#result + 1] = { type = "open" }
	elseif phase == "bidding" then
		result[#result + 1] = {
			type = "bid",
			min_count = 1,
			max_count = 36,
			min_face = 1,
			max_face = 6,
			suggested = suggested_bid(state),
		}
		if state.bidding.current_bid then
			result[#result + 1] = { type = "challenge" }
		end
	elseif phase == "duel" then
		result[#result + 1] = {
			type = "resolve",
			stage = state.duel and state.duel.resolution and "advance" or "execute",
		}
	end

	return result
end

function M.status_snapshot(state)
	local players = {}
	for _, player_id in ipairs(state.players.order or {}) do
		local player = state.players.by_id[player_id]
		local slots = {}
		for index, slot in ipairs((player.cylinder and player.cylinder.slots) or {}) do
			slots[index] = slot.loaded == true
		end
		players[#players + 1] = {
			id = player.id,
			name = player.name,
			is_local = player.id == state.match.local_player_id,
			is_active = player.id == state.turn.active_player_id,
			hp = player.hp,
			eliminated = player.eliminated == true,
			bullets = player.bullets or 0,
			dice = player.dice or {},
			cylinder = {
				slots = slots,
				chamber_index = player.cylinder and player.cylinder.chamber_index or 1,
			},
			available_actions = available_actions(state, player_id),
		}
	end

	return {
		protocol_version = PROTOCOL_VERSION,
		phase = selectors.phase(state),
		hud = selectors.hud_kind(state),
		match = {
			id = state.match.match_id,
			status = state.match.status,
			mode = state.match.mode,
			local_player_id = state.match.local_player_id,
			turn_count = state.match.turn_count,
			events_hash = state.match.events_hash,
			winner_id = state.match.winner_id,
		},
		turn = {
			active_player_id = state.turn.active_player_id,
			previous_player_id = state.turn.previous_player_id,
			round_index = state.turn.round_index,
			is_first_shake = state.turn.is_first_shake,
		},
		bidding = {
			current_bid = state.bidding.current_bid,
			suggested_bid = suggested_bid(state),
		},
		pending_load = state.pending_load,
		shake = state.shake,
		duel = state.duel and {
			phase = state.duel.phase,
			bid = state.duel.bid,
			judge = state.duel.judge,
			challenger_id = state.duel.challenger_id,
			previous_bidder_id = state.duel.previous_bidder_id,
			players = state.duel.players,
			resolution = state.duel.resolution and {
				kind = state.duel.resolution.kind,
				verdict = state.duel.resolution.verdict,
				target_id = state.duel.resolution.target_id,
				roulette_subject_id = state.duel.resolution.roulette_subject_id,
				actor_id = state.duel.resolution.actor_id,
				steps = state.duel.resolution.steps,
				hp_changes = state.duel.resolution.hp_changes,
			} or nil,
		} or nil,
		net = {
			server_command = server_command.snapshot(state),
		},
		visual = visual_status.snapshot(),
		players = players,
	}
end

local function status_signature(self, state)
	return table.concat({
		tostring(state.match.events_hash),
		state_summary(state),
		tostring(self.last_command and self.last_command.id or "-"),
		tostring(self.last_command and self.last_command.ok or "-"),
		tostring(self.last_command and self.last_command.error or "-"),
	}, "|")
end

local function write_status(self)
	local state = self.store:get_state()
	local signature = status_signature(self, state)
	if self.last_status == signature then
		return
	end

	self.last_status = signature
	self.revision = self.revision + 1
	local snapshot = M.status_snapshot(state)
	snapshot.revision = self.revision
	snapshot.generated_at = os.time()
	snapshot.last_command = self.last_command

	local next_file = STATUS_FILE .. ".next"
	local file = io.open(next_file, "w")
	if file then
		file:write(json.encode(snapshot) .. "\n")
		file:close()
		os.rename(next_file, STATUS_FILE)
	end
end

local function validate_actor(state, actor_id)
	if not actor_id or not state.players.by_id[actor_id] then
		return false, "unknown_actor"
	end
	return true, nil
end

local function process_json_command(self, command)
	local state = self.store:get_state()
	local actor_id = command.actor_id
	local action = lower(command.action)
	local payload = command.payload or {}
	if action == "status" then
		return true, nil
	end

	local actor_ok, actor_err = validate_actor(state, actor_id)
	if not actor_ok then
		return false, actor_err
	end

	if action == "load" then
		return qa_load(self, number_or_nil(payload.slot_index), actor_id)
	elseif action == "load_all" then
		return qa_load_all(self, actor_id)
	elseif action == "shake" then
		return qa_shake(self, number_or_nil(payload.count), actor_id)
	elseif action == "check" then
		return qa_check(self, actor_id)
	elseif action == "open" then
		if actor_id ~= state.turn.active_player_id then
			return false, "wrong_active_player"
		end
		return dispatch(self, actions.bidding_open())
	elseif action == "bid" then
		return qa_bid(self, number_or_nil(payload.count), number_or_nil(payload.face), actor_id)
	elseif action == "challenge" then
		if actor_id ~= state.turn.active_player_id then
			return false, "wrong_active_player"
		end
		return dispatch(self, actions.bid_challenge())
	elseif action == "resolve" then
		if actor_id ~= state.turn.active_player_id then
			return false, "wrong_active_player"
		end
		if state.duel and not state.duel.resolution then
			return dispatch(self, actions.duel_execute())
		end
		return dispatch(self, actions.round_advance())
	elseif action == "advance" then
		if actor_id ~= state.turn.active_player_id then
			return false, "wrong_active_player"
		end
		return qa_advance(self)
	end

	return false, "unknown_action"
end

local function process_legacy_command(self, stripped)
	stripped = trim((stripped:gsub("#.*$", "")))
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
		local next_state = self.store:get_state()
		if next_state.duel and not next_state.duel.resolution then
			dispatch(self, actions.duel_execute())
		else
			dispatch(self, actions.round_advance())
		end
	elseif command == "who" then
		local player = current_player(state)
		print("[qa]", player and player.name or state.turn.active_player_id)
	else
		print("[qa]", "unknown command", command)
	end
	write_status(self)
end

local function process(self, line)
	local stripped = trim(line)
	if stripped == "" then
		return
	end

	if stripped:sub(1, 1) ~= "{" then
		process_legacy_command(self, stripped)
		return
	end

	local ok, command = pcall(json.decode, stripped)
	if not ok or type(command) ~= "table" then
		self.last_command = {
			id = "decode-error",
			ok = false,
			error = "invalid_json",
		}
		write_status(self)
		return
	end

	local command_ok, command_err = process_json_command(self, command)
	self.last_command = {
		id = command.id or "anonymous",
		actor_id = command.actor_id,
		action = command.action,
		ok = command_ok == true,
		error = command_err,
	}
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
				status_file:write('{"protocol_version":1,"phase":"booting"}\n')
				status_file:close()
			end
	end

	print("[qa]", "command file:", COMMAND_FILE)
	print("[qa]", "status file:", STATUS_FILE)
	print("[qa]", "try: echo state >> " .. COMMAND_FILE)

		return {
			store = store,
			last_status = nil,
			last_command = nil,
			revision = 0,
		}
end

-- Web QA path: standalone 번들 전용 local reducer smoke tool.
-- GameBridge의 QA_COMMAND 메시지로 도착한 명령을 처리하고, 파일 대신 상태
-- 스냅샷을 반환한다 (호출측이 QA_STATUS로 emit).
-- Convex 경유 dev match(/play/dev?matchId=...)도 mode == "dev"이므로,
-- 서버 권위 경로의 render cache 오염을 막기 위해 local_simulator까지 요구한다.
function M.process_bridge_command(self, command)
	local state = self.store:get_state()
	if not state.match or state.match.mode ~= "dev" then
		return nil
	end

	local action = lower(command.action)
	if action ~= "status" and state.match.local_simulator ~= true then
		return nil
	end

	local command_ok, command_err = process_json_command(self, command)
	self.last_command = {
		id = command.id or "anonymous",
		actor_id = command.actor_id,
		action = command.action,
		ok = command_ok == true,
		error = command_err,
	}

	local snapshot = M.status_snapshot(self.store:get_state())
	self.revision = self.revision + 1
	snapshot.revision = self.revision
	snapshot.generated_at = os.time()
	snapshot.last_command = self.last_command
	return snapshot
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
