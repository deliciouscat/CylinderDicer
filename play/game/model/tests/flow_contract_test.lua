local flow_contract = require("game.flow_contract")
local presentation = require("game.presentation")

local M = {}

local function assert_eq(actual, expected, label)
	if actual ~= expected then
		error((label or "assert_eq") .. ": expected " .. tostring(expected) .. ", got " .. tostring(actual), 2)
	end
end

local function base_state(phase)
	return {
		match = {
			local_player_id = "local",
			local_simulator = true,
		},
		players = {
			order = { "local", "opponent" },
			by_id = {
				["local"] = { hp = 6, eliminated = false },
				opponent = { hp = 6, eliminated = false },
			},
		},
		turn = {
			kind = "shaking",
			active_player_id = "local",
		},
		flow = { phase = phase },
	}
end

function M.test_automatic_flow_contract()
	local state = base_state("cup_shake")
	assert_eq(flow_contract.automatic_transition(state).type, "shake.timeout", "shake timeout transition")
	assert_eq(flow_contract.automatic_transition(state).delay, 6.0, "shake timeout delay")

	state.flow.phase = "bidding_gap"
	assert_eq(flow_contract.automatic_transition(state).type, "bidding.open", "bidding gap transition")

	state.flow.phase = "bidding"
	state.bidding = { reload_gate = { countdown_seconds = 3, epoch = 1 } }
	state.pending_load = { player_id = "local", source = "bid", count = 1 }
	assert_eq(flow_contract.automatic_transition(state).type, "bid.reload_timeout", "bid reload timeout transition")

	state.flow.phase = "duel"
	state.turn.kind = "dualing"
	state.duel = { phase = "ready" }
	assert_eq(flow_contract.automatic_transition(state).type, "duel.execute", "duel reveal transition")

	state.duel = {
		phase = "executing",
		resolution = { kind = "duel_shots", steps = { { hit = false } } },
	}
	assert_eq(flow_contract.automatic_transition(state).type, "round.advance", "duel combat transition")
end

function M.test_presentation_descriptor_owns_component_selection()
	local state = base_state("bidding")
	state.turn.kind = "bidding"
	local view = presentation.describe(state)
	assert_eq(view.hud, "bidding", "bidding hud")
	assert_eq(view.background, "bidding", "bidding background")
	assert_eq(view.cylinder_anchor, "hud", "bidding cylinder")
	assert_eq(#view.components, 4, "bidding components")

	state.pending_load = { player_id = "local", source = "bid", count = 1 }
	view = presentation.describe(state)
	assert_eq(view.hud, "revolver_reload", "bidder sees reload while bidding stays open")
	state.match.local_player_id = "opponent"
	view = presentation.describe(state)
	assert_eq(view.hud, "bidding", "next player sees bidding before placing a bid")
	state.bidding = { reload_gate = { countdown_seconds = 3, epoch = 1 } }
	view = presentation.describe(state)
	assert_eq(view.hud, "loading", "other players see loading after next bid")
	assert_eq(view.background, "bidding", "loading keeps bidding background")
	state.pending_load = nil
	state.bidding.reload_gate = nil
	view = presentation.describe(state)
	assert_eq(view.hud, "bidding", "everyone returns to bidding after reload")

	state.flow.phase = "duel"
	state.turn.kind = "dualing"
	view = presentation.describe(state)
	assert_eq(view.hud, "duel", "duel hud")
	assert_eq(#view.components, 1, "duel component")
end

return M
