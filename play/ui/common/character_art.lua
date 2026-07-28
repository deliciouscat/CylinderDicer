local characters = require("game.characters")

local M = {}

local TEXTURE_BY_CHARACTER = {
	["rosemund"] = "rosemund",
	["hush-feather"] = "hush_feather",
	["samuel-saber"] = "samuel_saber",
	["zippo-jay"] = "zippo_jay",
	["calamity-kate"] = "calamity_kate",
	["the-kid"] = "the_kid",
}

local ASPECT_RATIO_BY_CHARACTER = {
	["rosemund"] = 676 / 929,
	["hush-feather"] = 699 / 923,
	["samuel-saber"] = 618 / 924,
	["zippo-jay"] = 855 / 1049,
	["calamity-kate"] = 951 / 907,
	["the-kid"] = 552 / 862,
}

for _, character_key in ipairs(characters.KEYS) do
	assert(TEXTURE_BY_CHARACTER[character_key], "missing character texture: " .. character_key)
	assert(ASPECT_RATIO_BY_CHARACTER[character_key], "missing character aspect ratio: " .. character_key)
end

local function character_key(player)
	if not player then
		return nil
	end
	return player.character_key or player.skin or player.id
end

function M.texture_name(player)
	return TEXTURE_BY_CHARACTER[character_key(player)]
end

function M.aspect_ratio(player)
	return ASPECT_RATIO_BY_CHARACTER[character_key(player)]
end

function M.portrait_width(player, height)
	local aspect_ratio = M.aspect_ratio(player)
	if not aspect_ratio then
		return nil
	end
	return math.max(0.0, tonumber(height) or 0.0) * aspect_ratio
end

function M.is_known(player)
	return M.texture_name(player) ~= nil
end

return M
