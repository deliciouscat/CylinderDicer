local i18n = require("game.core.i18n")

local M = {}

local function assert_eq(actual, expected, label)
	if actual ~= expected then
		error(("%s: expected %s, got %s"):format(label, tostring(expected), tostring(actual)))
	end
end

function M.test_locale_switch_accepts_only_bridge_supported_locales()
	assert_eq(i18n.set_locale("en"), true, "english accepted")
	assert_eq(i18n.t("action.pass"), "Pass", "english text")
	assert_eq(i18n.t("player.marker.previous"), "Previous turn", "english marker")
	assert_eq(
		i18n.t("hud.hint.bidding_skull"),
		"Skull: judged as half the count (round down) · [Space] Pass · [C] Challenge",
		"english skull bid hint"
	)

	assert_eq(i18n.set_locale("ja"), true, "japanese accepted")
	assert_eq(i18n.t("action.pass"), "パス", "japanese text")
	assert_eq(i18n.get_locale(), "ja", "japanese active")

	assert_eq(i18n.set_locale("../../invalid"), false, "invalid locale rejected")
	assert_eq(i18n.get_locale(), "ja", "invalid locale preserves active locale")

	i18n.set_locale("ko")
	assert_eq(
		i18n.t("hud.hint.bidding_skull"),
		"Skull: 현재 수량의 절반(내림)으로 판정 · [Space] 넘기기 · [C] 결투신청",
		"korean skull bid hint"
	)
end

return M
