local M = {}

M.DEFAULT_LIMITS = {
	min_count = 1,
	max_count = 36,
	min_face = 1,
	max_face = 6,
}

local function rank(bid)
	return (bid.count * 10) + bid.face
end

function M.validate(current, candidate, limits)
	limits = limits or M.DEFAULT_LIMITS

	if not candidate then
		return {
			ok = false,
			reason = "missing_bid",
		}
	end

	if type(candidate.count) ~= "number" then
		return {
			ok = false,
			reason = "count_range",
		}
	end

	if type(candidate.face) ~= "number" then
		return {
			ok = false,
			reason = "face_range",
		}
	end

	if candidate.count < limits.min_count or candidate.count > limits.max_count then
		return {
			ok = false,
			reason = "count_range",
		}
	end

	if candidate.face < limits.min_face or candidate.face > limits.max_face then
		return {
			ok = false,
			reason = "face_range",
		}
	end

	if current and rank(candidate) <= rank(current) then
		return {
			ok = false,
			reason = "too_low",
		}
	end

	return {
		ok = true,
	}
end

function M.clamp_count(count, limits)
	limits = limits or M.DEFAULT_LIMITS
	if count < limits.min_count then
		return limits.min_count
	end
	if count > limits.max_count then
		return limits.max_count
	end
	return count
end

function M.clamp_face(face, limits)
	limits = limits or M.DEFAULT_LIMITS
	if face < limits.min_face then
		return limits.min_face
	end
	if face > limits.max_face then
		return limits.max_face
	end
	return face
end

return M
