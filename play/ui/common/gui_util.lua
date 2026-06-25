local M = {}

function M.node(id)
	return gui.get_node(id)
end

function M.set_text(id, value)
	local node = M.node(id)
	gui.set_text(node, tostring(value or ""))
end

function M.set_enabled(id, enabled)
	local node = M.node(id)
	gui.set_enabled(node, enabled == true)
end

function M.set_color(id, color)
	local node = M.node(id)
	gui.set_color(node, color)
end

function M.set_alpha(id, alpha)
	local node = M.node(id)
	gui.set_alpha(node, alpha)
end

function M.set_texture(id, texture)
	local node = M.node(id)
	gui.set_texture(node, texture)
end

function M.play_flipbook(id, animation)
	local node = M.node(id)
	gui.play_flipbook(node, animation)
end

function M.set_position(id, position)
	local node = M.node(id)
	gui.set_position(node, position)
end

function M.set_scale(id, scale)
	local node = M.node(id)
	gui.set_scale(node, scale)
end

function M.set_size(id, size)
	local node = M.node(id)
	gui.set_size(node, size)
end

function M.set_rotation(id, rotation)
	local node = M.node(id)
	gui.set_rotation(node, rotation)
end

function M.world_position(id)
	local node = M.node(id)
	if gui.get_screen_position then
		return gui.get_screen_position(node)
	end
	return gui.get_position(node)
end

function M.pick(id, x, y)
	local node = M.node(id)
	return gui.pick_node(node, x, y)
end

function M.acquire_input_focus()
	msg.post(".", "acquire_input_focus")
end

function M.release_input_focus()
	msg.post(".", "release_input_focus")
end

return M
