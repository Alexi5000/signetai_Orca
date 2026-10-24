import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("readme bottom", () => {
	test("has surfaces plus docs table plus links and no star history", () => {
		const md = readFileSync("README.md", "utf8");
		expect(md).toContain("## How Orca fits together");
		expect(md).toContain("surfaces/cli");
		expect(md).toContain("surfaces/dashboard");
		expect(md).toContain("surfaces/desktop");
		expect(md).toContain("surfaces/tray");
		expect(md).toContain("surfaces/browser-extension");
		expect(md).toMatch(/\|\s*Goal\s*\|\s*Start here\s*\|/);
		expect(md).toContain("## Links");
		expect(md).not.toContain("star-history.com");
		expect(md).not.toContain("## Star History");
	});
});
