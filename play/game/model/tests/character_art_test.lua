local character_art = require("ui.common.character_art")

local M = {}

local function assert_eq(actual, expected, label)
	if actual ~= expected then
		error((label or "assert_eq") .. ": expected " .. tostring(expected) .. ", got " .. tostring(actual), 2)
	end
end

local function assert_close(actual, expected, label)
	if math.abs(actual - expected) > 0.0001 then
		error((label or "assert_close") .. ": expected " .. tostring(expected) .. ", got " .. tostring(actual), 2)
	end
end

function M.test_character_key_owns_art_independent_of_player_id_or_seat()
	assert_eq(character_art.texture_name({
		id = "player-5",
		name = "Hush Feather",
		character_key = "hush-feather",
		skin = "calamity-kate",
	}), "hush_feather", "character key wins over legacy skin")
end

function M.test_legacy_skin_remains_a_compatibility_fallback()
	assert_eq(character_art.texture_name({
		id = "opponent-2",
		skin = "samuel-saber",
	}), "samuel_saber", "legacy skin resolves")
end

function M.test_unknown_character_does_not_disguise_itself_as_rosemund()
	assert_eq(character_art.texture_name({
		id = "unknown-bot",
		character_key = "unknown-character",
	}), nil, "unknown character is explicit")
end

function M.test_portrait_width_preserves_character_source_aspect_ratio()
	local player = {
		character_key = "calamity-kate",
	}
	assert_close(
		character_art.portrait_width(player, 420),
		420 * 951 / 907,
		"Calamity Kate keeps her wide cloak"
	)
	assert_eq(
		character_art.portrait_width({ character_key = "unknown-character" }, 420),
		nil,
		"unknown character has no implicit geometry"
	)
end

return M
