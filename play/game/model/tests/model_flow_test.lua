local actions = require("game.model.actions")
local event_bus = require("game.core.event_bus")
local cosmetics = require("game.core.cosmetics")
local match_adapter = require("game.net.match_adapter")
local qa_cli = require("game.dev.qa_cli")
local reducers = require("game.model.reducers")
local duel_rules = require("game.model.rules.duel")
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
	dispatch_ok(store, actions.shake_complete(player_id, rng))
end

local function complete_all_shakes(store, rng)
	local order = store:get_state().players.order or {}
	for _, player_id in ipairs(order) do
		local player = store:get_state().players.by_id[player_id]
		if player and not player.eliminated and (player.hp or 0) > 0 then
			complete_shake(store, player_id, rng)
		end
	end
end

local function check_dice_and_open_bidding(store)
	local order = store:get_state().players.order or {}
	for _, player_id in ipairs(order) do
		local state = store:get_state()
		local player = state.players.by_id[player_id]
		if player and not player.eliminated and (player.hp or 0) > 0 and not state.shake.checked[player_id] then
			dispatch_ok(store, actions.dice_check(player_id))
		end
	end
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
			{ id = "local", hp = 6, dice_count = 5 },
			{ id = "opponent-1", hp = 6, dice_count = 5 },
			{ id = "opponent-2", hp = 6, dice_count = 5 },
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

	local snapshot = qa_cli.status_snapshot(state)
	assert_eq(find_player(snapshot, "local").available_actions[1].type, "shake", "local can shake")
	assert_eq(find_player(snapshot, "opponent-1").available_actions[1].type, "shake", "opponent can shake")

	complete_shake(store, "local", fixed_rng(2))
	state = store:get_state()
	assert_eq(state.flow.phase, "cup_shake", "first player waits for every cup")
	assert_eq(#state.players.by_id["local"].dice, 5, "local roll is ready")
	assert_eq(#state.players.by_id["opponent-1"].dice, 0, "other dice wait for their shake")
	complete_shake(store, "opponent-1", fixed_rng(3))
	complete_shake(store, "opponent-2", fixed_rng(4))
	state = store:get_state()
	assert_eq(state.turn.kind, "shaking", "first shake waits for dice check")
	assert_eq(state.flow.phase, "dice_check", "first shake moves to dice check")
	assert_eq(state.pending_load, nil, "first shake has no load")
	assert_eq(#selectors.local_player(state).dice, 5, "local dice rolled")

	dispatch_ok(store, actions.dice_check("local"))
	state = store:get_state()
	assert_eq(state.turn.kind, "shaking", "dice check waits for bidding gap")
	assert_eq(state.flow.phase, "dice_check", "local check waits for every player")
	dispatch_ok(store, actions.dice_check("opponent-1"))
	dispatch_ok(store, actions.dice_check("opponent-2"))
	state = store:get_state()
	assert_eq(state.flow.phase, "bidding_gap", "dice check enters bidding gap")

	dispatch_ok(store, actions.bidding_open())
	state = store:get_state()
	assert_eq(state.turn.kind, "bidding", "dice check moves to bidding")
	assert_eq(selectors.hud_kind(state), "bidding", "bidding hud")
end

function M.test_every_human_chooses_initial_chambers_in_seat_order()
	local store = new_store()
	start_match(store, {
		sessionId = "session-human-setup",
		matchId = "match-human-setup",
		playerId = "human-1",
		mode = "casual",
		players = {
			{ id = "human-1", participant_kind = "human", hp = 6, dice_count = 5 },
			{ id = "human-2", participant_kind = "human", hp = 6, dice_count = 5 },
			{
				id = "bot-1",
				participant_kind = "virtual",
				virtual_opponent_id = "virtual-1",
				hp = 6,
				dice_count = 5,
				initial_loaded_slots = { 1, 3, 5 },
			},
		},
	})

	local state = store:get_state()
	assert_eq(state.pending_load.player_id, "human-1", "first human loads first")
	for _, slot_index in ipairs({ 1, 3, 6 }) do
		dispatch_ok(store, actions.setup_load_initial("human-1", slot_index))
	end

	state = store:get_state()
	assert_eq(state.flow.phase, "revolver_reload", "second human keeps setup open")
	assert_eq(state.turn.kind, "setup", "second human remains in setup")
	assert_eq(state.pending_load.player_id, "human-2", "second human receives load control")
	for _, slot_index in ipairs({ 2, 4, 5 }) do
		dispatch_ok(store, actions.setup_load_initial("human-2", slot_index))
	end

	state = store:get_state()
	assert_eq(state.flow.phase, "cup_shake", "all human setup enters shake")
	assert_eq(state.players.by_id["human-1"].cylinder.slots[1].loaded, true, "first human slot one")
	assert_eq(state.players.by_id["human-1"].cylinder.slots[2].loaded, false, "first human slot two empty")
	assert_eq(state.players.by_id["human-1"].cylinder.slots[6].loaded, true, "first human slot six")
	assert_eq(state.players.by_id["human-2"].cylinder.slots[2].loaded, true, "second human slot two")
	assert_eq(state.players.by_id["human-2"].cylinder.slots[4].loaded, true, "second human slot four")
	assert_eq(state.players.by_id["bot-1"].cylinder.slots[1].loaded, true, "bot remains preloaded")
	assert_eq(state.players.by_id["bot-1"].cylinder.slots[2].loaded, false, "bot preload pattern remains")
end

function M.test_shake_timeout_completes_only_unfinished_players()
	local store = new_store()
	start_match(store, {
		sessionId = "session-timeout",
		matchId = "match-timeout",
		playerId = "local",
		mode = "casual",
		players = {
			{ id = "local", hp = 6, dice_count = 5 },
			{ id = "opponent-1", hp = 6, dice_count = 5 },
		},
	})
	load_setup(store, { 1, 2, 3 })
	complete_shake(store, "local", fixed_rng(2))
	local before = store:get_state()
	assert_eq(before.shake.counts["local"], 6, "local completion marker")
	assert_eq(#before.players.by_id["opponent-1"].dice, 0, "unfinished opponent has no dice")

	dispatch_ok(store, actions.shake_timeout(fixed_rng(4)))
	local state = store:get_state()
	assert_eq(state.flow.phase, "dice_check", "timeout advances phase")
	assert_eq(state.shake.counts["local"], 6, "completed local stays complete")
	assert_eq(state.shake.counts["opponent-1"], 6, "opponent auto completes")
	assert_eq(state.players.by_id["local"].dice[1], 2, "local dice are not rerolled")
	assert_eq(state.players.by_id["opponent-1"].dice[1], 4, "unfinished opponent is rolled")
end

function M.test_dice_check_timeout_completes_only_unchecked_players()
	local store = new_store()
	start_match(store, {
		sessionId = "session-dice-check-timeout",
		matchId = "match-dice-check-timeout",
		playerId = "local",
		mode = "casual",
		players = {
			{ id = "local", hp = 6, dice_count = 5 },
			{ id = "opponent-1", hp = 6, dice_count = 5 },
		},
	})
	load_setup(store, { 1, 2, 3 })
	complete_shake(store, "local", fixed_rng(2))
	complete_shake(store, "opponent-1", fixed_rng(3))

	dispatch_ok(store, actions.dice_check("local"))
	local before = store:get_state()
	assert_eq(before.flow.phase, "dice_check", "unchecked opponent keeps dice check open")
	assert_eq(before.shake.checked["local"], true, "local check stays complete")
	assert_eq(before.shake.checked["opponent-1"], nil, "opponent remains unchecked")

	dispatch_ok(store, actions.dice_check_timeout())
	local state = store:get_state()
	assert_eq(state.flow.phase, "bidding_gap", "dice check timeout advances phase")
	assert_eq(state.shake.checked["local"], true, "completed local stays checked")
	assert_eq(state.shake.checked["opponent-1"], true, "unchecked opponent is auto checked")
end

function M.test_bidding_timeout_raises_with_skull()
	local store = new_store()
	start_match(store, {
		sessionId = "session-bidding-timeout",
		matchId = "match-bidding-timeout",
		playerId = "local",
		mode = "casual",
		requiresSetupLoad = false,
		players = {
			{ id = "local", hp = 6, dice_count = 5 },
			{ id = "opponent-1", hp = 6, dice_count = 5 },
		},
	})
	local state = store:get_state()
	state.flow.phase = "bidding"
	state.turn.kind = "bidding"
	state.turn.active_player_id = "local"
	state.bidding.current_bid = nil

	dispatch_ok(store, actions.bidding_timeout())
	state = store:get_state()
	assert_eq(state.bidding.current_bid.player_id, "local", "timeout bidder")
	assert_eq(state.bidding.current_bid.count, 1, "timeout bid count")
	assert_eq(state.bidding.current_bid.face, 1, "timeout bid uses skull")
	assert_eq(state.bidding.skull_roulette.player_id, "local", "timeout triggers bidder roulette")
	assert_eq(state.turn.active_player_id, "opponent-1", "timeout advances turn")

	state.flow.phase = "bidding"
	state.turn.kind = "bidding"
	state.turn.active_player_id = "opponent-1"
	state.bidding.current_bid = { player_id = "local", count = 7, face = 4 }
	state.pending_load = nil

	dispatch_ok(store, actions.bidding_timeout())
	state = store:get_state()
	assert_eq(state.bidding.current_bid.player_id, "opponent-1", "raised timeout bidder")
	assert_eq(state.bidding.current_bid.count, 8, "timeout raises count by one")
	assert_eq(state.bidding.current_bid.face, 1, "raised timeout uses skull")
end

function M.test_match_adapter_accepts_server_snapshot_and_reject()
	local store = new_store()
	local adapter = start_match(store, {
		sessionId = "session-server",
		matchId = "match-server",
		playerId = "local",
		mode = "dev",
		players = {
			{ id = "local", hp = 6, dice_count = 5 },
			{ id = "opponent-1", hp = 6, dice_count = 5 },
		},
	})
	local emitted = {}
	adapter.bridge.emit = function(type_, out_payload)
		emitted[#emitted + 1] = {
			type = type_,
			payload = out_payload,
		}
	end

	adapter:on_bridge_message({
		type = "SERVER_SNAPSHOT",
		payload = {
			matchId = "match-server",
			revision = 3,
			publicSnapshot = {
				kind = "public",
				matchId = "match-server",
				revision = 3,
				phase = "bidding",
				hud = "bidding",
				match = {
					id = "match-server",
					status = "ready",
					mode = "dev",
					localPlayerId = "local",
					turnCount = 2,
					eventsHash = "server-hash",
				},
				turn = {
					activePlayerId = "opponent-1",
					previousPlayerId = "local",
					roundIndex = 0,
					isFirstShake = false,
				},
				players = {
					{ id = "local", name = "You", hp = 2, bullets = 4, eliminated = false },
					{ id = "opponent-1", name = "Opponent", hp = 6, bullets = 3, eliminated = false },
				},
					bidding = {
					currentBid = {
						playerId = "local",
						count = 2,
						face = 4,
					},
					suggestedBid = {
						count = 2,
						face = 5,
						},
					},
					shake = {
						requiredCount = 6,
						counts = {
							["local"] = 2,
						},
						checked = {},
					},
				},
			privateDelta = {
				kind = "private_delta",
				matchId = "match-server",
				revision = 3,
				hud = "bidding",
				viewerPlayerId = "local",
				dice = { 1, 2, 3, 4, 5 },
				cylinder = {
					chamberIndex = 1,
					slots = { true, false, true, false, true, false },
				},
			},
		},
	})
	assert_eq(adapter.server_revision, 3, "server snapshot revision cached")
	assert_eq(emitted[1].type, "SERVER_SNAPSHOT_RECEIVED", "server snapshot ack type")
	assert_eq(emitted[1].payload.matchId, "match-server", "server snapshot ack match id")
	local synced = store:get_state()
	assert_eq(synced.flow.phase, "bidding", "server snapshot applies phase")
	assert_eq(synced.turn.active_player_id, "opponent-1", "server snapshot applies active player")
	assert_eq(synced.match.revision, 3, "server snapshot applies revision")
	assert_eq(synced.bidding.current_bid.player_id, "local", "server snapshot applies current bid")
	assert_eq(synced.bidding.my_bid.count, 2, "next turn draft starts at previous bid count")
	assert_eq(synced.bidding.my_bid.face, 4, "next turn draft starts at previous bid face")
	assert_eq(synced.shake.required_count, 6, "server snapshot normalizes shake required count")
	assert_eq(synced.shake.counts["local"], 2, "server snapshot keeps per-player shake count")
	assert_eq(synced.players.by_id["local"].hp, 2, "server snapshot applies public hp")
	assert_eq(synced.players.by_id["local"].dice[5], 5, "server snapshot applies private dice")
	assert_eq(synced.players.by_id["local"].cylinder.slots[1].loaded, true, "server snapshot applies private cylinder")

	adapter:on_bridge_message({
		type = "COMMAND_REJECTED",
		payload = {
			matchId = "match-server",
			commandId = "cmd-1",
			code = "STALE_REVISION",
			revision = 4,
		},
	})
	assert_eq(adapter.last_command_rejected.code, "STALE_REVISION", "command reject cached")
	assert_eq(emitted[2].type, "COMMAND_REJECTED_RECEIVED", "command reject ack type")
	assert_eq(emitted[2].payload.commandId, "cmd-1", "command reject ack command id")
end

function M.test_bid_challenge_and_second_shake_load()
	local store = new_store()
	start_match(store, {
		sessionId = "session-2",
		matchId = "match-2",
		playerId = "local",
		mode = "casual",
		players = {
			{ id = "local", hp = 6, dice_count = 5 },
			{ id = "opponent-1", hp = 6, dice_count = 5 },
			{ id = "opponent-2", hp = 6, dice_count = 5 },
		},
	})
	load_setup(store, { 1, 2, 3 })
	complete_all_shakes(store, fixed_rng(2))
	check_dice_and_open_bidding(store)

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
	assert_eq(active_player.available_actions[1].type, "bid", "next bidder can bid during reload")

	local low = store:dispatch(actions.bid_raise({
		player_id = "opponent-1",
		count = 1,
		face = 2,
	}))
	assert_eq(low.ok, false, "low bid is still rejected during reload")
	assert_eq(low.error, "too_low", "bid validation still applies during reload")

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

	complete_all_shakes(store, fixed_rng(3))
	state = store:get_state()
	assert_eq(state.flow.phase, "dice_check", "exact shake moves to dice check")
	assert_eq(state.pending_load, nil, "exact reward does not create active reload")
end

function M.test_bid_reload_pipeline_gates_after_next_bid()
	local store = new_store()
	start_match(store, {
		sessionId = "session-pipeline",
		matchId = "match-pipeline",
		playerId = "local",
		mode = "casual",
		players = {
			{ id = "local", hp = 6, dice_count = 5 },
			{ id = "opponent-1", hp = 6, dice_count = 5 },
			{ id = "opponent-2", hp = 6, dice_count = 5 },
		},
	})
	load_setup(store, { 1, 2, 3 })
	complete_all_shakes(store, fixed_rng(2))
	check_dice_and_open_bidding(store)

	dispatch_ok(store, actions.bid_raise({
		player_id = "local",
		count = 1,
		face = 2,
	}))
	local snapshot = qa_cli.status_snapshot(store:get_state())
	assert_eq(find_player(snapshot, "local").available_actions[1].type, "load", "loader can load")
	assert_eq(find_player(snapshot, "opponent-1").available_actions[1].type, "bid", "next player can bid")

	dispatch_ok(store, actions.bid_raise({
		player_id = "opponent-1",
		count = 2,
		face = 2,
	}))
	local state = store:get_state()
	assert_eq(state.pending_load.player_id, "local", "previous reload remains active")
	assert_eq(state.bidding.deferred_load.player_id, "opponent-1", "next reload is deferred")
	assert_eq(state.bidding.reload_gate.countdown_seconds, 3, "reload gate uses three seconds")
	snapshot = qa_cli.status_snapshot(state)
	assert_eq(find_player(snapshot, "local").available_actions[1].type, "load", "loader remains interactive")
	assert_eq(find_player(snapshot, "opponent-2").available_actions[1], nil, "third bid waits for reload")

	dispatch_ok(store, actions.bid_reload_timeout())
	state = store:get_state()
	assert_eq(state.pending_load.player_id, "opponent-1", "deferred reload is promoted")
	assert_eq(state.players.by_id["local"].cylinder.slots[4].loaded, true, "timeout loads first empty slot")
	assert_eq(state.bidding.reload_gate, nil, "gate clears after previous reload")
	snapshot = qa_cli.status_snapshot(state)
	assert_eq(find_player(snapshot, "opponent-1").available_actions[1].type, "load", "next loader can load")
	assert_eq(find_player(snapshot, "opponent-2").available_actions[1].type, "bid", "third player can bid")

	load_pending(store, { 4 })
	assert_eq(store:get_state().pending_load, nil, "pipeline drains after deferred reload")
end

function M.test_skull_bid_triggers_the_bidders_own_roulette()
	local store = new_store()
	start_match(store, {
		sessionId = "session-skull-bid",
		matchId = "match-skull-bid",
		playerId = "local",
		mode = "casual",
		players = {
			{ id = "local", hp = 6, dice_count = 5 },
			{ id = "opponent-1", hp = 6, dice_count = 5 },
			{ id = "opponent-2", hp = 6, dice_count = 5 },
		},
	})
	load_setup(store, { 1, 2, 3 })
	complete_all_shakes(store, fixed_rng(2))
	check_dice_and_open_bidding(store)

	dispatch_ok(store, actions.bid_raise({
		player_id = "local",
		count = 1,
		face = 1,
	}, fixed_rng(1)))

	local state = store:get_state()
	assert_eq(state.bidding.current_bid.player_id, "local", "surviving skull bid is accepted")
	assert_eq(state.bidding.skull_roulette.player_id, "local", "roulette belongs to bidder")
	assert_eq(state.bidding.skull_roulette.hit, true, "loaded chamber fires")
	assert_eq(state.bidding.skull_roulette.hp_before, 6, "roulette records previous hp")
	assert_eq(state.bidding.skull_roulette.hp_after, 5, "roulette records damaged hp")
	assert_eq(state.players.by_id["local"].hp, 5, "bidder takes self damage")
	assert_eq(state.players.by_id["local"].bullets, 2, "fired bullet is consumed")
	assert_eq(state.pending_load.player_id, "local", "surviving bidder keeps normal reload")
end

function M.test_skull_duel_adjudication_halves_and_floors_the_rail_count()
	local players = {
		by_id = {
			first = {
				eliminated = false,
				dice = { 1, 1, 1, 2, 3 },
			},
			second = {
				eliminated = false,
				dice = { 2, 3, 4, 5, 6 },
			},
		},
	}

	assert_eq(duel_rules.required_count({ count = 7, face = 1 }), 3, "odd skull bid floors")
	assert_eq(duel_rules.required_count({ count = 8, face = 1 }), 4, "even skull bid halves")
	assert_eq(duel_rules.required_count({ count = 1, face = 1 }), 0, "minimum skull bid reaches zero")
	assert_eq(duel_rules.required_count({ count = 7, face = 4 }), 7, "normal face is unchanged")

	local exact = duel_rules.judge({ count = 7, face = 1 }, players)
	assert_eq(exact.verdict, "EXACT", "three skulls exactly satisfy rail seven")
	assert_eq(exact.actual, 3, "only skulls count for a skull bid")
	assert_eq(exact.required_count, 3, "judge exposes effective requirement")
	assert_eq(exact.delta, 0, "exact skull bid has no shot delta")

	local short = duel_rules.judge({ count = 8, face = 1 }, {
		by_id = {
			first = { eliminated = false, dice = { 1, 1, 2, 3, 4 } },
		},
	})
	assert_eq(short.verdict, "SHORT", "two skulls are short of effective four")
	assert_eq(short.delta, 2, "short delta uses effective requirement")

	local over = duel_rules.judge({ count = 4, face = 1 }, players)
	assert_eq(over.verdict, "OVER", "three skulls exceed effective two")
	assert_eq(over.delta, 1, "over delta uses effective requirement")
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
			{ id = "local", hp = 6, dice_count = 5 },
			{ id = "opponent-1", hp = 1, dice_count = 5 },
		},
	})

	load_setup(store, { 1, 2, 3 })
	local state = store:get_state()
	assert_eq(state.turn.active_player_id, "opponent-1", "first player preserved after setup")

	complete_all_shakes(store, fixed_rng(6))
	check_dice_and_open_bidding(store)
	dispatch_ok(store, actions.bid_raise({
		player_id = "opponent-1",
		count = 10,
		face = 4,
	}))
	load_pending(store, { 2 })
	dispatch_ok(store, actions.bid_challenge(fixed_rng(6)))
	state = store:get_state()
	assert_eq(state.duel.judge.verdict, "SHORT", "short verdict")
	assert_eq(state.duel.resolution, nil, "challenge does not precompute short resolution")
	assert_eq(state.duel.revolver_spin.player_id, "local", "short spins challenger shooter")
	assert_eq(state.duel.revolver_spin.steps, 6, "short spin steps recorded")

	dispatch_ok(store, actions.duel_execute())
	state = store:get_state()
	assert_eq(state.duel.phase, "executing", "short execute keeps duel hud active")
	assert_eq(state.duel.resolution.kind, "duel_shots", "short execute builds shot resolution")

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

function M.test_duel_short_challenger_shoots_previous_bidder()
	local store = new_store()
	start_match(store, {
		sessionId = "session-4",
		matchId = "match-4",
		playerId = "local",
		mode = "casual",
		firstPlayerId = "opponent-1",
		players = {
			{ id = "local", hp = 6, dice_count = 5 },
			{ id = "opponent-1", hp = 6, dice_count = 5 },
		},
	})
	load_setup(store, { 1, 2, 3 })
	complete_all_shakes(store, fixed_rng(6))
	check_dice_and_open_bidding(store)
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
	assert_eq(state.duel.revolver_spin.player_id, "local", "short spins challenger shooter")
	assert_eq(state.duel.revolver_spin.steps, 6, "short spin steps recorded")
	local cylinder_slots_before = {}
	for index, slot in ipairs(state.players.by_id["local"].cylinder.slots) do
		cylinder_slots_before[index] = slot.loaded == true
	end

	dispatch_ok(store, actions.duel_execute())
	state = store:get_state()
	assert_eq(state.duel.phase, "executing", "short execute keeps duel hud active")
	assert_eq(state.duel.resolution.shooter_id, "local", "short shooter is challenger")
	assert_eq(state.duel.resolution.roulette_subject_id, "local", "short consumes challenger cylinder")
	assert_eq(state.duel.resolution.target_id, "opponent-1", "short targets previous bidder")
	for index, loaded in ipairs(cylinder_slots_before) do
		assert_eq(
			state.duel.resolution.cylinder_slots_before[index],
			loaded,
			"short resolution preserves pre-shot cylinder slot " .. tostring(index)
		)
	end
	dispatch_ok(store, actions.round_advance())
	state = store:get_state()
	assert_eq(selectors.local_player(state).hp, 6, "short does not damage challenger")
	assert_eq(state.players.by_id["opponent-1"].hp, 3, "short damages previous bidder")
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
			{ id = "local", hp = 6, dice_count = 5 },
			{ id = "opponent-1", hp = 6, dice_count = 5 },
		},
	})
	load_setup(store, { 1, 2, 3 })
	complete_all_shakes(store, fixed_rng(6))
	check_dice_and_open_bidding(store)
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
	assert_eq(selectors.local_player(state).hp, 6, "spin misses challenger")
	assert_eq(state.turn.active_player_id, "local", "challenger starts next shake")

	complete_all_shakes(store, fixed_rng(3))
	state = store:get_state()
	if state.pending_load then
		load_pending(store, { 1 })
		state = store:get_state()
	end
	assert_eq(state.flow.phase, "dice_check", "next round reaches dice check")
	check_dice_and_open_bidding(store)
	state = store:get_state()
	assert_eq(state.turn.active_player_id, "local", "challenger starts next bidding")
end

function M.test_duel_spender_reloads_before_next_shake()
	local store = new_store()
	start_match(store, {
		sessionId = "session-6",
		matchId = "match-6",
		playerId = "local",
		mode = "casual",
		firstPlayerId = "local",
		players = {
			{ id = "local", hp = 6, dice_count = 5 },
			{
				id = "opponent-1",
				hp = 6,
				dice_count = 5,
				initial_loaded_slots = { 1 },
			},
			{ id = "opponent-2", hp = 6, dice_count = 5 },
		},
	})
	load_setup(store, { 1, 2, 3 })
	complete_all_shakes(store, fixed_rng(6))
	check_dice_and_open_bidding(store)
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
	assert_eq(state.players.by_id["opponent-1"].hp, 6, "previous bidder spends bullets without self damage")
	assert_eq(state.players.by_id["opponent-2"].hp, 4, "challenger takes previous bidder shots")
	assert_eq(state.turn.active_player_id, "opponent-2", "challenger starts next shake")
	assert_eq(state.pending_load.player_id, "opponent-1", "duel bullet spender reloads")
	assert_eq(state.pending_load.source, "duel", "duel reload source")
	assert_eq(state.flow.phase, "revolver_reload", "duel reload precedes next shake")
	assert_eq(selectors.hud_kind(state), "loading", "remote reload uses loading hud")

	local snapshot = qa_cli.status_snapshot(state)
	local local_player = find_player(snapshot, "local")
	local spender = find_player(snapshot, "opponent-1")
	assert_eq(local_player.available_actions[1], nil, "local cannot load remote pending")
	assert_eq(spender.available_actions[1].type, "load", "spender can load")

	load_pending(store, { 1 })
	state = store:get_state()
	assert_eq(state.flow.phase, "cup_shake", "duel reload advances to shake")
	assert_eq(state.pending_load, nil, "duel reload is cleared before shake")

	complete_all_shakes(store, fixed_rng(3))
	state = store:get_state()
	assert_eq(state.flow.phase, "dice_check", "next shake advances to dice check")
	assert_eq(state.pending_load, nil, "next shake does not create another reload")
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
			{ id = "local", hp = 6, dice_count = 5 },
			{
				id = "opponent-1",
				hp = 6,
				dice_count = 5,
				initial_loaded_slots = { 1, 2, 3, 4, 5, 6 },
			},
			{ id = "opponent-2", hp = 6, dice_count = 5 },
			{ id = "opponent-3", hp = 6, dice_count = 5 },
		},
	})
	load_setup(store, { 1, 2, 3 })
	complete_all_shakes(store, fixed_rng(2))
	check_dice_and_open_bidding(store)
	dispatch_ok(store, actions.bid_raise({
		player_id = "local",
		count = 1,
		face = 2,
	}))
	load_pending(store, { 4 })
	dispatch_ok(store, actions.bid_raise({
		player_id = "opponent-1",
		count = 4,
		face = 2,
	}))
	dispatch_ok(store, actions.bid_challenge(fixed_rng(6)))

	local state = store:get_state()
	assert_eq(state.duel.challenger_id, "opponent-2", "samuel is challenger")
	assert_eq(state.duel.judge.verdict, "OVER", "over verdict")

	dispatch_ok(store, actions.duel_execute())
	dispatch_ok(store, actions.round_advance())
	state = store:get_state()
	assert_eq(state.players.by_id["opponent-2"].eliminated, true, "challenger is eliminated")
	assert_eq(state.turn.active_player_id, "opponent-3", "next seat starts after eliminated challenger")

	if state.pending_load then
		assert_eq(state.flow.phase, "revolver_reload", "duel spender reloads before the next shake")
		load_pending(store, { 2 })
		state = store:get_state()
	end
	assert_eq(state.flow.phase, "cup_shake", "reload completion starts the next shake")
	complete_all_shakes(store, fixed_rng(3))
	state = store:get_state()
	assert_eq(state.flow.phase, "dice_check", "next seat reaches dice check")
	for _, player_id in ipairs(state.players.order or {}) do
		local player = store:get_state().players.by_id[player_id]
		if player and not player.eliminated and (player.hp or 0) > 0 then
			dispatch_ok(store, actions.dice_check(player_id))
		end
	end
	dispatch_ok(store, actions.bidding_open())
	state = store:get_state()
	assert_eq(state.turn.active_player_id, "opponent-3", "next seat starts bidding")
end

return M
