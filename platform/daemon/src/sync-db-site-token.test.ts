import { describe, expect, it } from "bun:test";
import { classifySyncDbSiteToken } from "./sync-db-site-token.js";

describe("sync DB site tokens", () => {
	it("preserves source and semantic token classification", () => {
		for (const token of ["file.ts:12", "a/b/c.ts:42", "/a/b.ts:3"]) {
			expect(classifySyncDbSiteToken(token)).toBe("source-location");
		}
		expect(classifySyncDbSiteToken("db:memory.read.owner")).toBe("semantic");
		for (const token of ["a.ts", "a b.ts:1", "a.ts:no", "a:b:1", "a//b.ts:1"]) {
			expect(classifySyncDbSiteToken(token)).toBeNull();
		}
	});

	it("rejects long slash-separated invalid tokens without backtracking", () => {
		const started = performance.now();
		expect(classifySyncDbSiteToken(`${"a/".repeat(100_000)}!`)).toBeNull();
		expect(performance.now() - started).toBeLessThan(1000);
	});
});
