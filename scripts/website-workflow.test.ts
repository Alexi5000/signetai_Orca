import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

type Step = { name?: string; if?: string; run?: string; with?: Record<string, string> };
const root = resolve(import.meta.dir, "..");
const workflow = Bun.YAML.parse(readFileSync(resolve(root, ".github/workflows/deploy-web.yml"), "utf8")) as {
	on: { pull_request: unknown; push: { branches: string[] } };
	jobs: { deploy: { if?: string; steps: Step[] } };
};
const steps = workflow.jobs.deploy.steps;
const validation = steps.find((step) => step.name === "Validate deployment configuration");
const deploy = steps.find((step) => step.name === "Deploy to Cloudflare");
if (!validation?.run || !deploy) throw new Error("Missing deployment validation or action");
const validator = validation.run;

test("website checks run for PRs and main without a deployment grant", () => {
	expect(workflow.on.pull_request).toBeDefined();
	expect(workflow.on.push.branches).toEqual(["main"]);
	expect(workflow.jobs.deploy.if).toBeUndefined();
	for (const name of ["Install dependencies", "Build core package", "Build", "Validate Worker bundle"]) {
		const step = steps.find((step) => step.name === name);
		if (!step) throw new Error(`Missing unconditional check: ${name}`);
		expect(step?.if).toBeUndefined();
		expect(steps.indexOf(step)).toBeLessThan(steps.indexOf(deploy));
	}
	expect(steps.find((step) => step.name === "Validate Worker bundle")?.run).toContain("--dry-run");
});

test("only explicitly enabled main pushes deploy to an owner-selected account and Worker", () => {
	expect(deploy.if).toBe(
		"github.event_name == 'push' && github.ref == 'refs/heads/main' && vars.ENABLE_WEBSITE_DEPLOY == 'true'",
	);
	expect(validation.if).toBe(deploy.if);
	expect(steps.indexOf(validation)).toBeLessThan(steps.indexOf(deploy));
	expect(deploy.with?.accountId).toBe(`\${{ vars.CLOUDFLARE_ACCOUNT_ID }}`);
	expect(deploy.with?.command).toBe(`deploy --name=\${{ vars.CLOUDFLARE_WORKER_NAME }}`);
	const config = JSON.parse(readFileSync(resolve(root, "web/marketing/wrangler.jsonc"), "utf8"));
	expect(config.account_id).toBeUndefined();
	expect(config.name).toBeUndefined();
	expect(config.routes).toBeUndefined();
});

test("the actual deployment validator rejects missing credentials and unsafe targets", () => {
	const valid = {
		CLOUDFLARE_API_TOKEN: "test-token",
		CLOUDFLARE_ACCOUNT_ID: "a".repeat(32),
		CLOUDFLARE_WORKER_NAME: "owned-website",
	};
	const run = (values: Record<string, string>) =>
		spawnSync("bash", ["-e", "-c", validator], {
			env: { PATH: process.env.PATH, ...values },
			encoding: "utf8",
		});
	expect(run(valid).status).toBe(0);
	for (const key of Object.keys(valid)) expect(run({ ...valid, [key]: "" }).status).not.toBe(0);
	for (const name of ["-bad", "bad;echo injected", "bad\nname", "bad name", "UPPER", "a".repeat(64)]) {
		expect(run({ ...valid, CLOUDFLARE_WORKER_NAME: name }).status).not.toBe(0);
	}
	expect(run({ ...valid, CLOUDFLARE_ACCOUNT_ID: "invalid" }).status).not.toBe(0);
});

test("disabled or non-main deployment is explicitly reported as validation-only", () => {
	const summary = steps.find((step) => step.name === "Record validation-only run");
	expect(summary?.if).toBe(
		"github.event_name != 'push' || github.ref != 'refs/heads/main' || vars.ENABLE_WEBSITE_DEPLOY != 'true'",
	);
	expect(summary?.run).toContain("Deployment was not requested");
});
