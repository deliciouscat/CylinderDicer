local M = {}

local DEFAULT_SIZE = 6

local function clone_cylinder(cyl)
	local next = {
		chamber_index = cyl.chamber_index or 1,
		slots = {},
	}

	for i, slot in ipairs(cyl.slots or {}) do
		next.slots[i] = {
			loaded = slot.loaded == true,
		}
	end

	return next
end

local function wrap_next(index, size)
	local next = index + 1
	if next > size then
		return 1
	end
	return next
end

function M.new(size)
	size = size or DEFAULT_SIZE

	local slots = {}
	for i = 1, size do
		slots[i] = {
			loaded = false,
		}
	end

	return {
		chamber_index = 1,
		slots = slots,
	}
end

function M.loaded_count(cyl)
	local count = 0
	for _, slot in ipairs(cyl.slots or {}) do
		if slot.loaded then
			count = count + 1
		end
	end
	return count
end

function M.load(cyl, slot_index)
	if not cyl or not cyl.slots or not cyl.slots[slot_index] then
		return cyl, false, "invalid_slot"
	end

	if cyl.slots[slot_index].loaded then
		return cyl, false, "slot_loaded"
	end

	local next = clone_cylinder(cyl)
	next.slots[slot_index].loaded = true
	return next, true
end

function M.load_many(cyl, slots)
	local next = clone_cylinder(cyl)

	for _, slot_index in ipairs(slots or {}) do
		local loaded
		next, loaded = M.load(next, slot_index)
		if not loaded then
			return cyl, false, "invalid_initial_slots"
		end
	end

	return next, true
end

function M.consume_pending(pending)
	if not pending then
		return nil
	end

	local left = (pending.count or 0) - 1
	if left <= 0 then
		return nil
	end

	return {
		player_id = pending.player_id,
		source = pending.source,
		count = left,
	}
end

function M.trigger(cyl, count)
	local next = clone_cylinder(cyl)
	local results = {}
	local size = #next.slots

	for _ = 1, count do
		local slot = next.slots[next.chamber_index]
		local hit = slot.loaded == true

		results[#results + 1] = {
			hit = hit,
			slot_index = next.chamber_index,
			consumed = hit,
		}

		slot.loaded = false
		next.chamber_index = wrap_next(next.chamber_index, size)
	end

	return next, results
end

return M
