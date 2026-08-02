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
		["turn.reload_countdown"] = "Reload · {seconds}",
		["turn.loading"] = "{name} reloading...",
		["action.pass"] = "Pass",
		["action.challenge"] = "Challenge",
		["player.marker.mine"] = "Your turn",
		["player.marker.active"] = "Current turn",
		["player.marker.previous"] = "Previous turn",
		["bid.count_face"] = "{count} x {face}",
		["duel.verdict.SHORT"] = "Short",
		["duel.verdict.OVER"] = "Over",
		["duel.verdict.EXACT"] = "Exact",
		["duel.verdict.UNKNOWN"] = "Unknown",
		["duel.reveal.title"] = "Reveal",
		["duel.reveal.grid"] = "Skulls + called face",
		["duel.reveal.bid"] = "Bid: {count} x {face}",
		["duel.reveal.actual"] = "Revealed: {count}",
		["duel.reveal.actual_pending"] = "Revealing...",
		["duel.reveal.hint"] = "Opening every cup to reveal all dice.",
		["duel.reveal.hold"] = "All dice revealed. Duel starts soon.",
		["duel.combat.status"] = "Verdict: {verdict}",
		["duel.combat.shot"] = "Roulette {index} / {total}",
		["duel.combat.ready"] = "Resolving...",
		["duel.combat.hit"] = "BANG · HIT",
		["duel.combat.miss"] = "CLICK · MISS",
		["hud.hint.waiting"] = "Waiting for the match.",
		["hud.hint.load"] = "Choose an empty cylinder slot to load.",
		["hud.hint.shaking"] = "Shake to roll your dice.",
		["hud.hint.dice_check"] = "Check your dice, then press Space.",
		["hud.hint.bidding_soon"] = "Bidding starts soon.",
		["hud.hint.bidding"] = "Bid higher than last · ← → count · ↑ ↓ face · [Space] Pass (load 1) · [C] Challenge",
		["hud.hint.bidding_skull"] = "Skull: Pass fires your gun once (roulette) · duel at half count (round down) · [Space] · [C]",
		["hud.hint.duel"] = "Duel in progress.",
		["hud.hint.complete"] = "Match complete.",
		["hud.hint.control.pc"] = "PC: drag / arrows / scroll",
		["hud.hint.control.mobile"] = "Mobile: touch drag",
		["reload.title.setup"] = "Initial Reload",
		["reload.title.bid"] = "Bid Reload",
		["reload.title.shake"] = "Shake Reload",
		["reload.title.duel"] = "Duel Reload",
		["reload.title.exact_duel"] = "Exact Reward Reload",
		["reload.target"] = "Target: {name}",
		["reload.remaining"] = "Loads left: {count}",
		["reload.next.setup"] = "Next: shake the cup.",
		["reload.next.bid"] = "Next: bidding continues.",
		["reload.next.shake"] = "Next: check dice.",
		["reload.next.duel"] = "Next: check dice.",
		["reload.next.exact_duel"] = "Next: new shake round.",
		["reload.click_hint"] = "Click an empty cylinder slot.",
		["result.victory"] = "Victory",
		["result.congratulations"] = "Congratulations!",
		["result.place.2"] = "2nd Place",
		["result.place.3"] = "3rd Place",
		["result.place.4"] = "4th Place",
		["result.place.5"] = "5th Place",
		["result.place.6"] = "6th Place",
		["result.rating"] = "ELO Rating",
		["result.unrated"] = "Unrated Match",
		["result.rating_pending"] = "Final rating is calculated when the match ends",
		["result.lobby"] = "Return to Lobby",
		["result.spectate"] = "Spectate",
	},
	ko = {
		["turn.mine"] = "내 턴",
		["turn.opponent"] = "상대 턴",
		["turn.duel"] = "결투",
		["turn.shake"] = "흔들기",
		["turn.reload"] = "장전",
		["turn.reload_countdown"] = "RELOAD · {seconds}",
		["turn.loading"] = "{name} 장전 중...",
		["action.pass"] = "넘기기",
		["action.challenge"] = "결투신청",
		["player.marker.mine"] = "내 턴",
		["player.marker.active"] = "현재 턴",
		["player.marker.previous"] = "전 턴",
		["bid.count_face"] = "{count}개 · {face}",
		["duel.verdict.SHORT"] = "부족",
		["duel.verdict.OVER"] = "초과",
		["duel.verdict.EXACT"] = "정확",
		["duel.verdict.UNKNOWN"] = "알 수 없음",
		["duel.reveal.title"] = "패 공개",
		["duel.reveal.grid"] = "해골 + 콜한 눈",
		["duel.reveal.bid"] = "콜: {count}개 · {face}",
		["duel.reveal.actual"] = "공개: {count}개",
		["duel.reveal.actual_pending"] = "공개 중...",
		["duel.reveal.hint"] = "모든 컵을 열어 패를 확인합니다.",
		["duel.reveal.hold"] = "패 공개 완료. 곧 결투를 집행합니다.",
		["duel.combat.status"] = "판정: {verdict}",
		["duel.combat.shot"] = "러시안 룰렛 {index} / {total}",
		["duel.combat.ready"] = "집행 중...",
		["duel.combat.hit"] = "탕 · 명중",
		["duel.combat.miss"] = "철컥 · 빗나감",
		["hud.hint.waiting"] = "매치를 기다리는 중입니다.",
		["hud.hint.load"] = "빈 실린더 슬롯을 선택해 장전하세요.",
		["hud.hint.shaking"] = "흔들어서 주사위를 굴리세요.",
		["hud.hint.dice_check"] = "내 주사위를 확인한 뒤 Space를 누르세요.",
		["hud.hint.bidding_soon"] = "잠시 후 입찰을 시작합니다.",
		["hud.hint.bidding"] = "직전 콜보다 높은 수량과 눈을 선택하세요.\n← → 수량 · ↑ ↓ 눈 · [Space] 넘기기 (1발 장전) · [C] 결투 신청",
		["hud.hint.bidding_skull"] = "해골: 넘기기 전 내 총으로 룰렛 1회 · 결투 시 수량 절반(내림) 판정 · [Space] 넘기기 · [C] 결투신청",
		["hud.hint.duel"] = "결투 진행 중입니다.",
		["hud.hint.complete"] = "매치가 끝났습니다.",
		["hud.hint.control.pc"] = "PC 조작: 드래그 · ←→ · 스크롤",
		["hud.hint.control.mobile"] = "모바일 조작: 터치 드래그",
		["reload.title.setup"] = "초기 장전",
		["reload.title.bid"] = "입찰 후 장전",
		["reload.title.shake"] = "흔들기 후 장전",
		["reload.title.duel"] = "결투 후 장전",
		["reload.title.exact_duel"] = "정확 판정 보상 장전",
		["reload.target"] = "대상: {name}",
		["reload.remaining"] = "남은 장전: {count}",
		["reload.next.setup"] = "다음: 컵을 흔듭니다.",
		["reload.next.bid"] = "다음: 입찰을 계속합니다.",
		["reload.next.shake"] = "다음: 주사위를 확인합니다.",
		["reload.next.duel"] = "다음: 주사위를 확인합니다.",
		["reload.next.exact_duel"] = "다음: 새 흔들기 라운드로 이동합니다.",
		["reload.click_hint"] = "오른쪽 실린더의 빈 칸을 클릭하세요.",
		["result.victory"] = "승리",
		["result.congratulations"] = "축하합니다!",
		["result.place.2"] = "2위",
		["result.place.3"] = "3위",
		["result.place.4"] = "4위",
		["result.place.5"] = "5위",
		["result.place.6"] = "6위",
		["result.rating"] = "ELO 점수",
		["result.unrated"] = "비랭크 매치",
		["result.rating_pending"] = "최종 점수는 매치 종료 후 집계됩니다",
		["result.lobby"] = "로비로 나가기",
		["result.spectate"] = "관전하기",
	},
	ja = {
		["turn.mine"] = "自分のターン",
		["turn.opponent"] = "相手のターン",
		["turn.duel"] = "決闘",
		["turn.shake"] = "シェイク",
		["turn.reload"] = "リロード",
		["turn.reload_countdown"] = "RELOAD · {seconds}",
		["turn.loading"] = "{name} がリロード中...",
		["action.pass"] = "パス",
		["action.challenge"] = "決闘を申し込む",
		["player.marker.mine"] = "自分のターン",
		["player.marker.active"] = "現在のターン",
		["player.marker.previous"] = "前のターン",
		["bid.count_face"] = "{count}個 · {face}",
		["duel.verdict.SHORT"] = "不足",
		["duel.verdict.OVER"] = "超過",
		["duel.verdict.EXACT"] = "的中",
		["duel.verdict.UNKNOWN"] = "不明",
		["duel.reveal.title"] = "公開",
		["duel.reveal.grid"] = "ドクロ + 宣言した目",
		["duel.reveal.bid"] = "宣言: {count}個 · {face}",
		["duel.reveal.actual"] = "公開: {count}個",
		["duel.reveal.actual_pending"] = "公開中...",
		["duel.reveal.hint"] = "すべてのカップを開いて出目を確認します。",
		["duel.reveal.hold"] = "公開完了。まもなく決闘を処理します。",
		["duel.combat.status"] = "判定: {verdict}",
		["duel.combat.shot"] = "ロシアンルーレット {index} / {total}",
		["duel.combat.ready"] = "処理中...",
		["duel.combat.hit"] = "バン · 命中",
		["duel.combat.miss"] = "カチッ · 外れ",
		["hud.hint.waiting"] = "マッチを待っています。",
		["hud.hint.load"] = "空のシリンダースロットを選んで装填してください。",
		["hud.hint.shaking"] = "振ってサイコロを振ってください。",
		["hud.hint.dice_check"] = "自分のサイコロを確認してからSpaceを押してください。",
		["hud.hint.bidding_soon"] = "まもなくビッドを開始します。",
		["hud.hint.bidding"] = "直前より高く · ← → 数 · ↑ ↓ 出目 · [Space] パス（1発装填） · [C] 決闘",
		["hud.hint.bidding_skull"] = "ドクロ: パス前に自分の銃でルーレット1回 · 決闘は数の半分（切捨て） · [Space] パス · [C] 決闘",
		["hud.hint.duel"] = "決闘中です。",
		["hud.hint.complete"] = "マッチ完了。",
		["hud.hint.control.pc"] = "PC操作: ドラッグ / ←→ / スクロール",
		["hud.hint.control.mobile"] = "モバイル操作: タッチドラッグ",
		["reload.title.setup"] = "初期装填",
		["reload.title.bid"] = "ビッド後の装填",
		["reload.title.shake"] = "シェイク後の装填",
		["reload.title.duel"] = "決闘後の装填",
		["reload.title.exact_duel"] = "的中報酬の装填",
		["reload.target"] = "対象: {name}",
		["reload.remaining"] = "残り装填: {count}",
		["reload.next.setup"] = "次: カップを振ります。",
		["reload.next.bid"] = "次: ビッドを続けます。",
		["reload.next.shake"] = "次: サイコロを確認します。",
		["reload.next.duel"] = "次: サイコロを確認します。",
		["reload.next.exact_duel"] = "次: 新しいシェイクラウンドへ。",
		["reload.click_hint"] = "右のシリンダーの空きスロットをクリックしてください。",
		["result.victory"] = "勝利",
		["result.congratulations"] = "おめでとう！",
		["result.place.2"] = "2位",
		["result.place.3"] = "3位",
		["result.place.4"] = "4位",
		["result.place.5"] = "5位",
		["result.place.6"] = "6位",
		["result.rating"] = "ELOレーティング",
		["result.unrated"] = "ランク外マッチ",
		["result.rating_pending"] = "最終レートはマッチ終了後に集計されます",
		["result.lobby"] = "ロビーへ戻る",
		["result.spectate"] = "観戦する",
	},
	zh = {
		["turn.mine"] = "我的回合",
		["turn.opponent"] = "对方回合",
		["turn.duel"] = "决斗",
		["turn.shake"] = "摇杯",
		["turn.reload"] = "装填",
		["turn.reload_countdown"] = "RELOAD · {seconds}",
		["turn.loading"] = "{name} 装填中...",
		["action.pass"] = "过牌",
		["action.challenge"] = "申请决斗",
		["player.marker.mine"] = "我的回合",
		["player.marker.active"] = "当前回合",
		["player.marker.previous"] = "上一回合",
		["bid.count_face"] = "{count}个 · {face}",
		["duel.verdict.SHORT"] = "不足",
		["duel.verdict.OVER"] = "超额",
		["duel.verdict.EXACT"] = "精确",
		["duel.verdict.UNKNOWN"] = "未知",
		["duel.reveal.title"] = "亮牌",
		["duel.reveal.grid"] = "骷髅 + 叫的点数",
		["duel.reveal.bid"] = "叫牌: {count}个 · {face}",
		["duel.reveal.actual"] = "公开: {count}个",
		["duel.reveal.actual_pending"] = "公开中...",
		["duel.reveal.hint"] = "打开所有杯子确认骰子。",
		["duel.reveal.hold"] = "亮牌完成。即将执行决斗。",
		["duel.combat.status"] = "判定: {verdict}",
		["duel.combat.shot"] = "俄罗斯轮盘 {index} / {total}",
		["duel.combat.ready"] = "执行中...",
		["duel.combat.hit"] = "砰 · 命中",
		["duel.combat.miss"] = "咔嗒 · 空枪",
		["hud.hint.waiting"] = "正在等待对局。",
		["hud.hint.load"] = "选择空弹巢槽位进行装填。",
		["hud.hint.shaking"] = "摇动杯子掷出骰子。",
		["hud.hint.dice_check"] = "确认自己的骰子后按 Space。",
		["hud.hint.bidding_soon"] = "即将开始叫牌。",
		["hud.hint.bidding"] = "须高于上次叫牌 · ← → 数量 · ↑ ↓ 点数 · [Space] 过牌(装填1发) · [C] 申请决斗",
		["hud.hint.bidding_skull"] = "骷髅: 过牌前用自己的枪轮盘1次 · 决斗按数量一半(向下取整)判定 · [Space] 过牌 · [C] 申请决斗",
		["hud.hint.duel"] = "决斗进行中。",
		["hud.hint.complete"] = "对局结束。",
		["hud.hint.control.pc"] = "PC操作: 拖拽 · ←→ · 滚轮",
		["hud.hint.control.mobile"] = "移动端操作: 触控拖拽",
		["reload.title.setup"] = "初始装填",
		["reload.title.bid"] = "叫牌后装填",
		["reload.title.shake"] = "摇杯后装填",
		["reload.title.duel"] = "决斗后装填",
		["reload.title.exact_duel"] = "精确判定奖励装填",
		["reload.target"] = "目标: {name}",
		["reload.remaining"] = "剩余装填: {count}",
		["reload.next.setup"] = "下一步: 摇动杯子。",
		["reload.next.bid"] = "下一步: 继续叫牌。",
		["reload.next.shake"] = "下一步: 确认骰子。",
		["reload.next.duel"] = "下一步: 确认骰子。",
		["reload.next.exact_duel"] = "下一步: 进入新的摇杯回合。",
		["reload.click_hint"] = "点击右侧弹巢的空槽。",
		["result.victory"] = "胜利",
		["result.congratulations"] = "恭喜！",
		["result.place.2"] = "第2名",
		["result.place.3"] = "第3名",
		["result.place.4"] = "第4名",
		["result.place.5"] = "第5名",
		["result.place.6"] = "第6名",
		["result.rating"] = "ELO 分数",
		["result.unrated"] = "非排位对局",
		["result.rating_pending"] = "最终分数将在对局结束后统计",
		["result.lobby"] = "返回大厅",
		["result.spectate"] = "观战",
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
	if type(locale) ~= "string" or not DEFAULT_LOCALES[locale] then
		return false
	end
	current = locale
	cache[current] = cache[current] or load_locale(current)
	return true
end

function M.is_supported(locale)
	return type(locale) == "string" and DEFAULT_LOCALES[locale] ~= nil
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
