local actions = require("game.model.actions")
local reducers = require("game.model.reducers")

local M = {}

local function assert_eq(actual, expected, label)
	if actual ~= expected then
		error((label or "assert_eq") .. ": expected " .. tostring(expected) .. ", got " .. tostring(actual), 2)
	end
end

function M.test_server_snapshot_preserves_character_and_duel_identity()
	local result = reducers.reduce(reducers.initial_state(), actions.server_snapshot_apply({
		publicSnapshot = {
			matchId = "match-1",
			revision = 7,
			phase = "duel",
			match = {
				id = "match-1",
				status = "ready",
				mode = "dev",
				localPlayerId = "qa-player-1",
			},
			turn = {
				activePlayerId = "qa-player-3",
				previousPlayerId = "qa-player-2",
			},
			players = {
				{ id = "qa-player-1", name = "You", hp = 6, bullets = 3, skin = "rosemund", portraitState = "front" },
				{ id = "qa-player-2", name = "Hush Feather", hp = 6, bullets = 3, characterKey = "hush-feather", skin = "hush-feather", portraitState = "front" },
				{ id = "qa-player-3", name = "Samuel Saber", hp = 6, bullets = 3, characterKey = "samuel-saber", skin = "samuel-saber", portraitState = "damage" },
			},
			duel = {
				challengerId = "qa-player-3",
				previousBidderId = "qa-player-2",
				judge = {
					verdict = "EXACT",
					actual = 3,
					requiredCount = 3,
					delta = 0,
					rawDelta = 0,
				},
				resolution = {
					kind = "duel_shots",
					cylinderSlotsBefore = { true, false, true, false, true, false },
					steps = {},
				},
				players = {
					{ id = "qa-player-2", name = "Hush Feather", skin = "hush-feather" },
					{ id = "qa-player-3", name = "Samuel Saber", skin = "samuel-saber" },
				},
			},
		},
		privateDelta = {
			viewerPlayerId = "qa-player-1",
		},
	}))

	assert_eq(result.error, nil, "snapshot apply")
	assert_eq(result.state.players.by_id["qa-player-1"].skin, "rosemund", "local skin")
	assert_eq(result.state.players.by_id["qa-player-2"].skin, "hush-feather", "Hush skin")
	assert_eq(result.state.players.by_id["qa-player-3"].skin, "samuel-saber", "Samuel skin")
	assert_eq(result.state.players.by_id["qa-player-2"].character_key, "hush-feather", "Hush character identity")
	assert_eq(result.state.players.by_id["qa-player-3"].character_key, "samuel-saber", "Samuel character identity")
	assert_eq(result.state.players.by_id["qa-player-3"].portrait_state, "damage", "portrait state")
	assert_eq(result.state.duel.challenger_id, "qa-player-3", "duel challenger")
	assert_eq(result.state.duel.previous_bidder_id, "qa-player-2", "duel previous bidder")
	assert_eq(result.state.duel.judge.required_count, 3, "duel required count normalized")
	assert_eq(result.state.duel.resolution.cylinder_slots_before[1], true, "loaded slot normalized")
	assert_eq(result.state.duel.resolution.cylinder_slots_before[2], false, "empty slot normalized")
end

function M.test_server_snapshot_normalizes_result_and_reopens_after_spectating()
	local state = reducers.initial_state()
	state.ui.spectating = true
	local result = reducers.reduce(state, actions.server_snapshot_apply({
		publicSnapshot = {
			matchId = "match-result",
			revision = 9,
			phase = "complete",
			match = {
				id = "match-result",
				status = "complete",
				mode = "ranked",
				localPlayerId = "player-2",
				winnerId = "player-1",
				result = {
					playerCount = 2,
					rated = true,
					placements = {
						{ playerId = "player-1", place = 1, playerCount = 2, rated = true, mmrBefore = 1000, mmrAfter = 1016, mmrDelta = 16 },
						{ playerId = "player-2", place = 2, playerCount = 2, rated = true, mmrBefore = 1000, mmrAfter = 984, mmrDelta = -16 },
					},
				},
			},
			players = {
				{ id = "player-1", name = "Winner", hp = 1, bullets = 0, eliminated = false },
				{ id = "player-2", name = "Local", hp = 0, bullets = 0, eliminated = true },
			},
		},
		privateDelta = { viewerPlayerId = "player-2" },
	}))

	assert_eq(result.state.match.result.player_count, 2, "result player count")
	assert_eq(result.state.match.result.placements[2].mmr_before, 1000, "rating before")
	assert_eq(result.state.match.result.placements[2].mmr_after, 984, "rating after")
	assert_eq(result.state.ui.spectating, false, "completion reopens result after spectating")
end

return M
