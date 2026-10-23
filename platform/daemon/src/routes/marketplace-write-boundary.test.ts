import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { mountMarketplaceReviewsRoutes } from "./marketplace-reviews";
import { mountMarketplaceRoutes } from "./marketplace";
const dirs: string[] = [];
const originalPath = process.env.SIGNET_PATH;
afterEach(() => {
	if (originalPath === undefined) delete process.env.SIGNET_PATH;
	else process.env.SIGNET_PATH = originalPath;
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const cases = [
	{ file: "reviews-config.json", path: "/api/marketplace/reviews/config", method: "PATCH", body: { enabled: true } },
	{
		file: "reviews.json",
		path: "/api/marketplace/reviews",
		method: "POST",
		body: { targetType: "skill", targetId: "test", displayName: "test", rating: 5, title: "test", body: "test" },
	},
	{
		file: "mcp-servers.json",
		path: "/api/marketplace/mcp/register",
		method: "POST",
		body: { name: "test", config: { command: "signet-test-command-does-not-exist", args: [] } },
	},
	{ file: "mcp-policy.json", path: "/api/marketplace/mcp/policy", method: "PATCH", body: {} },
];
for (const entry of cases)
	test(`rejects symlink overwrite through ${entry.file}`, async () => {
		const root = mkdtempSync(join(tmpdir(), "signet-route-write-"));
		dirs.push(root);
		process.env.SIGNET_PATH = root;
		mkdirSync(join(root, "marketplace"));
		const victim = join(root, "victim");
		writeFileSync(victim, "[]");
		symlinkSync(victim, join(root, "marketplace", entry.file));
		const app = new Hono();
		app.onError(() => new Response("rejected", { status: 500 }));
		mountMarketplaceReviewsRoutes(app);
		mountMarketplaceRoutes(app);
		const res = await app.request(entry.path, {
			method: entry.method,
			headers: { "Content-Type": "application/json" },
			body: entry.body === undefined ? undefined : JSON.stringify(entry.body),
		});
		expect(res.status).toBe(500);
		expect(readFileSync(victim, "utf8")).toBe("[]");
	});
test("rejects a marketplace directory symlink without creating external files", async () => {
	const root = mkdtempSync(join(tmpdir(), "signet-route-parent-"));
	const outside = mkdtempSync(join(tmpdir(), "signet-route-outside-"));
	dirs.push(root, outside);
	process.env.SIGNET_PATH = root;
	symlinkSync(outside, join(root, "marketplace"), "dir");
	const app = new Hono();
	app.onError(() => new Response("rejected", { status: 500 }));
	mountMarketplaceReviewsRoutes(app);
	const res = await app.request("/api/marketplace/reviews/config", {
		method: "PATCH",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ enabled: true }),
	});
	expect(res.status).toBe(500);
	expect(readdirSync(outside)).toEqual([]);
});
