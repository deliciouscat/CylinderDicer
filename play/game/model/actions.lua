local M = {}

M.types = {
	MATCH_INIT = "match.init",
	COSMETICS_APPLY = "cosmetics.apply",
	SETUP_LOAD_INITIAL = "setup.load_initial",
	SHAKE_ROLL = "shake.roll",
	DICE_CHECK = "dice.check",
	BIDDING_OPEN = "bidding.open",
	BULLET_LOAD = "bullet.load",
	BID_SELECT_COUNT = "bid.select_count",
	BID_SELECT_FACE = "bid.select_face",
	BID_RAISE = "bid.raise",
	BID_CHALLENGE = "bid.challenge",
	DUEL_EXECUTE = "duel.execute",
	DUEL_RESOLVE_CHOICE = "duel.resolve_choice",
	ROUND_ADVANCE = "round.advance",
	MATCH_COMPLETE = "match.complete",
}

local function action(type_, payload, meta)
	return {
		type = type_,
		payload = payload or {},
		meta = meta,
	}
end

local function random_int(rng, min, max)
	if rng and type(rng.int) == "function" then
		return rng:int(min, max)
	end
	if rng and type(rng.random) == "function" then
		return rng:random(min, max)
	end
	return math.random(min, max)
end

function M.match_init(payload)
	return action(M.types.MATCH_INIT, payload)
end

function M.cosmetics_apply(cosmetics)
	return action(M.types.COSMETICS_APPLY, { cosmetics = cosmetics or {} })
end

function M.setup_load_initial(player_id, slot_index)
	return action(M.types.SETUP_LOAD_INITIAL, {
		player_id = player_id,
		slot_index = slot_index,
	})
end

function M.shake_roll(player_id, rng)
	return action(M.types.SHAKE_ROLL, {
		player_id = player_id,
		rng = rng,
	})
end

function M.dice_check(player_id)
	return action(M.types.DICE_CHECK, {
		player_id = player_id,
	})
end

function M.bidding_open()
	return action(M.types.BIDDING_OPEN)
end

function M.bullet_load(slot_index, player_id)
	return action(M.types.BULLET_LOAD, {
		slot_index = slot_index,
		player_id = player_id,
	})
end

function M.bid_select_count(count)
	return action(M.types.BID_SELECT_COUNT, { count = count })
end

function M.bid_select_face(face)
	return action(M.types.BID_SELECT_FACE, { face = face })
end

function M.bid_raise(bid)
	return action(M.types.BID_RAISE, { bid = bid })
end

function M.bid_challenge(rng)
	return action(M.types.BID_CHALLENGE, {
		spin_steps = random_int(rng, 1, 6),
	})
end

function M.duel_execute()
	return action(M.types.DUEL_EXECUTE)
end

function M.duel_resolve_choice(choice)
	return action(M.types.DUEL_RESOLVE_CHOICE, { choice = choice })
end

function M.round_advance()
	return action(M.types.ROUND_ADVANCE)
end

function M.match_complete(winner_id)
	return action(M.types.MATCH_COMPLETE, { winner_id = winner_id })
end

return M
