import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { ChildProcess } from "node:child_process";
import EventEmitter from "node:events";
import { closeSync, fstatSync, mkdtempSync, openSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
mock.module("electron", () => ({
	default: {
		app: { getPath: (_name: string) => "/tmp/signet-test-userdata", isPackaged: false },
	},
	app: { getPath: (_name: string) => "/tmp/signet-test-userdata", isPackaged: false },
}));
const testRuntimePaths = {
	bunPath: () => "/usr/local/bin/bun",
	daemonEntry: () => "/tmp/signet-test-daemon/dist/daemon.js",
	daemonRoot: () => "/tmp/signet-test-daemon",
};

const daemonLogs = await import("./daemon-logs.js");
let openLogsMock: ReturnType<typeof spyOn>;
const { DaemonManager } = await import("./daemon-manager.js");

function makeDaemonManager(workspacePath: string): InstanceType<typeof DaemonManager> {
	return new DaemonManager({ workspacePath, runtimePaths: testRuntimePaths });
}
function existsExceptLayoutFile(path: unknown): boolean {
	return !String(path).endsWith("workspace-layout.json");
}
function makeFakeChild(): ChildProcess {
	const emitter = new EventEmitter() as unknown as ChildProcess;
	(emitter as unknown as Record<string, unknown>).exitCode = null;
	(emitter as unknown as Record<string, unknown>).signalCode = null;
	(emitter as unknown as Record<string, unknown>).pid = 99999;
	(emitter as unknown as Record<string, unknown>).kill = (_signal?: string) => true;
	return emitter;
}
const HEALTHY_PAYLOAD = {
	version: "1.0.0-test",
	pid: 42,
	uptime: 100,
	runtime: "bun-js",
	agentsDir: "/tmp/signet-workspace",
};
function healthyFetchResponse(): Response {
	return {
		ok: true,
		json: () => Promise.resolve(HEALTHY_PAYLOAD),
	} as unknown as Response;
}

describe("DaemonManager dual-mode regressions (#606 / PR #615)", () => {
	let originalFetch: typeof globalThis.fetch;
	let logDirectory: string;
	let logFds: { stdout: number; stderr: number };
	let unrelatedFd: number;
	let ownedFds: Array<{ fd: number; ino: number; dev: number }>;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
		logDirectory = mkdtempSync(join(tmpdir(), "signet-desktop-fds-"));
		logFds = {
			stdout: openSync(join(logDirectory, "stdout.log"), "w"),
			stderr: openSync(join(logDirectory, "stderr.log"), "w"),
		};
		unrelatedFd = openSync(join(logDirectory, "unrelated.log"), "w");
		ownedFds = [logFds.stdout, logFds.stderr, unrelatedFd].map((fd) => {
			const { ino, dev } = fstatSync(fd);
			return { fd, ino, dev };
		});
		openLogsMock = spyOn(daemonLogs, "openDaemonLogs").mockReturnValue(logFds);
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		mock.restore();
		const closeOwnedDescriptors = () => {
			for (const { fd, ino, dev } of ownedFds) {
				try {
					const current = fstatSync(fd);
					if (current.ino === ino && current.dev === dev) closeSync(fd);
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code !== "EBADF") throw error;
				}
			}
			rmSync(logDirectory, { recursive: true, force: true });
		};
		try {
			expect(fstatSync(unrelatedFd).isFile()).toBe(true);
		} finally {
			closeOwnedDescriptors();
		}
	});
	test("spawnBundled passes synchronous fd, not lazy WriteStream (regression for #606 fd race)", async () => {
		let fetchCallCount = 0;
		globalThis.fetch = async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
			fetchCallCount += 1;
			if (fetchCallCount <= 1) throw new Error("ECONNREFUSED");
			return healthyFetchResponse();
		};
		const fs = await import("node:fs");
		openLogsMock.mockClear();
		spyOn(fs, "existsSync").mockReturnValue(true);
		spyOn(fs, "mkdirSync").mockReturnValue(undefined);
		const cp = await import("node:child_process");
		const fakeChild = makeFakeChild();
		const spawnSpy = spyOn(cp, "spawn").mockReturnValue(fakeChild);
		const manager = makeDaemonManager("/tmp/signet-workspace");
		await manager.ensureStarted();
		expect(spawnSpy).toHaveBeenCalledTimes(1);
		expect(spawnSpy.mock.calls[0][0]).toBe("/usr/local/bin/bun");

		const spawnOpts = spawnSpy.mock.calls[0][2] as { stdio: unknown[] };
		const stdioArg = spawnOpts.stdio;
		expect(stdioArg[0]).toBe("ignore");
		expect(typeof stdioArg[1]).toBe("number");
		expect(typeof stdioArg[2]).toBe("number");
		expect(stdioArg[1]).toBe(logFds.stdout);
		expect(stdioArg[2]).toBe(logFds.stderr);

		expect(openLogsMock).toHaveBeenCalledTimes(1);
		expect(openLogsMock.mock.calls[0]).toEqual([resolve("/tmp/signet-workspace")]);
	});

	test("ensureStarted attaches when daemon healthy at :3850 (regression for #606 update-drift loop)", async () => {
		globalThis.fetch = async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
			healthyFetchResponse();

		const cp = await import("node:child_process");
		const spawnSpy = spyOn(cp, "spawn");
		const manager = makeDaemonManager("/tmp/signet-workspace");
		const status = await manager.ensureStarted();
		expect(spawnSpy).not.toHaveBeenCalled();
		expect(status.mode).toBe("attached");
		expect(manager.daemonMode).toBe("attached");
		expect(status.runtime).toBe("bun-js");
	});
	test("ensureStarted spawns bundled when probe fails", async () => {
		let fetchCallCount = 0;
		globalThis.fetch = async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
			fetchCallCount += 1;
			if (fetchCallCount <= 1) throw new Error("ECONNREFUSED");
			return healthyFetchResponse();
		};

		const fs = await import("node:fs");
		spyOn(fs, "existsSync").mockImplementation(existsExceptLayoutFile);
		spyOn(fs, "mkdirSync").mockReturnValue(undefined);

		const cp = await import("node:child_process");
		const fakeChild = makeFakeChild();
		const spawnSpy = spyOn(cp, "spawn").mockReturnValue(fakeChild);
		const manager = makeDaemonManager("/tmp/signet-workspace");
		const status = await manager.ensureStarted();
		expect(spawnSpy).toHaveBeenCalledTimes(1);
		expect(status.mode).toBe("bundled");
		expect(manager.daemonMode).toBe("bundled");
	});

	test("ENOENT from bundled runtime produces actionable startup state instead of an unhandled error", async () => {
		globalThis.fetch = async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
			throw new Error("ECONNREFUSED");
		};

		const fs = await import("node:fs");
		spyOn(fs, "existsSync").mockImplementation(existsExceptLayoutFile);
		spyOn(fs, "mkdirSync").mockReturnValue(undefined);

		const cp = await import("node:child_process");
		const fakeChild = makeFakeChild();
		const spawnSpy = spyOn(cp, "spawn").mockImplementation(() => {
			queueMicrotask(() => {
				const error = Object.assign(new Error("spawn /missing/bun ENOENT"), { code: "ENOENT" });
				fakeChild.emit("error", error);
			});
			return fakeChild;
		});

		const manager = makeDaemonManager("/tmp/signet-workspace");
		await expect(manager.ensureStarted()).rejects.toThrow("Reinstall the desktop app or install Bun");

		const status = await manager.status();
		expect(spawnSpy).toHaveBeenCalledTimes(1);
		expect(status.running).toBe(false);
		expect(status.mode).toBe("none");
		expect(status.startupErrorCode).toBe("bundled-runtime-enoent");
		expect(status.startupError).toContain("Reinstall the desktop app or install Bun");
		expect(() => fstatSync(logFds.stdout)).toThrow();
		expect(() => fstatSync(logFds.stderr)).toThrow();
		expect(fstatSync(unrelatedFd).isFile()).toBe(true);
	});
});
