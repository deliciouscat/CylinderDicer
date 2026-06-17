local M = {}
local Store = {}
Store.__index = Store

local instance

function M.create(initial_state, reduce, bus)
	assert(initial_state, "store.create requires initial_state")
	assert(reduce, "store.create requires reducer")
	assert(bus, "store.create requires event bus")

	instance = setmetatable({
		state = initial_state,
		reduce = reduce,
		bus = bus,
	}, Store)

	return instance
end

function M.get()
	return instance
end

function M.clear()
	instance = nil
end

function Store:get_state()
	return self.state
end

function Store:dispatch(action)
	if not action or not action.type then
		return {
			ok = false,
			error = "invalid_action",
			state = self.state,
		}
	end

	local result = self.reduce(self.state, action)
	result = result or {
		state = self.state,
		changed_topics = {},
	}

	if result.error then
		return {
			ok = false,
			error = result.error,
			state = self.state,
		}
	end

	self.state = result.state or self.state

	for _, topic in ipairs(result.changed_topics or {}) do
		self.bus:publish(topic, self.state)
	end

	return {
		ok = true,
		state = self.state,
		changed_topics = result.changed_topics or {},
	}
end

function Store:subscribe(topic, handler)
	return self.bus:subscribe(topic, handler)
end

function Store:unsubscribe(token)
	return self.bus:unsubscribe(token)
end

return M
