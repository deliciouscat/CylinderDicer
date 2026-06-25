package.path = table.concat({
	"play/?.lua",
	"play/?/init.lua",
	"./play/?.lua",
	"./play/?/init.lua",
	package.path,
}, ";")

local tests = {
	require("game.model.tests.model_flow_test"),
	require("game.model.tests.shake_view_test"),
	require("game.model.tests.cylinder_interaction_test"),
}

local total = 0
local failed = 0

for _, suite in ipairs(tests) do
	local names = {}
	for name, fn in pairs(suite) do
		if type(fn) == "function" and name:match("^test_") then
			names[#names + 1] = name
		end
	end
	table.sort(names)

	for _, name in ipairs(names) do
		total = total + 1
		local ok, err = pcall(suite[name])
		if ok then
			print("PASS " .. name)
		else
			failed = failed + 1
			print("FAIL " .. name .. ": " .. tostring(err))
		end
	end
end

print(("Tests: %d, Failed: %d"):format(total, failed))

if failed > 0 then
	error("model tests failed")
end
