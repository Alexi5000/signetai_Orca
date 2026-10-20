import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const roots: string[] = [];
const script = join(import.meta.dir, "sync-specs-to-project.ts");
const hostile = `backslash\\" } mutation { injected } # ' $(touch INJECTED) \t & <tag>`;

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function run(options: { dry?: boolean; fail?: boolean; failMutation?: boolean; existing?: boolean } = {}) {
	const root = mkdtempSync(join(tmpdir(), "signet-project-sync-"));
	roots.push(root);
	mkdirSync(join(root, "docs", "specs"), { recursive: true });
	mkdirSync(join(root, "bin"));
	writeFileSync(
		join(root, "docs", "specs", "dependencies.yaml"),
		`specs:\n  - id: '${hostile}'\n    status: approved\n    path: '${hostile}'\n    decision: active\n`,
	);
	writeFileSync(
		join(root, "bin", "gh"),
		`#!${process.execPath}
import { appendFileSync, readFileSync } from "node:fs";
const raw = readFileSync(0, "utf8");
const payload = raw ? JSON.parse(raw) : { query: process.argv.find(x => x.startsWith("query="))?.slice(6), variables: {} };
appendFileSync("requests.jsonl", JSON.stringify({ ...payload, args: process.argv.slice(2) }) + "\\n");
if (process.env.TEST_FAIL === "1" || (process.env.TEST_FAIL_MUTATION === "1" && payload.query.includes("updateProjectV2ItemFieldValue"))) { console.log(JSON.stringify({ errors: [{ message: "test failure" }] })); process.exit(0); }
const vars = payload.variables;
if (payload.query.includes("addProjectV2DraftIssue")) console.log(JSON.stringify({data:{addProjectV2DraftIssue:{projectItem:{id:"new-item"}}}}));
else if (payload.query.includes("updateProjectV2ItemFieldValue")) console.log(JSON.stringify({data:{updateProjectV2ItemFieldValue:{projectV2Item:{id:vars.itemId}}}}));
else {
 const nodes = process.env.TEST_EXISTING === "1" && vars.cursor ? [{id:"existing-item",content:{title:"existing"},fieldValueByName:{text:process.env.TEST_SPEC}}] : [];
 console.log(JSON.stringify({data:{node:{items:{nodes,pageInfo:{hasNextPage:!!raw && !vars.cursor,endCursor:vars.cursor ? null : ${JSON.stringify(hostile)}}}}}}));
}
`,
		{ mode: 0o700 },
	);
	const child = Bun.spawnSync([process.execPath, script, ...(options.dry ? ["--dry-run"] : [])], {
		cwd: root,
		env: {
			...process.env,
			PATH: `${join(root, "bin")}:${process.env.PATH}`,
			TEST_FAIL: options.fail ? "1" : "0",
			TEST_FAIL_MUTATION: options.failMutation ? "1" : "0",
			TEST_EXISTING: options.existing ? "1" : "0",
			TEST_SPEC: hostile,
		},
		timeout: 10_000,
	});
	const calls = options.dry
		? []
		: readFileSync(join(root, "requests.jsonl"), "utf8")
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line));
	return { child, calls, root };
}

test("sync passes hostile titles, field values and pagination cursors as literal GraphQL variables", () => {
	const { child, calls, root } = run();
	expect(child.exitCode).toBe(0);
	expect(calls).toHaveLength(10);
	for (const call of calls) {
		expect(call.args).toEqual(["api", "graphql", "--input", "-"]);
		expect(call.query).not.toContain("injected");
		expect(call.query).not.toContain("touch INJECTED");
	}
	expect(calls[0].variables.cursor).toBeNull();
	expect(calls[1].variables.cursor).toBe(hostile);
	expect(calls[2].variables.title).toBe(hostile[0].toUpperCase() + hostile.slice(1));
	expect(calls[3].variables.value).toBe(hostile);
	expect(calls[4].variables.value).toBe(hostile);
	expect(calls.slice(3).every((call) => call.variables.itemId === "new-item")).toBe(true);
	expect(() => readFileSync(join(root, "INJECTED"))).toThrow();
});

test("sync preserves existing item identity and updates selection variables", () => {
	const { child, calls } = run({ existing: true });
	expect(child.exitCode).toBe(0);
	expect(calls).toHaveLength(9);
	expect(calls.some((call) => call.query.includes("addProjectV2DraftIssue"))).toBe(false);
	expect(calls.slice(2).every((call) => call.variables.itemId === "existing-item")).toBe(true);
	expect(calls.slice(-3).map((call) => call.variables.optionId)).toEqual(["1cb7637b", "47fc9ee4", "df62f047"]);
});

test("GraphQL errors stop the sync before any mutation", () => {
	const { child, calls } = run({ fail: true });
	expect(child.exitCode).not.toBe(0);
	expect(calls).toHaveLength(1);
	expect(child.stderr.toString()).toContain("GitHub project request failed");
});

test("dry run never invokes GitHub", () => {
	const { child, calls } = run({ dry: true });
	expect(child.exitCode).toBe(0);
	expect(calls).toEqual([]);
	expect(child.stdout.toString()).toContain("[dry run]");
});

test("field update errors stop remaining writes instead of reporting success", () => {
	const { child, calls } = run({ failMutation: true });
	expect(child.exitCode).not.toBe(0);
	expect(calls).toHaveLength(4);
	expect(child.stdout.toString()).not.toContain("done:");
});
