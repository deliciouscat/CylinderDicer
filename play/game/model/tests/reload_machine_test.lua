local reload_machine = require("game.model.reload_machine")
local turn_machine = require("game.model.turn_machine")

local M = {}

local function assert_eq(actual, expected, label)
	if actual ~= expected then
		error((label or "assert_eq") .. ": expected " .. tostring(expected) .. ", got " .. tostring(actual), 2)
	end
end

local function bid_load(player_id)
	return {
		player_id = player_id,
		count = 1,
		source = "bid",
	}
end

function M.test_bid_reload_is_orthogonal_to_the_decision_turn()
	local state = {
		flow = { phase = "bidding" },
		turn = { active_player_id = "next-player" },
		bidding = {},
		pending_load = bid_load("previous-player"),
	}

	assert_eq(reload_machine.lane(state), "loading", "active reload lane")
	assert_eq(turn_machine.derive_kind(state), "bidding", "decision turn remains bidding")
	assert_eq(state.turn.active_player_id, "next-player", "reload does not own the turn")

	reload_machine.queue_bid_load(state, bid_load("next-player"), 3)
	assert_eq(reload_machine.lane(state), "gated", "second load creates gate")
	assert_eq(state.pending_load.player_id, "previous-player", "first load remains active")
	assert_eq(state.bidding.deferred_load.player_id, "next-player", "second load is deferred")
	assert_eq(state.bidding.reload_gate.epoch, 1, "first gate epoch")

	reload_machine.promote_deferred_bid_load(state)
	assert_eq(reload_machine.lane(state), "loading", "promoted load remains independent")
	assert_eq(state.pending_load.player_id, "next-player", "deferred load promoted")
	assert_eq(state.bidding.reload_gate, nil, "gate cleared")
end

function M.test_turn_kind_is_derived_from_phase_and_reload_source()
	local state = {
		flow = { phase = "revolver_reload" },
		turn = { kind = "complete" },
		pending_load = { player_id = "local", count = 1, source = "duel" },
	}

	assert_eq(turn_machine.sync_kind(state), "shaking", "duel reload projects shaking")
	state.pending_load.source = "setup"
	assert_eq(turn_machine.sync_kind(state), "setup", "setup reload projects setup")
	state.flow.phase = "duel"
	assert_eq(turn_machine.sync_kind(state), "dualing", "duel phase projects dualing")
end

function M.test_second_bid_gates_even_when_it_needs_no_deferred_load()
	local state = {
		flow = { phase = "bidding" },
		turn = { active_player_id = "third-player" },
		bidding = {},
		pending_load = bid_load("previous-player"),
	}

	reload_machine.queue_bid_load(state, nil, 3)
	assert_eq(reload_machine.lane(state), "gated", "second bid still closes decision lane")
	assert_eq(state.pending_load.player_id, "previous-player", "active reload remains")
	assert_eq(state.bidding.deferred_load, nil, "full cylinder creates no deferred load")
	assert_eq(state.bidding.reload_gate.countdown_seconds, 3, "gate keeps timeout")

	reload_machine.promote_deferred_bid_load(state)
	assert_eq(reload_machine.lane(state), "clear", "timeout clears reload without deferred work")
end

return M
