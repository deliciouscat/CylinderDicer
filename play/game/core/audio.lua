local M = {}

-- Register component URLs here only after the matching sound resources and
-- /audio game object exist in the bootstrap collection.
local SFX = {}
local BGM = {}
local VOICE = {}

local function play(url, opts)
	if not url then
		return false
	end
	sound.play(url, opts)
	return true
end

function M.play_sfx(name, opts)
	return play(SFX[name], opts)
end

function M.play_bgm(name, opts)
	return play(BGM[name], opts)
end

function M.stop_bgm(name)
	local url = BGM[name]
	if not url then
		return false
	end
	sound.stop(url)
	return true
end

function M.play_voice(name, opts)
	return play(VOICE[name], opts)
end

return M
