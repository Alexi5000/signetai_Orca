import { describe, expect, it } from "bun:test";
import { mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { readFileWithStatSync } from "@signet/core";
import { writeFileIfChanged, writeFileIfChangedAsync } from "./file-sync";
import { createTestTempDir } from "./test-temp-dir";

describe("writeFileIfChanged", () => {
	it("skips writing when content is unchanged", () => {
		const dir = createTestTempDir("signet-file-sync-");
		try {
			const path = join(dir, "workspace", "AGENTS.md");
			mkdirSync(join(dir, "workspace"), { recursive: true });

			expect(writeFileIfChanged(path, "alpha")).toBe(true);
			const firstMtimeMs = statSync(path).mtimeMs;

			expect(writeFileIfChanged(path, "alpha")).toBe(false);
			// Read content and metadata through one descriptor (no stat-then-read race).
			const second = readFileWithStatSync(path, "utf8");

			expect(second?.stat.mtimeMs).toBe(firstMtimeMs);
			expect(second?.content).toBe("alpha");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("writes when content changes", () => {
		const dir = createTestTempDir("signet-file-sync-");
		try {
			const path = join(dir, "workspace", "AGENTS.md");
			mkdirSync(join(dir, "workspace"), { recursive: true });

			expect(writeFileIfChanged(path, "alpha")).toBe(true);
			expect(writeFileIfChanged(path, "beta")).toBe(true);
			expect(readFileSync(path, "utf-8")).toBe("beta");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("writeFileIfChangedAsync", () => {
	it("skips writing when content is unchanged", async () => {
		const dir = createTestTempDir("signet-file-sync-");
		try {
			const path = join(dir, "workspace", "AGENTS.md");
			mkdirSync(join(dir, "workspace"), { recursive: true });

			expect(await writeFileIfChangedAsync(path, "alpha")).toBe(true);
			const firstMtimeMs = statSync(path).mtimeMs;

			expect(await writeFileIfChangedAsync(path, "alpha")).toBe(false);
			// Read content and metadata through one descriptor (no stat-then-read race).
			const second = readFileWithStatSync(path, "utf8");

			expect(second?.stat.mtimeMs).toBe(firstMtimeMs);
			expect(second?.content).toBe("alpha");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("writes when content changes", async () => {
		const dir = createTestTempDir("signet-file-sync-");
		try {
			const path = join(dir, "workspace", "AGENTS.md");
			mkdirSync(join(dir, "workspace"), { recursive: true });

			expect(await writeFileIfChangedAsync(path, "alpha")).toBe(true);
			expect(await writeFileIfChangedAsync(path, "beta")).toBe(true);
			expect(readFileSync(path, "utf-8")).toBe("beta");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
