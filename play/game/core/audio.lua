local M = {}

local SFX = {
	start_bell = "/audio#start_bell",
	victory = "/audio#victory",
	placement = "/audio#placement",
	roll = "/audio#roll",
	drop = "/audio#drop",
	reload = "/audio#reload",
	clasp = "/audio#clasp",
	tick = "/audio#tick",
	bang = "/audio#bang",
	button_click = "/audio#button_click",
	click = "/audio#button_click",
	click_empty = "/audio#button_click",
}
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
