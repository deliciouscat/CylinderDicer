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
				{ id = "qa-player-2", name = "Hush Feather", hp = 6, bullets = 3, skin = "hush-feather", portraitState = "front" },
				{ id = "qa-player-3", name = "Samuel Saber", hp = 6, bullets = 3, skin = "samuel-saber", portraitState = "damage" },
			},
			duel = {
				challengerId = "qa-player-3",
				previousBidderId = "qa-player-2",
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
	assert_eq(result.state.players.by_id["qa-player-3"].portrait_state, "damage", "portrait state")
	assert_eq(result.state.duel.challenger_id, "qa-player-3", "duel challenger")
	assert_eq(result.state.duel.previous_bidder_id, "qa-player-2", "duel previous bidder")
end

return M
