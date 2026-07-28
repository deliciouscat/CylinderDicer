local M = {}

local FROM_DEFOLD_EVENT = "CylinderDicerFromDefold"
local TO_DEFOLD_QUEUE = "CylinderDicerToDefoldQueue"

local function can_run_javascript()
	return type(html5) == "table" and type(html5.run) == "function"
end

local function run_javascript(script)
	if not can_run_javascript() then
		return nil
	end

	return html5.run(script)
end

function M.is_web()
	return can_run_javascript()
end

function M.install()
	if not can_run_javascript() then
		return false
	end

	run_javascript([[
		(function () {
			window.CylinderDicerToDefoldQueue = window.CylinderDicerToDefoldQueue || [];

			if (!window.CylinderDicerBridgeInstalled) {
				window.CylinderDicerBridgeInstalled = true;
				window.CylinderDicerParentOrigin = (function () {
					try {
						return document.referrer ? new URL(document.referrer).origin : window.location.origin;
					} catch (_error) {
						return window.location.origin;
					}
				})();

				window.CylinderDicerSendToDefold = function (message) {
					window.CylinderDicerToDefoldQueue.push(message);
				};

				window.CylinderDicerQueuePointer = function (event) {
					var canvas = document.getElementById('canvas') || document.querySelector('canvas');
					if (!canvas) {
						return;
					}
					var rect = canvas.getBoundingClientRect();
					if (!rect.width || !rect.height) {
						return;
					}
					window.CylinderDicerToDefoldQueue.push({
						type: 'DOM_POINTER',
						payload: {
							x: (event.clientX - rect.left) * 1280 / rect.width,
							y: (rect.bottom - event.clientY) * 720 / rect.height,
							pressed: true
						}
					});
				};

				window.CylinderDicerInstallPointerForwarder = function () {
					var canvas = document.getElementById('canvas') || document.querySelector('canvas');
					if (!canvas || canvas.CylinderDicerPointerForwarderInstalled) {
						return;
					}
					canvas.CylinderDicerPointerForwarderInstalled = true;
					canvas.addEventListener('pointerdown', window.CylinderDicerQueuePointer);
				};

				window.CylinderDicerInstallPointerForwarder();

				window.addEventListener("message", function (event) {
					var data = event.data;

					if (
						event.source === window.parent
						&& event.origin === window.CylinderDicerParentOrigin
						&& data
						&& data.source === "CylinderDicerVue"
					) {
						window.CylinderDicerToDefoldQueue.push(data);
					}
				});
			}

			window.CylinderDicerInstallPointerForwarder && window.CylinderDicerInstallPointerForwarder();
			setInterval(function () {
				window.CylinderDicerInstallPointerForwarder && window.CylinderDicerInstallPointerForwarder();
			}, 2000);
		})();
	]])

	return true
end

function M.emit(message_type, payload)
	local message = {
		type = message_type,
		payload = payload or {}
	}

	if not can_run_javascript() then
		print("Defold -> Vue", json.encode(message))
		return false
	end

	local detail = json.encode(message)
	run_javascript([[
		(function () {
			var message = ]] .. detail .. [[;
			window.dispatchEvent(new CustomEvent(']] .. FROM_DEFOLD_EVENT .. [[', { detail: message }));
			if (window.parent && window.parent !== window) {
				var parentMessage = Object.assign({ source: 'CylinderDicerDefold' }, message);
				var targetOrigin = window.CylinderDicerParentOrigin || window.location.origin;
				window.parent.postMessage(parentMessage, targetOrigin);
			}
		})();
	]])

	return true
end

function M.poll()
	if not can_run_javascript() then
		return nil
	end

	local raw_message = run_javascript([[
		(function () {
			var queue = window.CylinderDicerToDefoldQueue || [];
			var message = queue.shift() || null;
			return JSON.stringify(message);
		})();
	]])

	if not raw_message or raw_message == "" or raw_message == "null" then
		return nil
	end

	local ok, decoded = pcall(json.decode, raw_message)
	if ok then
		return decoded
	end

	print("Failed to decode Vue -> Defold bridge message:", raw_message)
	return nil
end

return M
