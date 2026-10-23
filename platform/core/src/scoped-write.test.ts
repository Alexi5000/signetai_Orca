import { afterEach, expect, test } from "bun:test";
import {
	linkSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileScopedAtomicSync } from "./secure-fs";
const dirs: string[] = [];
function scratch() {
	const dir = mkdtempSync(join(tmpdir(), "signet-scoped-write-"));
	dirs.push(dir);
	return dir;
}
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
test("creates and atomically replaces regular files, retaining their mode", () => {
	const root = scratch();
	writeFileScopedAtomicSync(root, "nested/data.json", "first", { mode: 0o600 });
	writeFileScopedAtomicSync(root, "nested/data.json", "second");
	expect(readFileSync(join(root, "nested/data.json"), "utf8")).toBe("second");
	expect(statSync(join(root, "nested/data.json")).mode & 0o777).toBe(0o600);
	expect(readdirSync(join(root, "nested"))).toEqual(["data.json"]);
});
test("accepts an explicitly selected root alias but rejects linked descendants", () => {
	const root = scratch();
	const outside = scratch();
	const alias = join(root, "alias");
	symlinkSync(outside, alias, "dir");
	writeFileScopedAtomicSync(alias, "regular.json", "safe");
	expect(readFileSync(join(outside, "regular.json"), "utf8")).toBe("safe");
	expect(() => writeFileScopedAtomicSync(root, "alias/other.json", "bad")).toThrow();
	expect(() => writeFileScopedAtomicSync(root, "../escape", "bad")).toThrow();
});
test("rejects existing and dangling symlinks, hard links, and directories", () => {
	const root = scratch();
	const outside = scratch();
	const victim = join(outside, "victim");
	writeFileSync(victim, "unchanged");
	symlinkSync(victim, join(root, "linked"));
	symlinkSync(join(outside, "missing"), join(root, "dangling"));
	linkSync(victim, join(root, "hard"));
	mkdirSync(join(root, "directory"));
	for (const name of ["linked", "dangling", "hard", "directory"])
		expect(() => writeFileScopedAtomicSync(root, name, "bad")).toThrow();
	expect(readFileSync(victim, "utf8")).toBe("unchanged");
	expect(readdirSync(outside)).toEqual(["victim"]);
});
