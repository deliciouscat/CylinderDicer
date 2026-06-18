local M = {}
local Gesture = {}
Gesture.__index = Gesture

local function vector3(x, y, z)
	if vmath and vmath.vector3 then
		return vmath.vector3(x, y, z)
	end
	return {
		x = x,
		y = y,
		z = z,
	}
end

local function id_matches(action_id, name)
	if hash then
		return action_id == hash(name)
	end
	return action_id == name
end

function M.new(bounds)
	return setmetatable({
		bounds = bounds,
		dragging = false,
		origin = nil,
		last = nil,
	}, Gesture)
end

function Gesture:classify_release(action)
	local x = action.x or 0
	local y = action.y or 0
	local origin = self.origin or vector3(x, y, 0)
	local dx = x - origin.x
	local dy = y - origin.y
	local distance = math.sqrt((dx * dx) + (dy * dy))

	if distance < 8 then
		return {
			kind = "tap",
			x = x,
			y = y,
		}
	end

	return {
		kind = "drag_end",
		dx = dx,
		dy = dy,
	}
end

function Gesture:feed(action_id, action)
	action = action or {}

	if action.touch and action.touch[1] then
		action = action.touch[1]
	end

	if id_matches(action_id, "touch") or id_matches(action_id, "pointer") then
		if action.pressed then
			self.dragging = true
			self.origin = vector3(action.x or 0, action.y or 0, 0)
			self.last = self.origin
			return {
				kind = "press",
				x = self.origin.x,
				y = self.origin.y,
			}
		end

		if action.released then
			self.dragging = false
			return self:classify_release(action)
		end

		if self.dragging then
			local dx = action.dx
			local dy = action.dy
			if dx == nil or dy == nil then
				local x = action.x or self.last.x
				local y = action.y or self.last.y
				dx = x - self.last.x
				dy = y - self.last.y
				self.last = vector3(x, y, 0)
			end
			return {
				kind = "drag",
				dx = dx,
				dy = dy,
			}
		end
	elseif id_matches(action_id, "scroll") then
		return {
			kind = "scroll",
			amount = action.value or action.y or 0,
		}
	elseif id_matches(action_id, "key_left") and action.pressed then
		return {
			kind = "key_left",
		}
	elseif id_matches(action_id, "key_right") and action.pressed then
		return {
			kind = "key_right",
		}
	elseif id_matches(action_id, "shake") and action.pressed then
		return {
			kind = "shake",
		}
	end

	return nil
end

return M
