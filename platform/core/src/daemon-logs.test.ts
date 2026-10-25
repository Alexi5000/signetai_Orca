import { afterEach, expect, test } from "bun:test";
import {
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
import { appendPrivateDaemonLog, openPrivateDaemonLog } from "./daemon-logs";

const roots: string[] = [];
function workspace(): string {
	const root = mkdtempSync(join(tmpdir(), "signet-core-logs-"));
	roots.push(root);
	return root;
}
afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("startup reset and append use private descriptors", () => {
	const root = workspace();
	appendPrivateDaemonLog(root, "old");
	const fd = openPrivateDaemonLog(root, "startup.log", true);
	try {
		writeSync(fd, "new");
	} finally {
		closeSync(fd);
	}
	appendPrivateDaemonLog(root, " appended");
	const path = join(root, ".daemon", "logs", "startup.log");
	expect(readFileSync(path, "utf8")).toBe("new appended");
	if (process.platform !== "win32") expect(statSync(path).mode & 0o777).toBe(0o600);
});

test("startup truncation and append reject symlink and hardlink leaves", () => {
	for (const makeLink of [symlinkSync, linkSync]) {
		const root = workspace();
		const outside = join(workspace(), "untouched");
		writeFileSync(outside, "private", { mode: 0o644 });
		mkdirSync(join(root, ".daemon", "logs"), { recursive: true, mode: 0o700 });
		makeLink(outside, join(root, ".daemon", "logs", "startup.log"));
		expect(() => openPrivateDaemonLog(root, "startup.log", true)).toThrow();
		expect(() => appendPrivateDaemonLog(root, "injected")).toThrow();
		expect(readFileSync(outside, "utf8")).toBe("private");
		if (process.platform !== "win32") expect(statSync(outside).mode & 0o777).toBe(0o644);
	}
});

test("unsafe directory and filename do not redirect writes", () => {
	const root = workspace();
	const outside = workspace();
	symlinkSync(outside, join(root, ".daemon"));
	expect(() => appendPrivateDaemonLog(root, "injected")).toThrow();
	expect(() => openPrivateDaemonLog(root, "../outside" as "startup.log")).toThrow();
});

test("v2 workspaces use private logs under the canonical runtime directory", () => {
	const root = workspace();
	writeFileSync(join(root, "workspace-layout.json"), '{"version":2}\n');
	appendPrivateDaemonLog(root, "v2 startup");
	const path = join(root, "runtime", "logs", "startup.log");
	expect(readFileSync(path, "utf8")).toBe("v2 startup");
	if (process.platform !== "win32") expect(statSync(path).mode & 0o777).toBe(0o600);
});
