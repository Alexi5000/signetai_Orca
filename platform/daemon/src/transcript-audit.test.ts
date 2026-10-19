import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { readFileWithStatSync } from "@signet/core";
import { capTranscriptAuditContent, writeTranscriptAudit } from "./transcript-audit";
import { createTestTempDir } from "./test-temp-dir";

describe("transcript audit sizing (#1163)", () => {
	it("caps oversized audit transcripts with a truncation marker", () => {
		const big = "x".repeat(10 * 1024 * 1024);
		const capped = capTranscriptAuditContent(big);
		expect(capped.length).toBeLessThan(big.length);
		expect(capped.length).toBeLessThanOrEqual(8 * 1024 * 1024 + 200);
		expect(capped.endsWith("chars omitted] ...\n")).toBe(true);
		expect(capTranscriptAuditContent("small transcript")).toBe("small transcript");
	});

	it("archives by renaming the latest instead of writing the content twice", async () => {
		const root = createTestTempDir("signet-audit-");
		try {
			// 10MB raw — well over the 8MB cap — so a duplicated write would
			// leave ~20MB of audit files for one session.
			const big = "y".repeat(10 * 1024 * 1024);
			const result = await writeTranscriptAudit({
				basePath: root,
				agentId: "default",
				sessionId: "sess-1",
				sessionKey: "sess-1",
				rawTranscript: big,
				capturedAt: "2026-08-07T00:00:00.000Z",
			});
			expect(result).not.toBeNull();
			const finalPath = result?.finalPath;
			expect(finalPath).toBeDefined();
			if (!finalPath) throw new Error("finalPath missing");

			// The archive exists with the capped content (~8MB cap, not the
			// full 10MB), and the latest was renamed away rather than
			// duplicated — one copy on disk, not two.
			const archived = readFileWithStatSync(finalPath, "utf8");
			if (!archived) throw new Error("archive missing");
			expect(archived.stat.size).toBeLessThan(9 * 1024 * 1024);
			expect(archived.stat.size).toBeGreaterThan(7 * 1024 * 1024);
			expect(existsSync(result?.latestPath ?? "")).toBe(false);
			const content = archived.content;
			expect(content).toContain("audit transcript truncated");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("keeps the rolling latest file when no archive timestamp is supplied", async () => {
		const root = createTestTempDir("signet-audit-");
		try {
			const result = await writeTranscriptAudit({
				basePath: root,
				agentId: "default",
				sessionId: "sess-2",
				sessionKey: "sess-2",
				rawTranscript: "plain transcript",
			});
			expect(result).not.toBeNull();
			expect(result?.finalPath).toBeUndefined();
			expect(existsSync(result?.latestPath ?? "")).toBe(true);
			expect(readFileSync(result?.latestPath ?? "", "utf-8")).toBe("plain transcript");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
