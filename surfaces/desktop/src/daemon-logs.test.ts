import { afterEach, expect, test } from "bun:test";
import {
	chmodSync,
	closeSync,
	linkSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
	writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDaemonLogs } from "./daemon-logs.js";

const roots: string[] = [];
function workspace(): string {
	const root = mkdtempSync(join(tmpdir(), "signet-desktop-logs-"));
	roots.push(root);
	return root;
}
afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function append(root: string, text: string): void {
	const logs = openDaemonLogs(root);
	try {
		writeSync(logs.stdout, text);
		writeSync(logs.stderr, text);
	} finally {
		closeSync(logs.stdout);
		closeSync(logs.stderr);
	}
}

test("new logs are private and restart appends preserve existing log contents", () => {
	const root = workspace();
	append(root, "first\n");
	const dir = join(root, ".daemon", "logs");
	chmodSync(join(dir, "daemon.out.log"), 0o644);
	append(root, "second\n");
	for (const name of ["daemon.out.log", "daemon.err.log"]) {
		expect(readFileSync(join(dir, name), "utf8")).toBe("first\nsecond\n");
		if (process.platform !== "win32") expect(statSync(join(dir, name)).mode & 0o777).toBe(0o600);
	}
	if (process.platform !== "win32") expect(statSync(dir).mode & 0o777).toBe(0o700);
});

test("symlinked log leaves never modify their target or its permissions", () => {
	const root = workspace();
	const outside = join(workspace(), "outside");
	writeFileSync(outside, "untouched", { mode: 0o644 });
	append(root, "initial");
	const log = join(root, ".daemon", "logs", "daemon.err.log");
	rmSync(log);
	symlinkSync(outside, log);
	expect(() => append(root, "attack")).toThrow();
	expect(readFileSync(outside, "utf8")).toBe("untouched");
	if (process.platform !== "win32") expect(statSync(outside).mode & 0o777).toBe(0o644);
});

test("symlinked log directories are refused", () => {
	for (const name of [".daemon", "logs"]) {
		const root = workspace();
		const outside = workspace();
		if (name === "logs") mkdirSync(join(root, ".daemon"));
		symlinkSync(outside, name === "logs" ? join(root, ".daemon", name) : join(root, name), "dir");
		expect(() => openDaemonLogs(root)).toThrow();
	}
});

test("hard-linked and nonregular log leaves are refused", () => {
	const root = workspace();
	append(root, "initial");
	const log = join(root, ".daemon", "logs", "daemon.out.log");
	linkSync(log, join(root, "alias"));
	expect(() => openDaemonLogs(root)).toThrow();
	rmSync(log);
	mkdirSync(log);
	expect(() => openDaemonLogs(root)).toThrow();
});

test.skipIf(process.platform === "win32")("writable ancestors cannot redirect private workspace logs", () => {
	const parent = workspace();
	const root = join(parent, "workspace");
	mkdirSync(root, { mode: 0o700 });
	chmodSync(parent, 0o777);
	expect(() => openDaemonLogs(root)).toThrow("ancestors");
	expect(() => statSync(join(root, ".daemon"))).toThrow();
	chmodSync(parent, 0o700);
	append(root, "trusted parent\n");
	expect(readFileSync(join(root, ".daemon", "logs", "daemon.out.log"), "utf8")).toBe("trusted parent\n");
});
