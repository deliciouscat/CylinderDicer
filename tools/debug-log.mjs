#!/usr/bin/env node
/**
 * Agent/debug CLI logger.
 *
 * Writes append-only lines to log/.log at the repo root.
 *
 * Usage:
 *   node tools/debug-log.mjs append "message"
 *   node tools/debug-log.mjs append --level warn --source convex-play "reload stuck B:0"
 *   node tools/debug-log.mjs append --json '{"event":"setup.load_initial","revision":3}'
 *   echo "multiline note" | node tools/debug-log.mjs append --stdin
 *   node tools/debug-log.mjs tail [--lines 40]
 *   node tools/debug-log.mjs tail --tag reload --source convex-play
 *   node tools/debug-log.mjs read
 *   node tools/debug-log.mjs clear
 *   node tools/debug-log.mjs path
 *   node tools/debug-log.mjs help
 *
 * npm:
 *   npm run debug:log -- append "hello"
 *   npm run debug:log -- tail
 */
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOG_DIR = join(ROOT, "log");
const LOG_FILE = join(LOG_DIR, ".log");

const LEVELS = new Set(["debug", "info", "warn", "error"]);

function ensureLogFile() {
	if (!existsSync(LOG_DIR)) {
		mkdirSync(LOG_DIR, { recursive: true });
	}
	if (!existsSync(LOG_FILE)) {
		writeFileSync(LOG_FILE, "", "utf8");
	}
}

function usage(exitCode = 0) {
	const text = `debug-log — append-only agent debug log → log/.log

Commands:
  append [message...]     Append one log entry (default command)
  tail [--lines N]        Print last N lines (default 40)
  read                    Print full log
  clear                   Truncate log/.log
  path                    Print absolute path to log/.log
  help                    Show this help

append options:
  --level <debug|info|warn|error>   default: info
  --source <name>                   default: agent
  --json <json-string>              structured fields (merged into entry)
  --stdin                           read message body from stdin
  --tag <tag>                       free-form tag (repeatable)

read/tail filters:
  --level <debug|info|warn|error>
  --source <name>
  --tag <tag>                       repeatable; entry must include every tag

Examples:
  node tools/debug-log.mjs append "Command accepted but B:0"
  node tools/debug-log.mjs append --level warn --source convex-play --tag reload "UI not updating"
  node tools/debug-log.mjs append --json '{"revision":3,"phase":"revolver_reload"}' "after setup.load_initial"
  npm run debug:log -- tail --lines 20
`;
	process.stdout.write(text);
	process.exit(exitCode);
}

function parseArgs(argv) {
	const args = [...argv];
	let command = "append";
	if (args[0] && !args[0].startsWith("-")) {
		const maybe = args[0];
		if (["append", "tail", "read", "clear", "path", "help"].includes(maybe)) {
			command = maybe;
			args.shift();
		}
	}

	const opts = {
		command,
		level: null,
		source: null,
		json: null,
		stdin: false,
		lines: 40,
		tags: [],
		messageParts: [],
	};

	for (let i = 0; i < args.length; i += 1) {
		const arg = args[i];
		if (arg === "--level") {
			opts.level = String(args[++i] ?? "info").toLowerCase();
		} else if (arg === "--source") {
			opts.source = String(args[++i] ?? "agent");
		} else if (arg === "--json") {
			opts.json = args[++i];
		} else if (arg === "--stdin") {
			opts.stdin = true;
		} else if (arg === "--lines") {
			opts.lines = Number(args[++i] ?? 40);
		} else if (arg === "--tag") {
			opts.tags.push(String(args[++i] ?? ""));
		} else if (arg === "--help" || arg === "-h") {
			opts.command = "help";
		} else if (arg.startsWith("-")) {
			throw new Error(`unknown option: ${arg}`);
		} else {
			opts.messageParts.push(arg);
		}
	}

	if (opts.level != null && !LEVELS.has(opts.level)) {
		throw new Error(`invalid --level ${opts.level}; use debug|info|warn|error`);
	}
	if (!Number.isFinite(opts.lines) || opts.lines < 1) {
		throw new Error(`invalid --lines ${opts.lines}`);
	}

	return opts;
}

async function readStdin() {
	if (process.stdin.isTTY) {
		return "";
	}
	const chunks = [];
	for await (const chunk of process.stdin) {
		chunks.push(chunk);
	}
	return Buffer.concat(chunks).toString("utf8").replace(/\s+$/, "");
}

function formatEntry({ level, source, message, tags, fields }) {
	const entry = {
		ts: new Date().toISOString(),
		level,
		source,
		message,
	};
	if (tags.length > 0) {
		entry.tags = tags.filter(Boolean);
	}
	if (fields && typeof fields === "object" && !Array.isArray(fields)) {
		entry.fields = fields;
	}
	return `${JSON.stringify(entry)}\n`;
}

async function cmdAppend(opts) {
	ensureLogFile();

	let message = opts.messageParts.join(" ").trim();
	if (opts.stdin) {
		const body = await readStdin();
		message = message ? `${message}\n${body}` : body;
	}
	if (!message) {
		throw new Error("append requires a message (args and/or --stdin)");
	}

	let fields = null;
	if (opts.json != null) {
		try {
			fields = JSON.parse(opts.json);
		} catch (error) {
			throw new Error(`--json is not valid JSON: ${error.message}`);
		}
		if (fields == null || typeof fields !== "object" || Array.isArray(fields)) {
			throw new Error("--json must be a JSON object");
		}
	}

	const line = formatEntry({
		level: opts.level ?? "info",
		source: opts.source ?? "agent",
		message,
		tags: opts.tags,
		fields,
	});
	appendFileSync(LOG_FILE, line, "utf8");
	process.stdout.write(line);
}

function parseLogLines(text) {
	const lines = text === "" ? [] : text.replace(/\n$/, "").split("\n");
	return lines.map((line) => {
		try {
			return { line, entry: JSON.parse(line) };
		} catch (_error) {
			return { line, entry: null };
		}
	});
}

function matchesFilters(row, opts) {
	const entry = row.entry;
	if (!entry) {
		return true;
	}
	if (opts.level && entry.level !== opts.level) {
		return false;
	}
	if (opts.source && entry.source !== opts.source) {
		return false;
	}
	for (const tag of opts.tags) {
		if (!Array.isArray(entry.tags) || !entry.tags.includes(tag)) {
			return false;
		}
	}
	return true;
}

function filteredRows(opts) {
	ensureLogFile();
	const text = readFileSync(LOG_FILE, "utf8");
	return parseLogLines(text).filter((row) => matchesFilters(row, opts));
}

function cmdTail(opts) {
	const rows = filteredRows(opts);
	const slice = rows.slice(-opts.lines).map((row) => row.line);
	if (slice.length === 0) {
		process.stdout.write("(empty log)\n");
		return;
	}
	process.stdout.write(`${slice.join("\n")}\n`);
}

function cmdRead(opts) {
	const rows = filteredRows(opts).map((row) => row.line);
	process.stdout.write(rows.length ? `${rows.join("\n")}\n` : "(empty log)\n");
}

function cmdClear() {
	ensureLogFile();
	writeFileSync(LOG_FILE, "", "utf8");
	process.stdout.write(`cleared ${LOG_FILE}\n`);
}

function cmdPath() {
	ensureLogFile();
	process.stdout.write(`${LOG_FILE}\n`);
}

async function main() {
	let opts;
	try {
		opts = parseArgs(process.argv.slice(2));
	} catch (error) {
		process.stderr.write(`${error.message}\n`);
		usage(1);
		return;
	}

	try {
		switch (opts.command) {
			case "help":
				usage(0);
				break;
			case "append":
				await cmdAppend(opts);
				break;
			case "tail":
				cmdTail(opts);
				break;
			case "read":
				cmdRead(opts);
				break;
			case "clear":
				cmdClear();
				break;
			case "path":
				cmdPath();
				break;
			default:
				throw new Error(`unknown command: ${opts.command}`);
		}
	} catch (error) {
		process.stderr.write(`${error.message}\n`);
		process.exit(1);
	}
}

await main();
