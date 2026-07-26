local audio_events = require("game.core.audio_events")
local cylinder = require("game.model.rules.cylinder")

local M = {}

local function assert_eq(actual, expected, label)
	if actual ~= expected then
		error((label or "assert_eq") .. ": expected " .. tostring(expected) .. ", got " .. tostring(actual), 2)
	end
end

local function player(id, bullets)
	local result = {
		id = id,
		hp = 6,
		bullets = bullets,
		cylinder = cylinder.new(6),
	}
	for index = 1, bullets do
		result.cylinder = cylinder.load(result.cylinder, index)
	end
	return result
end

local function state(options)
	options = options or {}
	return {
		match = {
			match_id = options.match_id or "match-1",
			status = options.status or "ready",
			local_player_id = "local",
			winner_id = options.winner_id,
		},
		flow = {
			phase = options.phase or "revolver_reload",
		},
		players = {
			order = { "local", "opponent" },
			by_id = {
				["local"] = player("local", options.local_bullets or 0),
				opponent = player("opponent", options.opponent_bullets or 0),
			},
		},
		pending_load = options.pending_count and {
			player_id = options.pending_player_id or "local",
			count = options.pending_count,
		} or nil,
	}
end

function M.test_new_active_match_plays_start_bell_once()
	local current = audio_events.snapshot(state())
	local cues = audio_events.cues(nil, current)
	assert_eq(cues[1], "start_bell", "new match cue")
	assert_eq(#audio_events.cues(current, current), 0, "same snapshot is silent")
end

function M.test_reload_uses_clasp_only_for_the_last_pending_bullet()
	local before = audio_events.snapshot(state({ pending_count = 2, local_bullets = 1 }))
	local middle = audio_events.snapshot(state({ pending_count = 1, local_bullets = 2 }))
	local after = audio_events.snapshot(state({ local_bullets = 3, phase = "cup_shake" }))

	assert_eq(audio_events.cues(before, middle)[1], "reload", "intermediate load")
	assert_eq(audio_events.cues(middle, after)[1], "clasp", "final load")
	assert_eq(#audio_events.cues(after, after), 0, "reload snapshot is idempotent")
end

function M.test_dice_reveal_plays_drop_on_phase_entry_not_on_check_submission()
	local shaking = audio_events.snapshot(state({ phase = "cup_shake" }))
	local reveal = audio_events.snapshot(state({ phase = "dice_check" }))
	local checked = audio_events.snapshot(state({ phase = "bidding_gap" }))

	assert_eq(audio_events.cues(shaking, reveal)[1], "drop", "reveal phase entry")
	assert_eq(#audio_events.cues(reveal, reveal), 0, "stable reveal snapshot")
	assert_eq(#audio_events.cues(reveal, checked), 0, "dice check submission transition")
end

function M.test_match_complete_selects_local_victory_or_placement()
	local before = audio_events.snapshot(state({ phase = "duel" }))
	local victory = audio_events.snapshot(state({
		status = "complete",
		phase = "complete",
		winner_id = "local",
	}))
	local placement = audio_events.snapshot(state({
		status = "complete",
		phase = "complete",
		winner_id = "opponent",
	}))

	assert_eq(audio_events.cues(before, victory)[1], "victory", "winner cue")
	assert_eq(audio_events.cues(before, placement)[1], "placement", "non-winner cue")
	assert_eq(#audio_events.cues(victory, victory), 0, "completion snapshot is idempotent")
end

function M.test_refreshing_a_completed_match_does_not_replay_end_audio()
	local completed = audio_events.snapshot(state({
		status = "complete",
		phase = "complete",
		winner_id = "local",
	}))
	assert_eq(#audio_events.cues(nil, completed), 0, "completed match baseline")
end

return M
