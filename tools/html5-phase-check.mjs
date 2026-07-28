#!/usr/bin/env node
/**
 * Run HTML5 background/HUD phase checks in Playwright Chromium (WebGL).
 * Usage: node tools/html5-phase-check.mjs [--url URL] [--shots DIR]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const harnessSource = readFileSync(join(__dirname, "html5-diagnosis-harness.js"), "utf8");

const args = process.argv.slice(2);
const url =
	args.find((arg) => arg.startsWith("http")) ??
	"http://127.0.0.1:5173/play/index.html";
const shotsIdx = args.indexOf("--shots");
const shotsDir =
	shotsIdx >= 0
		? args[shotsIdx + 1]
		: join(__dirname, "../.tmp/html5-bg-hud-shots");

function imageMetrics(pngPath) {
	const script = `
import json
import sys
from PIL import Image

image = Image.open(sys.argv[1]).convert("RGBA")
width, height = image.size
regions = [
	(0.05, 0.08, 0.20, 0.20),
	(0.75, 0.08, 0.20, 0.20),
	(0.05, 0.48, 0.20, 0.22),
	(0.75, 0.48, 0.20, 0.22),
	(0.30, 0.22, 0.40, 0.20),
	(0.30, 0.60, 0.40, 0.20),
]

samples = 0
greyish = 0
alpha = 0
saturation = 0
brightness = 0

for rx, ry, rw, rh in regions:
	x0 = int(width * rx)
	y0 = int(height * ry)
	x1 = min(width, int(width * (rx + rw)))
	y1 = min(height, int(height * (ry + rh)))
	for y in range(y0, y1, 4):
		for x in range(x0, x1, 4):
			r, g, b, a = image.getpixel((x, y))
			channel_max = max(r, g, b)
			channel_min = min(r, g, b)
			sat = channel_max - channel_min
			samples += 1
			alpha += a
			saturation += sat
			brightness += (r + g + b) / 3
			if sat < 8:
				greyish += 1

avg_alpha = alpha / samples
avg_saturation = saturation / samples
avg_brightness = brightness / samples
greyish_ratio = greyish / samples

print(json.dumps({
	"ok": avg_alpha > 240 and avg_saturation > 18 and greyish_ratio < 0.75,
	"samples": samples,
	"avgAlpha": avg_alpha,
	"avgSaturation": avg_saturation,
	"avgBrightness": avg_brightness,
	"greyishRatio": greyish_ratio,
}))
`;
	const result = spawnSync("python3", ["-c", script, pngPath], {
		encoding: "utf8",
	});
	if (result.status !== 0) {
		return {
			ok: false,
			reason: "screenshot_metrics_failed",
			error: String(result.error?.message ?? ""),
			stderr: result.stderr.trim(),
		};
	}
	try {
		return JSON.parse(result.stdout);
	} catch (error) {
		return {
			ok: false,
			reason: "screenshot_metrics_parse_failed",
			stdout: result.stdout.trim(),
			error: String(error?.message ?? error),
		};
	}
}

async function screenshotMetrics(page, name) {
	mkdirSync(shotsDir, { recursive: true });
	const pngPath = join(shotsDir, `${name}.png`);
	const png = await page.screenshot({ fullPage: false });
	writeFileSync(pngPath, png);
	return {
		path: pngPath,
		...imageMetrics(pngPath),
	};
}

async function clickLogical(page, x, y) {
	const point = await page.evaluate(({ x, y }) => {
		const canvas = document.getElementById("canvas") || document.querySelector("canvas");
		if (!canvas) {
			return null;
		}
		const rect = canvas.getBoundingClientRect();
		return {
			x: rect.left + (x / 1280) * rect.width,
			y: rect.bottom - (y / 720) * rect.height,
		};
	}, { x, y });
	if (!point) {
		throw new Error("missing_canvas_for_click");
	}
	await page.mouse.click(point.x, point.y);
}

async function dragShake(page) {
	const points = await page.evaluate(() => {
		const canvas = document.getElementById("canvas") || document.querySelector("canvas");
		if (!canvas) {
			return null;
		}
		const rect = canvas.getBoundingClientRect();
		return {
			from: { x: rect.left + rect.width * 0.42, y: rect.top + rect.height * 0.5 },
			to: { x: rect.left + rect.width * 0.58, y: rect.top + rect.height * 0.5 },
		};
	});
	if (!points) {
		throw new Error("missing_canvas_for_drag");
	}
	await page.mouse.move(points.from.x, points.from.y);
	await page.mouse.down();
	await page.mouse.move(points.to.x, points.to.y, { steps: 3 });
	await page.mouse.up();
}

function focalSlotCenter(slotIndex) {
	const centerX = 640;
	const centerY = 372;
	const radius = 145;
	const angle = ((slotIndex - 1) * Math.PI * 2) / 6;
	return {
		x: centerX + Math.sin(angle) * radius,
		y: centerY + Math.cos(angle) * radius,
	};
}

const browser = await chromium.launch({
	headless: true,
	args: ["--use-gl=angle", "--enable-webgl"],
}).catch(async (error) => {
	if (!String(error?.message ?? error).includes("Executable doesn't exist")) {
		throw error;
	}
	return await chromium.launch({
		channel: "chrome",
		headless: true,
		args: ["--use-gl=angle", "--enable-webgl"],
	});
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const consoleErrors = [];
page.on("console", (message) => {
	if (message.type() === "error") {
		consoleErrors.push({
			message: message.text(),
			url: message.location().url || "",
		});
	}
});
page.on("pageerror", (error) => {
	consoleErrors.push({
		message: String(error?.message ?? error),
		url: "",
	});
});

try {
	await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
	await page.waitForFunction(
		() => typeof window.CylinderDicerSendToDefold === "function",
		{ timeout: 120000 },
	);

	const webgl = await page.evaluate(() => {
		try {
			const canvas = document.createElement("canvas");
			return !!(
				canvas.getContext("webgl") || canvas.getContext("experimental-webgl")
			);
		} catch {
			return false;
		}
	});
	if (!webgl) {
		console.error("WebGL unavailable in Playwright Chromium — phase checks aborted.");
		process.exit(2);
	}

	await page.evaluate(harnessSource);

	const phases = {};
	await page.evaluate(async () => window.__cdHarness.startMatch());
	await page.waitForTimeout(1200);

	phases.reload = await page.evaluate(async () =>
		window.__cdHarness.summarize(
			await window.__cdHarness.waitStatus((s) => s.phase === "revolver_reload", 8000),
		),
	);
	phases.reload.screenshot = await screenshotMetrics(page, "reload");
	await page.waitForTimeout(600);

	for (const slot of [1, 2, 3]) {
		const point = focalSlotCenter(slot);
		await clickLogical(page, point.x, point.y);
		await page.waitForTimeout(650);
	}
	phases.after_reload_clicks = await page.evaluate(async () =>
		window.__cdHarness.summarize(
			await window.__cdHarness.waitStatus((s) => s.phase === "cup_shake", 8000),
		),
	);

	await page.bringToFront();
	await clickLogical(page, 12, 708);
	await dragShake(page);
	phases.shake_gauge_initial = await page.evaluate(async () =>
		window.__cdHarness.summarize(
			await window.__cdHarness.waitStatus(
				(s) => Number(s.visual?.shake?.gauge ?? 0) >= 20,
				3000,
			),
		),
	);
	phases.shake_gauge_initial.screenshot = await screenshotMetrics(page, "shake_gauge_initial");
	phases.shake_gauge_decay = await page.evaluate(async () =>
		window.__cdHarness.summarize(
			await window.__cdHarness.waitStatus(
				(s) => Number(s.visual?.shake?.gauge ?? 100) < 22,
				2000,
			),
		),
	);
	for (let index = 0; index < 4; index += 1) {
		await dragShake(page);
		await page.waitForTimeout(35);
	}
	phases.shake = await page.evaluate(async () =>
		window.__cdHarness.summarize(
			await window.__cdHarness.waitStatus(
				(s) => s.phase === "cup_shake"
					&& Number(s.shake?.counts?.["local-player"] ?? 0) >= 6,
				8000,
			),
		),
	);
	phases.shake.screenshot = await screenshotMetrics(page, "shake");
	await page.waitForTimeout(900);
	for (const actorId of ["opponent-1", "opponent-2", "opponent-3"]) {
		await page.evaluate((id) => window.__cdHarness.qa("shake", id), actorId);
		await page.waitForTimeout(250);
	}
	await page.evaluate(async () => window.__cdHarness.waitStatus((s) => s.phase === "dice_check", 8000));

	for (const actorId of ["local-player", "opponent-1", "opponent-2", "opponent-3"]) {
		await page.evaluate((id) => window.__cdHarness.qa("check", id), actorId);
		await page.waitForTimeout(200);
	}
	await page.waitForTimeout(900);
	phases.dice_check = await page.evaluate(async () =>
		window.__cdHarness.summarize(
			await window.__cdHarness.waitStatus((s) => s.phase === "bidding_gap", 8000),
		),
	);
	await page.waitForTimeout(3500);
	phases.bidding_local_turn = await page.evaluate(async () =>
		window.__cdHarness.summarize(
			await window.__cdHarness.waitStatus(
				(s) => s.phase === "bidding" && s.turn?.active_player_id === "local-player",
				10000,
			),
		),
	);
	phases.bidding_local_turn.screenshot = await screenshotMetrics(page, "bidding_local_turn");

	await page.bringToFront();
	await clickLogical(page, 12, 708);
	await page.waitForTimeout(100);
	await page.keyboard.down("ArrowRight");
	await page.waitForTimeout(100);
	await page.keyboard.up("ArrowRight");
	phases.rail_input = await page.evaluate(async () =>
		window.__cdHarness.summarize(
			await window.__cdHarness.waitStatus(
				(s) => s.phase === "bidding"
					&& s.turn?.active_player_id === "local-player"
					&& Number(s.visual?.rail?.selected_count ?? 0) === 2,
				5000,
			),
		),
	);

	await page.evaluate(() => window.__cdHarness.qa("bid", "local-player", {
		count: 1,
		face: 1,
		spin_steps: 1,
	}));
	phases.skull_bid_hit = await page.evaluate(async () =>
		window.__cdHarness.summarize(
			await window.__cdHarness.waitStatus(
				(s) => s.phase === "bidding"
					&& s.pending_load?.player_id === "local-player"
					&& s.bidding?.skull_roulette?.hit === true,
				5000,
			),
		),
	);
	phases.skull_bid_hit.screenshot = await screenshotMetrics(page, "skull_bid_hit");
	await page.evaluate(() => window.__cdHarness.qa("load_all", "local-player"));
	phases.after_skull_reload = await page.evaluate(async () =>
		window.__cdHarness.summarize(
			await window.__cdHarness.waitStatus(
				(s) => s.phase === "bidding"
					&& s.turn?.active_player_id === "opponent-1"
					&& !s.pending_load
					&& s.visual?.rail?.visible === true
					&& s.visual?.bid_controls?.can_drive === false
					&& s.visual?.bid_controls?.visible === true
					&& Number(s.visual?.bid_controls?.display_face) === 1
					&& s.visual?.player_carousel?.active_player_id === "opponent-1"
					&& Number(s.visual?.player_carousel?.active_position_x) === 0,
				5000,
			),
		),
	);
	phases.after_skull_reload.screenshot = await screenshotMetrics(page, "after_skull_reload");
	await page.evaluate(() => window.__cdHarness.qa("bid", "opponent-1", {
		count: 1,
		face: 2,
	}));
	phases.opponent_bid_visible = await page.evaluate(async () =>
		window.__cdHarness.summarize(
			await window.__cdHarness.waitStatus(
				(s) => s.phase === "bidding"
					&& s.turn?.active_player_id === "opponent-2"
					&& s.bidding?.current_bid?.player_id === "opponent-1"
					&& Number(s.bidding?.current_bid?.face) === 2
					&& s.visual?.bid_controls?.visible === true
					&& s.visual?.bid_controls?.can_drive === false
					&& Number(s.visual?.bid_controls?.display_face) === 2,
				5000,
			),
		),
	);
	phases.opponent_bid_visible.screenshot = await screenshotMetrics(page, "opponent_bid_visible");
	await page.evaluate(() => window.__cdHarness.qa("load_all", "opponent-1"));
	await page.evaluate(() => window.__cdHarness.qa("challenge", "opponent-2"));
	phases.duel_reveal = await page.evaluate(async () =>
		window.__cdHarness.summarize(
			await window.__cdHarness.waitStatus(
				(s) => s.phase === "duel"
					&& s.duel?.phase === "ready"
					&& s.visual?.duel?.mode === "reveal"
					&& s.visual?.duel?.all_revealed === true
					&& Number(s.visual?.duel?.grid_count ?? 0) > 0
					&& s.visual?.duel?.marker_visible !== true
					&& s.visual?.background?.position_y === 720,
				5000,
			),
		),
	);
	phases.duel_reveal.screenshot = await screenshotMetrics(page, "duel_reveal");
	phases.duel_combat = await page.evaluate(async () =>
		window.__cdHarness.summarize(
			await window.__cdHarness.waitStatus(
				(s) => s.phase === "duel"
					&& s.duel?.phase === "executing"
					&& s.duel?.resolution
					&& s.visual?.duel?.mode === "combat"
					&& s.visual?.duel?.cylinder_visible === true
					&& s.visual?.duel?.marker_visible === true
					&& Number(s.visual?.duel?.cylinder_slot_index ?? 0) >= 1
					&& Number(s.visual?.duel?.cylinder_loaded_count ?? 0) >= 2
					&& s.visual?.duel?.cylinder_loaded === true,
				9000,
			),
		),
	);
	phases.duel_combat.screenshot = await screenshotMetrics(page, "duel_combat");
	phases.next_round = await page.evaluate(async () =>
		window.__cdHarness.summarize(
			await window.__cdHarness.waitStatus(
				(s) => s.turn?.round_index >= 1 && s.phase !== "duel",
				12000,
			),
		),
	);
	if (phases.next_round?.phase === "revolver_reload" && phases.next_round?.pending?.player_id) {
		await page.evaluate(
			(playerId) => window.__cdHarness.qa("load_all", playerId),
			phases.next_round.pending.player_id,
		);
	}
	phases.post_duel_shake = await page.evaluate(async () =>
		window.__cdHarness.summarize(
			await window.__cdHarness.waitStatus(
				(s) => Number(s.turn?.round_index ?? 0) >= 1
					&& s.phase === "cup_shake"
					&& !s.pending_load,
				8000,
			),
		),
	);
	const timeoutStartedAt = Date.now();
	phases.next_round_timeout = await page.evaluate(async () =>
		window.__cdHarness.summarize(
			await window.__cdHarness.waitStatus(
				(s) => Number(s.turn?.round_index ?? 0) >= 1 && s.phase !== "cup_shake",
				9000,
			),
		),
	);
	phases.next_round_timeout.elapsed_ms = Date.now() - timeoutStartedAt;

	const expectations = {
		reload: { position_y: -410 },
		after_reload_clicks: { position_y: 720, phase: "cup_shake", player_bullets: 3 },
		shake: { position_y: 720 },
		bidding_local_turn: { position_y: -410 },
		skull_bid_hit: { position_y: -410, phase: "bidding" },
		after_skull_reload: { position_y: -410, phase: "bidding" },
		duel_reveal: { position_y: 720, phase: "duel" },
		duel_combat: { position_y: 720, phase: "duel" },
	};

	const checks = {};
	for (const [phase, expect] of Object.entries(expectations)) {
		const snap = phases[phase];
		const bg = snap?.background;
		const playerBullets = snap?.cylinder?.player_bullets;
		checks[phase] = {
			ok:
				bg?.position_y === expect.position_y &&
				(expect.phase ? snap?.phase === expect.phase : true) &&
				(expect.player_bullets ? playerBullets === expect.player_bullets : true) &&
				(phase === "after_reload_clicks" || phase === "duel_combat" ? true : snap?.screenshot?.ok === true),
			expected_position_y: expect.position_y,
			expected_phase: expect.phase ?? null,
			expected_player_bullets: expect.player_bullets ?? null,
			actual: bg ?? null,
			player_bullets: playerBullets ?? null,
			screenshot: snap?.screenshot ?? null,
			phase: snap?.phase ?? null,
			hud: snap?.hud ?? null,
		};
		}
	checks.duel_reveal.ok = checks.duel_reveal.ok
		&& phases.duel_reveal?.duel?.visual?.mode === "reveal"
		&& Number(phases.duel_reveal?.duel?.visual?.player_count ?? 0) === 4
		&& Number(phases.duel_reveal?.duel?.visual?.grid_count ?? 0) > 0;
	checks.duel_combat.ok = checks.duel_combat.ok
		&& phases.duel_combat?.duel?.visual?.mode === "combat"
		&& phases.duel_combat?.duel?.visual?.cylinder_visible === true
		&& phases.duel_combat?.duel?.visual?.marker_visible === true
		&& Number(phases.duel_combat?.duel?.visual?.cylinder_slot_index ?? 0) >= 1
		&& Number(phases.duel_combat?.duel?.visual?.cylinder_loaded_count ?? 0) >= 2
		&& phases.duel_combat?.duel?.visual?.cylinder_loaded === true
		&& Boolean(phases.duel_combat?.duel?.data?.resolution);
	checks.shake.ok = checks.shake.ok
		&& Number(phases.shake?.shake_state?.counts?.["local-player"] ?? 0) >= 6
		&& Number(phases.shake?.shake?.gauge ?? 0) === 100
		&& phases.shake?.shake?.submitted === true
		&& Number(phases.shake_gauge_initial?.shake?.gauge ?? 0) >= 20
		&& Number(phases.shake_gauge_decay?.shake?.gauge ?? 0)
			< Number(phases.shake_gauge_initial?.shake?.gauge ?? 0)
		&& phases.shake?.carousel?.visible === false
		&& phases.shake?.players
			?.filter((player) => player.id !== "local-player" && !player.eliminated)
			.every((player) => player.actions?.some((action) => action.type === "shake"));
	checks.bidding_local_turn.ok = checks.bidding_local_turn.ok
		&& phases.bidding_local_turn?.bid_controls?.visible === true
		&& phases.bidding_local_turn?.bid_controls?.can_drive === true
		&& phases.bidding_local_turn?.carousel?.visible === true
		&& Number(phases.bidding_local_turn?.carousel?.active_position_x) === 0;
	checks.rail_input = {
		ok: phases.rail_input?.phase === "bidding"
			&& phases.rail_input?.turn === "local-player"
			&& Number(phases.rail_input?.rail?.selected_count) === 2,
		expected_selected_count: 2,
		selected_count: phases.rail_input?.rail?.selected_count ?? null,
		active_player_id: phases.rail_input?.turn ?? null,
	};
	checks.skull_bid_hit.ok = checks.skull_bid_hit.ok
		&& phases.skull_bid_hit?.bidding?.skull_roulette?.player_id === "local-player"
		&& phases.skull_bid_hit?.bidding?.skull_roulette?.hit === true
		&& phases.skull_bid_hit?.players?.find((player) => player.id === "local-player")?.hp === 5
		&& phases.skull_bid_hit?.players?.find((player) => player.id === "local-player")?.bullets === 2;
	checks.after_skull_reload.ok = checks.after_skull_reload.ok
		&& phases.after_skull_reload?.players?.find((player) => player.id === "local-player")?.hp === 5
		&& phases.after_skull_reload?.players?.find((player) => player.id === "local-player")?.bullets === 3
		&& phases.after_skull_reload?.rail?.visible === true
		&& phases.after_skull_reload?.bid_controls?.can_drive === false
		&& phases.after_skull_reload?.bid_controls?.visible === true
		&& Number(phases.after_skull_reload?.bid_controls?.display_face) === 1
		&& phases.after_skull_reload?.carousel?.active_player_id === "opponent-1"
		&& Number(phases.after_skull_reload?.carousel?.active_position_x) === 0;
	checks.opponent_bid_visible = {
		ok: phases.opponent_bid_visible?.bidding?.current_bid?.player_id === "opponent-1"
			&& Number(phases.opponent_bid_visible?.bidding?.current_bid?.face) === 2
			&& phases.opponent_bid_visible?.bid_controls?.visible === true
			&& phases.opponent_bid_visible?.bid_controls?.can_drive === false
			&& Number(phases.opponent_bid_visible?.bid_controls?.display_face) === 2
			&& phases.opponent_bid_visible?.carousel?.bid_player_id === "opponent-1"
			&& Number(phases.opponent_bid_visible?.carousel?.bid_face) === 2
			&& phases.opponent_bid_visible?.carousel?.bid_face_visible === true
			&& phases.opponent_bid_visible?.cylinder?.visual_player_id === "local-player",
		expected_face: 2,
		current_bid: phases.opponent_bid_visible?.bidding?.current_bid ?? null,
		bid_controls: phases.opponent_bid_visible?.bid_controls ?? null,
		carousel: phases.opponent_bid_visible?.carousel ?? null,
		cylinder: phases.opponent_bid_visible?.cylinder ?? null,
	};
	checks.next_round = {
		ok: Number(phases.next_round?.round_index ?? 0) >= 1
			&& phases.next_round?.phase === "revolver_reload"
			&& phases.next_round?.pending?.source === "duel",
		expected_round_index: 1,
		expected_phase: "revolver_reload",
		phase: phases.next_round?.phase ?? null,
		round_index: phases.next_round?.round_index ?? null,
	};
	checks.post_duel_shake = {
		ok: phases.post_duel_shake?.phase === "cup_shake"
			&& !phases.post_duel_shake?.pending,
		expected_phase: "cup_shake",
		phase: phases.post_duel_shake?.phase ?? null,
		pending: phases.post_duel_shake?.pending ?? null,
	};
	checks.shake_timeout = {
		ok: phases.next_round_timeout?.phase === "dice_check"
			&& Number(phases.next_round_timeout?.elapsed_ms ?? 0) >= 5_500
			&& phases.next_round_timeout?.players
				?.filter((player) => !player.eliminated)
				.every((player) => Number(phases.next_round_timeout?.shake_state?.counts?.[player.id] ?? 0) >= 6),
		expected_delay_ms: 6_000,
		elapsed_ms: phases.next_round_timeout?.elapsed_ms ?? null,
		phase: phases.next_round_timeout?.phase ?? null,
	};
	const actionableConsoleErrors = consoleErrors.filter((error) => !error.url.endsWith("/favicon.ico"));
	checks.console = {
		ok: actionableConsoleErrors.length === 0,
		errors: actionableConsoleErrors,
		ignored: consoleErrors.filter((error) => error.url.endsWith("/favicon.ico")),
	};

	const summary = {
		url,
		webgl,
		phases,
		checks,
		consoleErrors,
		screenshots: shotsDir,
	};
	const allOk = Object.values(checks).every((row) => row.ok);
	console.log(JSON.stringify(summary, null, 2));
	process.exit(allOk ? 0 : 1);
} finally {
	await browser.close();
}
