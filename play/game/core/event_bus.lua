local M = {}
local Bus = {}
Bus.__index = Bus

function M.new()
	return setmetatable({
		topics = {},
		seq = 0,
	}, Bus)
end

function Bus:subscribe(topic, handler)
	assert(topic, "event_bus.subscribe requires topic")
	assert(handler, "event_bus.subscribe requires handler")

	self.topics[topic] = self.topics[topic] or {}
	self.seq = self.seq + 1

	local token = {
		topic = topic,
		id = self.seq,
	}

	self.topics[topic][token.id] = handler
	return token
end

function Bus:unsubscribe(token)
	if not token then
		return
	end

	local subs = self.topics[token.topic]
	if subs then
		subs[token.id] = nil
	end
end

function Bus:publish(topic, payload)
	local subs = self.topics[topic]
	if not subs then
		return
	end

	local handlers = {}
	for _, handler in pairs(subs) do
		handlers[#handlers + 1] = handler
	end

	for _, handler in ipairs(handlers) do
		handler(payload)
	end
end

return M
