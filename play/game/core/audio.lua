local M = {}

local SFX = {
	click = "/audio#click",
	click_empty = "/audio#click_empty",
	shake = "/audio#shake",
	load = "/audio#load",
	shot = "/audio#shot",
	hit = "/audio#hit",
	miss = "/audio#miss",
}

local function can_play()
	return sound and sound.play
end

function M.play_sfx(name, opts)
	local url = SFX[name]
	if url and can_play() then
		sound.play(url, opts)
	end
end

function M.play_bgm(name, opts)
	if can_play() then
		sound.play("/audio#bgm_" .. tostring(name), opts)
	end
end

function M.stop_bgm(name)
	if sound and sound.stop then
		sound.stop("/audio#bgm_" .. tostring(name))
	end
end

function M.play_voice(name, opts)
	if can_play() then
		sound.play("/audio#voice_" .. tostring(name), opts)
	end
end

return M
