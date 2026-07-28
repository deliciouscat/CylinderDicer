local M = {}

M.KEYS = {
	"rosemund",
	"hush-feather",
	"samuel-saber",
	"zippo-jay",
	"calamity-kate",
	"the-kid",
}

function M.legacy_seat_key(seat_index)
	local index = math.max(0, math.floor(tonumber(seat_index) or 0))
	return M.KEYS[(index % #M.KEYS) + 1]
end

return M
