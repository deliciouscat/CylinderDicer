local M = {}

function M.bid_face_for_player(current_bid, player_id)
	if not current_bid or not player_id or current_bid.player_id ~= player_id then
		return nil
	end
	local face = tonumber(current_bid.face)
	if not face or face < 1 or face > 6 or face % 1 ~= 0 then
		return nil
	end
	return face
end

return M
