local M = {}

function M.node(id)
	if not gui or not gui.get_node then
		return nil
	end

	local ok, node = pcall(gui.get_node, id)
	if ok then
		return node
	end
	return nil
end

function M.set_text(id, value)
	local node = M.node(id)
	if node and gui.set_text then
		gui.set_text(node, tostring(value or ""))
	end
end

function M.set_enabled(id, enabled)
	local node = M.node(id)
	if node and gui.set_enabled then
		gui.set_enabled(node, enabled == true)
	end
end

function M.set_color(id, color)
	local node = M.node(id)
	if node and gui.set_color then
		gui.set_color(node, color)
	end
end

function M.set_alpha(id, alpha)
	local node = M.node(id)
	if node and gui.set_alpha then
		gui.set_alpha(node, alpha)
	end
end

function M.set_texture(id, texture)
	local node = M.node(id)
	if node and gui.set_texture then
		pcall(gui.set_texture, node, texture)
	end
end

function M.play_flipbook(id, animation)
	local node = M.node(id)
	if node and gui.play_flipbook then
		pcall(gui.play_flipbook, node, animation)
	end
end

function M.set_position(id, position)
	local node = M.node(id)
	if node and gui.set_position then
		gui.set_position(node, position)
	end
end

function M.set_scale(id, scale)
	local node = M.node(id)
	if node and gui.set_scale then
		gui.set_scale(node, scale)
	end
end

function M.world_position(id)
	local node = M.node(id)
	if node and gui.get_screen_position then
		return gui.get_screen_position(node)
	end
	if node and gui.get_position then
		return gui.get_position(node)
	end
	return nil
end

function M.pick(id, x, y)
	local node = M.node(id)
	if node and gui.pick_node then
		local ok, picked = pcall(gui.pick_node, node, x, y)
		return ok and picked == true
	end
	return false
end

function M.acquire_input_focus()
	if gui and gui.acquire_input_focus then
		gui.acquire_input_focus()
	end
end

return M
