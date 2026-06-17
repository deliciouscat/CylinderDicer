local dice = require "game.model.rules.dice"
local cylinder = require "game.model.rules.cylinder"

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
		resolution = M.plan_resolution(state, challenger_id, previous_id or bid.player_id, judge),
	}
end

function M.plan_resolution(state, challenger_id, previous_id, judge)
	if judge.verdict == M.VERDICT.EXACT then
		local targets = {}
		for _, player_id in ipairs(state.players.order or {}) do
			if player_id ~= previous_id then
				local player = state.players.by_id[player_id]
				if player and not player.eliminated and (player.hp or 0) > 0 then
					targets[#targets + 1] = player_id
				end
			end
		end

		return {
			kind = "perfect_duel",
			shooter_id = previous_id,
			targets = targets,
			steps = {},
			hp_changes = {},
		}
	end

	local attacker = state.players.by_id[challenger_id]
	local _, shots = cylinder.trigger(attacker.cylinder, judge.delta)
	local steps = {}
	local hp_changes = {}

	for _, shot in ipairs(shots) do
		steps[#steps + 1] = {
			shooter_id = challenger_id,
			target_id = previous_id,
			hit = shot.hit,
			slot_index = shot.slot_index,
			consumed = shot.consumed,
		}

		if shot.hit then
			hp_changes[previous_id] = (hp_changes[previous_id] or 0) - 1
		end
	end

	return {
		kind = "duel_shots",
		shooter_id = challenger_id,
		target_id = previous_id,
		steps = steps,
		hp_changes = hp_changes,
	}
end

function M.apply_resolution(players, duel_state)
	local resolution = duel_state and duel_state.resolution
	if not resolution then
		return players
	end

	if resolution.kind == "duel_shots" then
		local shooter = players.by_id[resolution.shooter_id]
		if shooter then
			local next_cylinder = shooter.cylinder
			next_cylinder = cylinder.trigger(next_cylinder, #(resolution.steps or {}))
			if type(next_cylinder) == "table" then
				shooter.cylinder = next_cylinder
			end
		end
	end

	for player_id, delta in pairs(resolution.hp_changes or {}) do
		local player = players.by_id[player_id]
		if player then
			player.hp = math.max(0, (player.hp or 0) + delta)
			player.eliminated = player.hp <= 0
		end
	end

	return players
end

return M
