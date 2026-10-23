import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const directory = resolve(import.meta.dir, "../.github/workflows");
const workflows = readdirSync(directory).filter((file) => /\.ya?ml$/.test(file));

function load(file: string): Record<string, unknown> {
	return Bun.YAML.parse(readFileSync(resolve(directory, file), "utf8")) as Record<string, unknown>;
}

function usesIn(value: unknown): string[] {
	if (!value || typeof value !== "object") return [];
	return Object.entries(value).flatMap(([key, child]) =>
		key === "uses" && typeof child === "string" ? [child] : usesIn(child),
	);
}

test("external workflow code is fixed to immutable revisions", () => {
	const mutable = workflows.flatMap((file) =>
		usesIn(load(file))
			.filter((use) => !use.startsWith("./"))
			.filter((use) => !/^[^@]+@[a-f0-9]{40}$/.test(use) && !/^docker:\/\/.+@sha256:[a-f0-9]{64}$/.test(use))
			.map((use) => `${file}: ${use}`),
	);
	expect(mutable).toEqual([]);
});

for (const file of ["readme-lint.yml", "desktop-build.yml"]) {
	test(`${file} defaults to read-only repository access`, () => {
		expect(load(file).permissions).toEqual({ contents: "read" });
	});
}

test("desktop release upload retains its explicit write grant", () => {
	const jobs = load("desktop-build.yml").jobs as Record<string, { permissions?: Record<string, string> }>;
	expect(jobs.build.permissions).toEqual({ contents: "write" });
});

test("documentation validation never deploys PR content or inherited upstream targets", () => {
	const jobs = load("deploy-docs.yml").jobs as Record<
		string,
		{ steps: { name?: string; id?: string; if?: string; with: Record<string, string> }[] }
	>;
	const steps = jobs["build-and-deploy"].steps;
	const deploy = steps.find((step) => step.id === "deploy");
	const validation = steps.find((step) => step.name === "Validate deployment configuration");
	if (!deploy || !validation) throw new Error("Missing guarded deployment steps");
	expect(deploy.if).toBe(
		"github.event_name == 'push' && github.ref == 'refs/heads/main' && vars.ENABLE_DOCS_DEPLOY == 'true'",
	);
	expect(validation.if).toBe(deploy.if);
	expect(steps.indexOf(validation)).toBeLessThan(steps.indexOf(deploy));
	expect(deploy.with.accountId).toBe(`\${{ vars.CLOUDFLARE_ACCOUNT_ID }}`);
	expect(deploy.with.command).toBe(
		`pages deploy dist --project-name=\${{ vars.CLOUDFLARE_PAGES_PROJECT }} --branch=main`,
	);
	for (const name of [
		"Verify root-derived docs",
		"Validate public content",
		"Typecheck documentation site",
		"Build documentation site",
	]) {
		expect(steps.find((step) => step.name === name)?.if).toBeUndefined();
	}
});
