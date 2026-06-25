local dice = require("game.model.rules.dice")
local cylinder = require("game.model.rules.cylinder")

local M = {}

M.VERDICT = {
	SHORT = "SHORT",
	OVER = "OVER",
	EXACT = "EXACT",
}

function M.judge(bid, players)
	local actual = dice.count_face(players, bid.face)
	local raw_delta = actual - bid.count
	local verdict = M.VERDICT.EXACT

	if raw_delta < 0 then
		verdict = M.VERDICT.SHORT
	elseif raw_delta > 0 then
		verdict = M.VERDICT.OVER
	end

	return {
		verdict = verdict,
		actual = actual,
		delta = math.abs(raw_delta),
		raw_delta = raw_delta,
	}
end

local function player_snapshot(player)
	local copy = {}
	for key, value in pairs(player or {}) do
		if key ~= "cylinder" and key ~= "dice" then
			copy[key] = value
		end
	end
	copy.dice = {}
	for i, value in ipairs(player.dice or {}) do
		copy.dice[i] = value
	end
	return copy
end

local function is_alive(player)
	return player and not player.eliminated and (player.hp or 0) > 0
end

local function target_order_from_challenger(players, challenger_id, actor_id)
	local order = players.order or {}
	local start_index = 1
	local targets = {}

	for i, player_id in ipairs(order) do
		if player_id == challenger_id then
			start_index = i
			break
		end
	end

	for offset = 0, #order - 1 do
		local player_id = order[((start_index + offset - 1) % #order) + 1]
		local player = players.by_id[player_id]
		if player_id ~= actor_id and is_alive(player) then
			targets[#targets + 1] = player_id
		end
	end

	return targets
end

function M.begin(state, challenger_id, previous_id)
	local bid = state.bidding.current_bid
	local judge = M.judge(bid, state.players)
	local players = {}

	for _, player_id in ipairs(state.players.order or {}) do
		players[#players + 1] = player_snapshot(state.players.by_id[player_id])
	end

	return {
		phase = "ready",
		bid = {
			player_id = bid.player_id,
			count = bid.count,
			face = bid.face,
		},
		challenger_id = challenger_id,
		previous_bidder_id = previous_id or bid.player_id,
		players = players,
		judge = judge,
		resolution = nil,
	}
end

function M.spin_revolver(state, duel_state, steps)
	local player_id = duel_state.previous_bidder_id
	if duel_state.judge.verdict == M.VERDICT.SHORT then
		player_id = duel_state.challenger_id
	end

	local player = state.players.by_id[player_id]
	if not player then
		return nil
	end

	player.cylinder = cylinder.spin(player.cylinder, steps)
	return {
		player_id = player_id,
		steps = steps,
	}
end

local function apply_hp_changes(players, hp_changes)
	for player_id, delta in pairs(hp_changes or {}) do
		local player = players.by_id[player_id]
		if player then
			player.hp = math.max(0, (player.hp or 0) + delta)
			player.eliminated = player.hp <= 0
		end
	end
end

local function resolve_duel_shots(state, duel_state)
	local judge = duel_state.judge
	local challenger_id = duel_state.challenger_id
	local previous_id = duel_state.previous_bidder_id
	local target_id = previous_id

	if judge.verdict == M.VERDICT.SHORT then
		target_id = challenger_id
	end

	local target = state.players.by_id[target_id]
	local steps = {}
	local hp_changes = {}

	if target then
		local next_cylinder, shots = cylinder.trigger(target.cylinder, judge.delta)
		target.cylinder = next_cylinder

		for _, shot in ipairs(shots) do
			steps[#steps + 1] = {
				kind = "roulette",
				target_id = target_id,
				roulette_subject_id = target_id,
				hit = shot.hit,
				slot_index = shot.slot_index,
				consumed = shot.consumed,
			}

			if shot.hit then
				hp_changes[target_id] = (hp_changes[target_id] or 0) - 1
			end
		end
	end

	local resolution = {
		kind = "duel_shots",
		verdict = judge.verdict,
		challenger_id = challenger_id,
		previous_bidder_id = previous_id,
		target_id = target_id,
		roulette_subject_id = target_id,
		steps = steps,
		hp_changes = hp_changes,
	}

	apply_hp_changes(state.players, hp_changes)
	return resolution
end

local function resolve_perfect_duel(state, duel_state)
	local previous_id = duel_state.previous_bidder_id
	local challenger_id = duel_state.challenger_id
	local targets = target_order_from_challenger(state.players, challenger_id, previous_id)
	local actor = state.players.by_id[previous_id]
	local steps = {}
	local hp_changes = {}

	if actor and #targets > 0 then
		local next_cylinder, shots = cylinder.trigger(actor.cylinder, 6)
		actor.cylinder = next_cylinder

		for i, shot in ipairs(shots) do
			local target_id = targets[((i - 1) % #targets) + 1]
			steps[#steps + 1] = {
				kind = "perfect_duel",
				actor_id = previous_id,
				shooter_id = previous_id,
				target_id = target_id,
				actor_choice = "trigger",
				target_choice = "take_hit",
				hit = shot.hit,
				slot_index = shot.slot_index,
				consumed = shot.consumed,
				needs_choice = true,
			}

			if shot.hit then
				hp_changes[target_id] = (hp_changes[target_id] or 0) - 1
			end
		end
	end

	local resolution = {
		kind = "perfect_duel",
		actor_id = previous_id,
		shooter_id = previous_id,
		targets = targets,
		steps = steps,
		hp_changes = hp_changes,
		reload_player_id = previous_id,
	}

	apply_hp_changes(state.players, hp_changes)
	return resolution
end

function M.resolve(state, duel_state)
	if not duel_state then
		return nil
	end

	if duel_state.judge.verdict == M.VERDICT.EXACT then
		return resolve_perfect_duel(state, duel_state)
	end

	return resolve_duel_shots(state, duel_state)
end

return M
