local M = {}

local cache = {}
local current = "ko"

local DEFAULT_LOCALES = {
	en = {
		["turn.mine"] = "Your Turn",
		["turn.opponent"] = "Opponent's Turn",
		["turn.duel"] = "Duel",
		["turn.shake"] = "Shake",
		["turn.reload"] = "Reload",
		["action.pass"] = "Pass",
		["action.challenge"] = "Challenge",
		["bid.count_face"] = "{count} x {face}",
		["duel.verdict.SHORT"] = "Short",
		["duel.verdict.OVER"] = "Over",
		["duel.verdict.EXACT"] = "Exact",
		["duel.verdict.UNKNOWN"] = "Unknown",
		["hud.hint.waiting"] = "Waiting for the match.",
		["hud.hint.load"] = "Choose an empty cylinder slot to load.",
		["hud.hint.shaking"] = "Shake to roll your dice.",
		["hud.hint.dice_check"] = "Check your dice, then press Space.",
		["hud.hint.bidding_soon"] = "Bidding starts soon.",
		["hud.hint.bidding"] = "Drag the rail to set the count, pick a die face, then choose 'Pass' or 'Challenge'.",
		["hud.hint.duel"] = "Duel in progress.",
		["hud.hint.complete"] = "Match complete.",
		["hud.hint.control.pc"] = "PC: drag / arrows / scroll",
		["hud.hint.control.mobile"] = "Mobile: touch drag",
	},
	ko = {
		["turn.mine"] = "내 턴",
		["turn.opponent"] = "상대 턴",
		["turn.duel"] = "결투",
		["turn.shake"] = "흔들기",
		["turn.reload"] = "장전",
		["action.pass"] = "넘기기",
		["action.challenge"] = "결투신청",
		["bid.count_face"] = "{count}개 · {face}",
		["duel.verdict.SHORT"] = "부족",
		["duel.verdict.OVER"] = "초과",
		["duel.verdict.EXACT"] = "정확",
		["duel.verdict.UNKNOWN"] = "알 수 없음",
		["hud.hint.waiting"] = "매치를 기다리는 중입니다.",
		["hud.hint.load"] = "빈 실린더 슬롯을 선택해 장전하세요.",
		["hud.hint.shaking"] = "흔들어서 주사위를 굴리세요.",
		["hud.hint.dice_check"] = "내 주사위를 확인한 뒤 Space를 누르세요.",
		["hud.hint.bidding_soon"] = "잠시 후 입찰을 시작합니다.",
		["hud.hint.bidding"] = "레일을 드래그하여 개수를 선택하고, 주사위 면을 선택한 후 '넘기기' 또는 '결투신청'을 선택하세요.",
		["hud.hint.duel"] = "결투 진행 중입니다.",
		["hud.hint.complete"] = "매치가 끝났습니다.",
		["hud.hint.control.pc"] = "PC 조작: 드래그 · ←→ · 스크롤",
		["hud.hint.control.mobile"] = "모바일 조작: 터치 드래그",
	},
	ja = {
		["turn.mine"] = "自分のターン",
		["turn.opponent"] = "相手のターン",
		["turn.duel"] = "決闘",
		["turn.shake"] = "シェイク",
		["turn.reload"] = "リロード",
		["action.pass"] = "パス",
		["action.challenge"] = "決闘を申し込む",
		["bid.count_face"] = "{count}個 · {face}",
		["duel.verdict.SHORT"] = "不足",
		["duel.verdict.OVER"] = "超過",
		["duel.verdict.EXACT"] = "的中",
		["duel.verdict.UNKNOWN"] = "不明",
		["hud.hint.waiting"] = "マッチを待っています。",
		["hud.hint.load"] = "空のシリンダースロットを選んで装填してください。",
		["hud.hint.shaking"] = "振ってサイコロを振ってください。",
		["hud.hint.dice_check"] = "自分のサイコロを確認してからSpaceを押してください。",
		["hud.hint.bidding_soon"] = "まもなくビッドを開始します。",
		["hud.hint.bidding"] = "レールをドラッグして個数を選び、サイコロの目を選んでから「パス」または「決闘を申し込む」を選んでください。",
		["hud.hint.duel"] = "決闘中です。",
		["hud.hint.complete"] = "マッチ完了。",
		["hud.hint.control.pc"] = "PC操作: ドラッグ / ←→ / スクロール",
		["hud.hint.control.mobile"] = "モバイル操作: タッチドラッグ",
	},
}

local function clone_table(source)
	local next = {}
	for key, value in pairs(source or {}) do
		next[key] = value
	end
	return next
end

local function decode_flat_json(text)
	local data = {}
	if not text then
		return data
	end

	for key, value in text:gmatch('"([^"]+)"%s*:%s*"([^"]*)"') do
		value = value:gsub('\\"', '"')
		data[key] = value
	end

	return data
end

local function load_resource(path)
	if sys and sys.load_resource then
		local ok, content = pcall(sys.load_resource, path)
		if ok then
			return content
		end
	end

	local file = io and io.open and io.open("play" .. path, "r")
	if not file and io and io.open then
		file = io.open(path:gsub("^/", ""), "r")
	end
	if not file then
		return nil
	end

	local content = file:read("*a")
	file:close()
	return content
end

local function load_locale(locale)
	local content = load_resource("/assets/locale/" .. locale .. ".json")
	local fallback = DEFAULT_LOCALES[locale] or DEFAULT_LOCALES.ko
	local loaded = {}

	if not content then
		return clone_table(fallback)
	end

	if json and json.decode then
		local ok, decoded = pcall(json.decode, content)
		if ok and decoded then
			loaded = decoded
		else
			loaded = decode_flat_json(content)
		end
	else
		loaded = decode_flat_json(content)
	end

	local merged = clone_table(fallback)
	for key, value in pairs(loaded) do
		merged[key] = value
	end
	return merged
end

function M.set_locale(locale)
	current = locale or "ko"
	cache[current] = cache[current] or load_locale(current)
end

function M.get_locale()
	return current
end

function M.t(key, params)
	cache[current] = cache[current] or load_locale(current)
	local template = cache[current][key]
	if not template then
		return "[[" .. tostring(key) .. "]]"
	end

	return (template:gsub("{(%w+)}", function(name)
		local value = params and params[name]
		if value == nil then
			return "{" .. name .. "}"
		end
		return tostring(value)
	end))
end

return M
