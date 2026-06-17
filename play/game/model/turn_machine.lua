local M = {}

local TRANSITIONS = {
	setup = {
		setup_complete = "shaking",
	},
	shaking = {
		shake_complete = "bidding",
		load_complete = "bidding",
	},
	bidding = {
		bid_raised = "bidding",
		challenge = "dualing",
	},
	dualing = {
		duel_complete = "shaking",
	},
}

local function alive_order(players)
	local order = {}
	for _, player_id in ipairs(players.order or {}) do
		local player = players.by_id[player_id]
		if player and not player.eliminated and (player.hp or 0) > 0 then
			order[#order + 1] = player_id
		end
	end
	return order
end

local function next_alive_after(players, player_id)
	local order = alive_order(players)
	if #order == 0 then
		return nil
	end

	if not player_id then
		return order[1]
	end

	for i, id in ipairs(order) do
		if id == player_id then
			return order[(i % #order) + 1]
		end
	end

	return order[1]
end

local function effects_for(from, event, ctx)
	if event == "shake_complete" and not ctx.turn.is_first_shake then
		return {
			pending_load = {
				player_id = ctx.turn.active_player_id,
				source = "shake",
				count = 1,
			},
		}
	end

	if event == "bid_raised" then
		return {
			pending_load = {
				player_id = ctx.turn.active_player_id,
				source = "bid",
				count = 1,
			},
		}
	end

	return {}
end

local function rotate_active(turn, event, ctx)
	if event == "bid_raised" then
		return next_alive_after(ctx.players, turn.active_player_id)
	end

	if event == "duel_complete" then
		return next_alive_after(ctx.players, turn.active_player_id)
	end

	return turn.active_player_id
end

function M.next(turn, event, ctx)
	ctx = ctx or {}
	local to = (TRANSITIONS[turn.kind] or {})[event]
	if not to then
		return {
			ok = false,
			reason = "invalid_turn_transition",
			turn = turn,
			effects = {},
		}
	end

	return {
		ok = true,
		turn = {
			kind = to,
			active_player_id = rotate_active(turn, event, ctx),
			previous_player_id = turn.active_player_id,
			round_index = turn.round_index or 0,
			is_first_shake = turn.is_first_shake,
		},
		effects = effects_for(turn.kind, event, ctx),
	}
end

function M.alive_order(players)
	return alive_order(players)
end

function M.next_alive_after(players, player_id)
	return next_alive_after(players, player_id)
end

return M
