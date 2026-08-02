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
		"Skull: Pass fires your gun once (roulette) · duel at half count (round down) · [Space] · [C]",
		"english skull bid hint"
	)

	assert_eq(i18n.set_locale("ja"), true, "japanese accepted")
	assert_eq(i18n.t("action.pass"), "パス", "japanese text")
	assert_eq(i18n.get_locale(), "ja", "japanese active")

	assert_eq(i18n.set_locale("zh"), true, "chinese accepted")
	assert_eq(i18n.t("action.pass"), "过牌", "chinese text")
	assert_eq(
		i18n.t("hud.hint.bidding_skull"),
		"骷髅: 过牌前用自己的枪轮盘1次 · 决斗按数量一半(向下取整)判定 · [Space] 过牌 · [C] 申请决斗",
		"chinese skull bid hint"
	)

	assert_eq(i18n.set_locale("../../invalid"), false, "invalid locale rejected")
	assert_eq(i18n.get_locale(), "zh", "invalid locale preserves active locale")

	i18n.set_locale("ko")
	assert_eq(
		i18n.t("hud.hint.bidding_skull"),
		"해골: 넘기기 전 내 총으로 룰렛 1회 · 결투 시 수량 절반(내림) 판정 · [Space] 넘기기 · [C] 결투신청",
		"korean skull bid hint"
	)
end

return M
