import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createReportPath } from "./run";

test("default reports use distinct private directories and retain their contents", () => {
	const first = createReportPath(null);
	const second = createReportPath(null);
	try {
		expect(dirname(first)).not.toBe(tmpdir());
		expect(dirname(first)).not.toBe(dirname(second));
		if (process.platform !== "win32") {
			expect(statSync(dirname(first)).mode & 0o777).toBe(0o700);
		}
		writeFileSync(first, "first report");
		writeFileSync(second, "second report");
		expect(readFileSync(first, "utf8")).toBe("first report");
		expect(readFileSync(second, "utf8")).toBe("second report");
	} finally {
		rmSync(dirname(first), { recursive: true, force: true });
		rmSync(dirname(second), { recursive: true, force: true });
	}
});

test("explicit output directories keep the documented report path", () => {
	const root = mkdtempSync(join(tmpdir(), "signet-report-test-"));
	try {
		const directory = join(root, "artifacts");
		const path = createReportPath(directory);
		expect(path).toBe(join(directory, "boot-wedge.json"));
		writeFileSync(path, "report");
		expect(readFileSync(path, "utf8")).toBe("report");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
