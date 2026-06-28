local actions = require("game.model.actions")
local event_bus = require("game.core.event_bus")
local cosmetics = require("game.core.cosmetics")
local match_adapter = require("game.net.match_adapter")
local qa_cli = require("game.dev.qa_cli")
local reducers = require("game.model.reducers")
local selectors = require("game.model.selectors")
local store_mod = require("game.model.store")

local M = {}

local function assert_eq(actual, expected, label)
	if actual ~= expected then
		error((label or "assert_eq") .. ": expected " .. tostring(expected) .. ", got " .. tostring(actual), 2)
	end
end

local function assert_true(value, label)
	if not value then
		error(label or "assert_true failed", 2)
	end
end

local function find_player(snapshot, player_id)
	for _, player in ipairs(snapshot.players or {}) do
		if player.id == player_id then
			return player
		end
	end
	return nil
end

local function fixed_rng(value)
	return {
		int = function()
			return value
		end,
	}
end

local function new_store()
	local bus = event_bus.new()
	return store_mod.create(reducers.initial_state(), reducers.reduce, bus)
end

local function dispatch_ok(store, action)
	local result = store:dispatch(action)
	if not result.ok then
		error("dispatch failed: " .. tostring(result.error), 2)
	end
	return result
end

local function start_match(store, payload)
	local emitted = {}
	local bridge = {
		emit = function(type_, out_payload)
			emitted[#emitted + 1] = {
				type = type_,
				payload = out_payload,
			}
		end,
	}
	local adapter = match_adapter.new(bridge, store, cosmetics)
	adapter:on_bridge_message({
		type = "START_MATCH",
		payload = payload,
	})
	return adapter, emitted
end

local function load_setup(store, slots)
	for _, slot in ipairs(slots) do
		dispatch_ok(store, actions.setup_load_initial("local", slot))
	end
end

local function load_pending(store, slots)
	for _, slot in ipairs(slots) do
		local state = store:get_state()
		dispatch_ok(store, actions.bullet_load(slot, state.pending_load.player_id))
	end
end

local function complete_shake(store, player_id, rng)
	for _ = 1, 6 do
		dispatch_ok(store, actions.shake_roll(player_id, rng))
	end
end

local function check_dice_and_open_bidding(store, player_id)
	dispatch_ok(store, actions.dice_check(player_id))
	dispatch_ok(store, actions.bidding_open())
end

function M.test_start_setup_and_first_shake()
	local store = new_store()
	local _, emitted = start_match(store, {
		sessionId = "session-1",
		matchId = "match-1",
		playerId = "local",
		mode = "casual",
		players = {
			{ id = "local", hp = 3, dice_count = 5 },
			{ id = "opponent-1", hp = 3, dice_count = 5 },
			{ id = "opponent-2", hp = 3, dice_count = 5 },
		},
	})

	local state = store:get_state()
	assert_eq(emitted[1].type, "MATCH_READY", "bridge ready type")
	assert_eq(state.turn.kind, "setup", "initial turn")
	assert_eq(state.pending_load.source, "setup", "setup pending source")
	assert_eq(state.pending_load.count, 3, "setup pending count")

	load_setup(store, { 1, 2, 3 })
	state = store:get_state()
	assert_eq(state.pending_load, nil, "setup pending cleared")
	assert_eq(state.turn.kind, "shaking", "setup complete moves to shaking")
	assert_eq(state.flow.phase, "cup_shake", "setup complete enters cup shake")
	assert_eq(selectors.hud_kind(state), "cup_shake", "cup shake hud")
	assert_eq(selectors.local_player(state).bullets, 3, "local initial bullets")

	complete_shake(store, "local", fixed_rng(2))
	state = store:get_state()
	assert_eq(state.turn.kind, "shaking", "first shake waits for dice check")
	assert_eq(state.flow.phase, "dice_check", "first shake moves to dice check")
	assert_eq(state.pending_load, nil, "first shake has no load")
	assert_eq(#selectors.local_player(state).dice, 5, "local dice rolled")

	dispatch_ok(store, actions.dice_check("local"))
	state = store:get_state()
	assert_eq(state.turn.kind, "shaking", "dice check waits for bidding gap")
	assert_eq(state.flow.phase, "bidding_gap", "dice check enters bidding gap")

	dispatch_ok(store, actions.bidding_open())
	state = store:get_state()
	assert_eq(state.turn.kind, "bidding", "dice check moves to bidding")
	assert_eq(selectors.hud_kind(state), "bidding", "bidding hud")
end

function M.test_bid_challenge_and_second_shake_load()
	local store = new_store()
	start_match(store, {
		sessionId = "session-2",
		matchId = "match-2",
		playerId = "local",
		mode = "casual",
		players = {
			{ id = "local", hp = 3, dice_count = 5 },
			{ id = "opponent-1", hp = 3, dice_count = 5 },
			{ id = "opponent-2", hp = 3, dice_count = 5 },
		},
	})
	load_setup(store, { 1, 2, 3 })
	complete_shake(store, "local", fixed_rng(2))
	check_dice_and_open_bidding(store, "local")

	dispatch_ok(store, actions.bid_raise({
		player_id = "local",
		count = 15,
		face = 2,
	}))
	local state = store:get_state()
	assert_eq(state.turn.active_player_id, "opponent-1", "bid rotates active")
	assert_eq(state.pending_load.player_id, "local", "bid load belongs to bidder")
	assert_eq(state.pending_load.source, "bid", "bid load source")
	assert_eq(selectors.hud_kind(state), "revolver_reload", "bid load uses reload hud")

	local snapshot = qa_cli.status_snapshot(state)
	local local_player = find_player(snapshot, "local")
	local active_player = find_player(snapshot, "opponent-1")
	assert_eq(snapshot.protocol_version, 1, "qa protocol version")
	assert_eq(local_player.available_actions[1].type, "load", "bidder can load")
	assert_eq(active_player.available_actions[1], nil, "next bidder blocked during load")

	local low = store:dispatch(actions.bid_raise({
		player_id = "opponent-1",
		count = 1,
		face = 2,
	}))
	assert_eq(low.ok, false, "bid is blocked while load is pending")
	assert_eq(low.error, "load_pending", "pending load error")

	load_pending(store, { 4 })
	state = store:get_state()
	assert_eq(state.pending_load, nil, "bid load cleared")
	assert_eq(selectors.hud_kind(state), "bidding", "bidding resumes after bid load")

	low = store:dispatch(actions.bid_raise({
		player_id = "opponent-1",
		count = 1,
		face = 2,
	}))
	assert_eq(low.ok, false, "low bid rejected after load")
	assert_eq(low.error, "too_low", "low bid error")

	dispatch_ok(store, actions.bid_challenge(fixed_rng(6)))
	state = store:get_state()
	assert_eq(state.turn.kind, "dualing", "challenge enters duel")
	assert_eq(state.pending_load, nil, "challenge clears pending load")
	assert_eq(state.duel.judge.verdict, "EXACT", "exact verdict")
	assert_eq(state.duel.resolution, nil, "challenge does not precompute exact resolution")
	assert_eq(state.duel.revolver_spin.player_id, "local", "exact spins previous bidder")
	assert_eq(state.duel.revolver_spin.steps, 6, "exact spin steps recorded")

	dispatch_ok(store, actions.duel_execute())
	state = store:get_state()
	assert_eq(state.duel.phase, "executing", "duel execute keeps duel hud active")
	assert_eq(state.duel.resolution.kind, "perfect_duel", "exact execute builds perfect duel")

	dispatch_ok(store, actions.round_advance())
	state = store:get_state()
	assert_eq(state.turn.kind, "shaking", "round remains in shaking lane")
	assert_eq(state.turn.is_first_shake, false, "round no longer first shake")
	assert_eq(state.pending_load.source, "exact_duel", "exact creates reload")
	assert_eq(state.pending_load.count, 3, "exact reloads three bullets")

	load_pending(store, { 1, 2, 3 })
	state = store:get_state()
	assert_eq(state.flow.phase, "cup_shake", "exact reload returns to shake")

	complete_shake(store, state.turn.active_player_id, fixed_rng(3))
	state = store:get_state()
	assert_eq(state.flow.phase, "dice_check", "exact shake moves to dice check")
	assert_eq(state.pending_load, nil, "exact reward does not create active reload")
end

function M.test_match_result_payload_after_lethal_challenge()
	local store = new_store()
	local adapter = start_match(store, {
		sessionId = "session-3",
		matchId = "match-3",
		playerId = "local",
		mode = "casual",
		firstPlayerId = "opponent-1",
		players = {
			{ id = "local", hp = 3, dice_count = 5 },
			{ id = "opponent-1", hp = 1, dice_count = 5 },
		},
	})

	load_setup(store, { 1, 2, 3 })
	local state = store:get_state()
	assert_eq(state.turn.active_player_id, "opponent-1", "first player preserved after setup")

	complete_shake(store, "opponent-1", fixed_rng(6))
	check_dice_and_open_bidding(store, "local")
	dispatch_ok(store, actions.bid_raise({
		player_id = "opponent-1",
		count = 1,
		face = 6,
	}))
	load_pending(store, { 2 })
	dispatch_ok(store, actions.bid_challenge(fixed_rng(6)))
	state = store:get_state()
	assert_eq(state.duel.judge.verdict, "OVER", "over verdict")
	assert_eq(state.duel.resolution, nil, "challenge does not precompute over resolution")
	assert_eq(state.duel.revolver_spin.player_id, "opponent-1", "over spins previous bidder")
	assert_eq(state.duel.revolver_spin.steps, 6, "over spin steps recorded")

	dispatch_ok(store, actions.duel_execute())
	state = store:get_state()
	assert_eq(state.duel.phase, "executing", "over execute keeps duel hud active")
	assert_eq(state.duel.resolution.kind, "duel_shots", "over execute builds shot resolution")

	dispatch_ok(store, actions.round_advance())
	state = store:get_state()
	assert_eq(state.match.status, "complete", "match complete")
	assert_eq(state.match.winner_id, "local", "local wins")

	local result_payload = selectors.match_result_payload(state)
	assert_eq(result_payload.matchId, "match-3", "result match id")
	assert_eq(result_payload.winnerId, "local", "result winner")
	assert_true(result_payload.eventsHash ~= nil, "result hash")

	local emitted = {}
	adapter.bridge.emit = function(type_, payload)
		emitted[#emitted + 1] = {
			type = type_,
			payload = payload,
		}
	end
	adapter:submit_result()
	assert_eq(emitted[1].type, "SUBMIT_MATCH_RESULT", "submit result type")
	assert_eq(emitted[1].payload.winnerId, "local", "submit winner")
end

function M.test_duel_short_targets_challenger()
	local store = new_store()
	start_match(store, {
		sessionId = "session-4",
		matchId = "match-4",
		playerId = "local",
		mode = "casual",
		firstPlayerId = "opponent-1",
		players = {
			{ id = "local", hp = 3, dice_count = 5 },
			{ id = "opponent-1", hp = 3, dice_count = 5 },
		},
	})
	load_setup(store, { 1, 2, 3 })
	complete_shake(store, "opponent-1", fixed_rng(6))
	check_dice_and_open_bidding(store, "local")
	dispatch_ok(store, actions.bid_raise({
		player_id = "opponent-1",
		count = 10,
		face = 4,
	}))
	load_pending(store, { 2 })
	dispatch_ok(store, actions.bid_challenge(fixed_rng(6)))

	local state = store:get_state()
	assert_eq(state.duel.judge.verdict, "SHORT", "short verdict")
	assert_eq(state.duel.resolution, nil, "challenge does not precompute short resolution")
	assert_eq(state.duel.revolver_spin.player_id, "local", "short spins challenger")
	assert_eq(state.duel.revolver_spin.steps, 6, "short spin steps recorded")

	dispatch_ok(store, actions.duel_execute())
	state = store:get_state()
	assert_eq(state.duel.phase, "executing", "short execute keeps duel hud active")
	assert_eq(state.duel.resolution.target_id, "local", "short execute targets challenger")
	dispatch_ok(store, actions.round_advance())
	state = store:get_state()
	assert_eq(selectors.local_player(state).hp, 0, "short damages challenger after advance")
end

function M.test_challenger_starts_next_bidding_round()
	local store = new_store()
	start_match(store, {
		sessionId = "session-5",
		matchId = "match-5",
		playerId = "local",
		mode = "casual",
		firstPlayerId = "opponent-1",
		players = {
			{ id = "local", hp = 3, dice_count = 5 },
			{ id = "opponent-1", hp = 3, dice_count = 5 },
		},
	})
	load_setup(store, { 1, 2, 3 })
	complete_shake(store, "opponent-1", fixed_rng(6))
	check_dice_and_open_bidding(store, "local")
	dispatch_ok(store, actions.bid_raise({
		player_id = "opponent-1",
		count = 1,
		face = 4,
	}))
	load_pending(store, { 2 })
	dispatch_ok(store, actions.bid_challenge(fixed_rng(4)))

	local state = store:get_state()
	assert_eq(state.duel.challenger_id, "local", "local is challenger")
	assert_eq(state.duel.judge.verdict, "SHORT", "short verdict")

	dispatch_ok(store, actions.duel_execute())
	dispatch_ok(store, actions.round_advance())
	state = store:get_state()
	assert_eq(selectors.local_player(state).hp, 3, "spin misses challenger")
	assert_eq(state.turn.active_player_id, "local", "challenger starts next shake")

	complete_shake(store, "local", fixed_rng(3))
	state = store:get_state()
	if state.pending_load then
		load_pending(store, { 1 })
		state = store:get_state()
	end
	assert_eq(state.flow.phase, "dice_check", "next round reaches dice check")
	check_dice_and_open_bidding(store, "local")
	state = store:get_state()
	assert_eq(state.turn.active_player_id, "local", "challenger starts next bidding")
end

function M.test_duel_spender_reloads_after_next_shake()
	local store = new_store()
	start_match(store, {
		sessionId = "session-6",
		matchId = "match-6",
		playerId = "local",
		mode = "casual",
		firstPlayerId = "local",
		players = {
			{ id = "local", hp = 3, dice_count = 5 },
			{
				id = "opponent-1",
				hp = 3,
				dice_count = 5,
				initial_loaded_slots = { 1 },
			},
			{ id = "opponent-2", hp = 3, dice_count = 5 },
		},
	})
	load_setup(store, { 1, 2, 3 })
	complete_shake(store, "local", fixed_rng(6))
	check_dice_and_open_bidding(store, "local")
	dispatch_ok(store, actions.bid_raise({
		player_id = "local",
		count = 1,
		face = 6,
	}))
	load_pending(store, { 4 })
	dispatch_ok(store, actions.bid_raise({
		player_id = "opponent-1",
		count = 2,
		face = 6,
	}))
	load_pending(store, { 2 })
	dispatch_ok(store, actions.bid_challenge(fixed_rng(6)))

	local state = store:get_state()
	assert_eq(state.duel.challenger_id, "opponent-2", "samuel is challenger")
	assert_eq(state.duel.judge.verdict, "OVER", "over verdict")

	dispatch_ok(store, actions.duel_execute())
	dispatch_ok(store, actions.round_advance())
	state = store:get_state()
	assert_eq(state.players.by_id["opponent-1"].hp, 1, "previous bidder spends bullets and survives")
	assert_eq(state.turn.active_player_id, "opponent-2", "challenger starts next shake")

	complete_shake(store, "opponent-2", fixed_rng(3))
	state = store:get_state()
	assert_eq(state.pending_load.player_id, "opponent-1", "duel bullet spender reloads")
	assert_eq(state.pending_load.source, "duel", "duel reload source")
	assert_eq(selectors.hud_kind(state), "loading", "remote reload uses loading hud")

	local snapshot = qa_cli.status_snapshot(state)
	local local_player = find_player(snapshot, "local")
	local spender = find_player(snapshot, "opponent-1")
	assert_eq(local_player.available_actions[1], nil, "local cannot load remote pending")
	assert_eq(spender.available_actions[1].type, "load", "spender can load")

	load_pending(store, { 1 })
	state = store:get_state()
	assert_eq(state.flow.phase, "dice_check", "duel reload returns to dice check")
end

function M.test_eliminated_challenger_falls_forward_to_next_seat()
	local store = new_store()
	start_match(store, {
		sessionId = "session-7",
		matchId = "match-7",
		playerId = "local",
		mode = "casual",
		firstPlayerId = "local",
		players = {
			{ id = "local", hp = 3, dice_count = 5 },
			{ id = "opponent-1", hp = 3, dice_count = 5 },
			{
				id = "opponent-2",
				hp = 3,
				dice_count = 5,
				initial_loaded_slots = { 1, 2, 3, 4, 5, 6 },
			},
			{ id = "opponent-3", hp = 3, dice_count = 5 },
		},
	})
	load_setup(store, { 1, 2, 3 })
	complete_shake(store, "local", fixed_rng(2))
	check_dice_and_open_bidding(store, "local")
	dispatch_ok(store, actions.bid_raise({
		player_id = "local",
		count = 1,
		face = 4,
	}))
	load_pending(store, { 4 })
	dispatch_ok(store, actions.bid_raise({
		player_id = "opponent-1",
		count = 4,
		face = 4,
	}))
	load_pending(store, { 2 })
	dispatch_ok(store, actions.bid_challenge(fixed_rng(6)))

	local state = store:get_state()
	assert_eq(state.duel.challenger_id, "opponent-2", "samuel is challenger")
	assert_eq(state.duel.judge.verdict, "SHORT", "short verdict")

	dispatch_ok(store, actions.duel_execute())
	dispatch_ok(store, actions.round_advance())
	state = store:get_state()
	assert_eq(state.players.by_id["opponent-2"].eliminated, true, "challenger is eliminated")
	assert_eq(state.turn.active_player_id, "opponent-3", "next seat starts after eliminated challenger")

	complete_shake(store, "opponent-3", fixed_rng(3))
	state = store:get_state()
	if state.pending_load then
		load_pending(store, { 2 })
		state = store:get_state()
	end
	assert_eq(state.flow.phase, "dice_check", "next seat reaches dice check")
	dispatch_ok(store, actions.dice_check("local"))
	dispatch_ok(store, actions.bidding_open())
	state = store:get_state()
	assert_eq(state.turn.active_player_id, "opponent-3", "next seat starts bidding")
end

return M
