import { describe, expect, test } from "bun:test";
import { promisify } from "node:util";
import { execFileHidden, spawnHidden, spawnSyncHidden, withWindowsHide } from "./child-process";

describe("shared child-process launcher", () => {
	test("defaults process options to a hidden Windows console", () => {
		expect(withWindowsHide({}).windowsHide).toBe(true);
		expect(withWindowsHide({ windowsHide: false }).windowsHide).toBe(false);
	});

	test("preserves execFile's promisified stdout/stderr result", async () => {
		const result = await promisify(execFileHidden)(process.execPath, ["--eval", 'process.stdout.write("ok")'], {
			encoding: "utf8",
		});

		expect(result.stdout).toBe("ok");
		expect(result.stderr).toBe("");
	});

	test("rejects shell-enabled spawn options at the shared boundary", () => {
		expect(() => spawnHidden(process.execPath, { shell: true })).toThrow("does not allow shell execution");
		expect(() => spawnHidden(process.execPath, { shell: "powershell.exe" })).toThrow("does not allow shell execution");
	});
	test("sync spawn rejects shell execution in both option overloads", () => {
		expect(() => spawnSyncHidden(process.execPath, { shell: true })).toThrow("does not allow shell execution");
		expect(() => spawnSyncHidden(process.execPath, [], { shell: "sh" })).toThrow("does not allow shell execution");
		expect(() => spawnHidden(process.execPath, [], { shell: true })).toThrow("does not allow shell execution");
	});

	test("sync spawn preserves shell metacharacters as literal arguments", () => {
		const payload = 'literal spaces; $(echo injected) & "quoted"';
		const result = spawnSyncHidden(process.execPath, ["--eval", "process.stdout.write(process.argv.at(-1))", payload], {
			encoding: "utf8",
			shell: false,
		});
		expect(result.status).toBe(0);
		expect(result.stdout).toBe(payload);
	});

	test("async spawn preserves shell metacharacters as literal arguments", async () => {
		const payload = 'literal spaces; $(echo injected) & "quoted"';
		const child = spawnHidden(process.execPath, ["--eval", "process.stdout.write(process.argv.at(-1))", payload]);
		let stdout = "";
		child.stdout.on("data", (chunk) => {
			stdout += chunk.toString();
		});
		const exit = await new Promise<number | null>((resolve, reject) => {
			child.once("error", reject);
			child.once("close", resolve);
		});
		expect(exit).toBe(0);
		expect(stdout).toBe(payload);
	});
});
