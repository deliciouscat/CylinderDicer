local player_carousel_view = require("ui.player_carousel.player_carousel_view")

local M = {}

local function assert_eq(actual, expected, label)
	if actual ~= expected then
		error((label or "assert_eq") .. ": expected " .. tostring(expected) .. ", got " .. tostring(actual), 2)
	end
end

function M.test_only_authoritative_current_bidder_receives_bid_face()
	local bid = {
		player_id = "previous",
		count = 7,
		face = 3,
	}

	assert_eq(player_carousel_view.bid_face_for_player(bid, "previous"), 3, "previous bidder face")
	assert_eq(player_carousel_view.bid_face_for_player(bid, "active"), nil, "active player has no bid face")
	assert_eq(player_carousel_view.bid_face_for_player(nil, "previous"), nil, "no stale bid face")
end

function M.test_invalid_bid_faces_are_not_rendered()
	assert_eq(player_carousel_view.bid_face_for_player({ player_id = "p", face = 0 }, "p"), nil, "zero")
	assert_eq(player_carousel_view.bid_face_for_player({ player_id = "p", face = 7 }, "p"), nil, "above max")
	assert_eq(player_carousel_view.bid_face_for_player({ player_id = "p", face = 2.5 }, "p"), nil, "fractional")
end

return M
