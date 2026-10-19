import { afterEach, describe, expect, test } from "bun:test";
import {
	chmodSync,
	closeSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	readlinkSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
	appendFileSecure,
	appendFileSecureSync,
	createPrivateTempDir,
	createPrivateTempDirAsync,
	openFileExclusiveSync,
	readFileIfExists,
	readFileIfExistsSync,
	readFileWithStat,
	readFileWithStatSync,
	writeFileAtomic,
	writeFileAtomicSync,
	writeFileExclusiveSync,
} from "./secure-fs";

const posix = process.platform !== "win32";
const dirs: string[] = [];

function scratch(): string {
	const dir = createPrivateTempDir("signet-secure-fs-test-");
	dirs.push(dir);
	return dir;
}

function mode(path: string): number {
	return statSync(path).mode & 0o777;
}

afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("createPrivateTempDir", () => {
	test("creates unique owner-only directories", async () => {
		const a = scratch();
		const b = scratch();
		const c = await createPrivateTempDirAsync("signet-secure-fs-test-");
		dirs.push(c);
		expect(new Set([a, b, c]).size).toBe(3);
		for (const dir of [a, b, c]) {
			expect(statSync(dir).isDirectory()).toBe(true);
			if (posix) expect(mode(dir)).toBe(0o700);
		}
	});

	test("honors an explicit parent directory", () => {
		const parent = scratch();
		const child = createPrivateTempDir("nested-", parent);
		expect(child.startsWith(join(parent, "nested-"))).toBe(true);
	});
});

describe("writeFileAtomicSync / writeFileAtomic", () => {
	test("creates new files with the process default mode and leaves no temp files", async () => {
		const dir = scratch();
		const syncPath = join(dir, "sync.txt");
		const asyncPath = join(dir, "async.txt");
		writeFileAtomicSync(syncPath, "hello");
		await writeFileAtomic(asyncPath, Buffer.from("world"));
		expect(readFileSync(syncPath, "utf8")).toBe("hello");
		expect(readFileSync(asyncPath, "utf8")).toBe("world");
		if (posix) {
			const expected = 0o666 & ~process.umask();
			expect(mode(syncPath)).toBe(expected);
			expect(mode(asyncPath)).toBe(expected);
		}
		expect(readdirSync(dir).sort()).toEqual(["async.txt", "sync.txt"]);
	});

	test("replaces existing content and preserves existing permissions", async () => {
		const dir = scratch();
		const path = join(dir, "script.sh");
		writeFileSync(path, "old");
		if (posix) chmodSync(path, 0o751);
		const inodeBefore = statSync(path).ino;
		writeFileAtomicSync(path, "new");
		const replaced = readFileWithStatSync(path, "utf8");
		expect(replaced?.content).toBe("new");
		if (posix) {
			expect(mode(path)).toBe(0o751);
			// Replacement is a rename of a fresh file, never an in-place truncate.
			expect(replaced?.stat.ino).not.toBe(inodeBefore);
		}
		await writeFileAtomic(path, "newer");
		expect(readFileWithStatSync(path, "utf8")?.content).toBe("newer");
		if (posix) expect(mode(path)).toBe(0o751);
	});

	test("applies an explicit mode", async () => {
		if (!posix) return;
		const dir = scratch();
		const path = join(dir, "secret");
		writeFileSync(path, "x");
		chmodSync(path, 0o644);
		writeFileAtomicSync(path, "token", { mode: 0o600 });
		expect(mode(path)).toBe(0o600);
		await writeFileAtomic(join(dir, "other"), "y", { mode: 0o640 });
		expect(mode(join(dir, "other"))).toBe(0o640);
	});

	test("writes through symlinks instead of replacing them", async () => {
		if (!posix) return;
		const dir = scratch();
		const real = join(dir, "real.toml");
		const link = join(dir, "link.toml");
		writeFileSync(real, "a");
		symlinkSync(real, link);
		writeFileAtomicSync(link, "b");
		expect(lstatSync(link).isSymbolicLink()).toBe(true);
		expect(readlinkSync(link)).toBe(real);
		expect(readFileSync(real, "utf8")).toBe("b");
		await writeFileAtomic(link, "c");
		expect(lstatSync(link).isSymbolicLink()).toBe(true);
		expect(readFileSync(real, "utf8")).toBe("c");
	});

	test("cleans up its temp file when the rename fails", async () => {
		const dir = scratch();
		const target = join(dir, "occupied");
		// A non-empty directory cannot be replaced by a file rename.
		mkdirSync(target);
		writeFileSync(join(target, "keep"), "x");
		expect(() => writeFileAtomicSync(target, "data")).toThrow();
		await expect(writeFileAtomic(target, "data")).rejects.toThrow();
		expect(readdirSync(dir)).toEqual(["occupied"]);
	});
});

describe("writeFileExclusiveSync", () => {
	test("creates once and never overwrites", () => {
		const dir = scratch();
		const path = join(dir, "soul.md");
		expect(writeFileExclusiveSync(path, "first")).toBe(true);
		expect(writeFileExclusiveSync(path, "second")).toBe(false);
		expect(readFileSync(path, "utf8")).toBe("first");
		if (posix) expect(mode(path)).toBe(0o666 & ~process.umask());
	});

	test("does not follow a pre-planted symlink", () => {
		if (!posix) return;
		const dir = scratch();
		const victim = join(dir, "victim");
		writeFileSync(victim, "original");
		const path = join(dir, "planted");
		symlinkSync(victim, path);
		expect(writeFileExclusiveSync(path, "attacker-controlled")).toBe(false);
		expect(readFileSync(victim, "utf8")).toBe("original");
	});

	test("openFileExclusiveSync refuses existing paths and uses 0o600", () => {
		const dir = scratch();
		const path = join(dir, "lock");
		closeSync(openFileExclusiveSync(path));
		if (posix) expect(mode(path)).toBe(0o600);
		expect(() => openFileExclusiveSync(path)).toThrow();
	});
});

describe("append helpers", () => {
	test("append creates owner-only files and appends in order", async () => {
		const dir = scratch();
		const path = join(dir, "log.jsonl");
		appendFileSecureSync(path, "a\n");
		await appendFileSecure(path, "b\n");
		appendFileSecureSync(path, "c\n");
		expect(readFileSync(path, "utf8")).toBe("a\nb\nc\n");
		if (posix) expect(mode(path)).toBe(0o600);
	});

	test("append keeps the permissions of an existing file", () => {
		if (!posix) return;
		const dir = scratch();
		const path = join(dir, "profile");
		writeFileSync(path, "x\n");
		chmodSync(path, 0o644);
		appendFileSecureSync(path, "y\n");
		expect(mode(path)).toBe(0o644);
	});
});

describe("read helpers", () => {
	test("return content and descriptor stats, or null when missing", async () => {
		const dir = scratch();
		const path = join(dir, "data.json");
		expect(readFileWithStatSync(path)).toBeNull();
		expect(await readFileWithStat(path, "utf8")).toBeNull();
		expect(readFileIfExistsSync(path, "utf8")).toBeNull();
		expect(await readFileIfExists(path)).toBeNull();

		writeFileSync(path, "{}");
		const sync = readFileWithStatSync(path, "utf8");
		expect(sync?.content).toBe("{}");
		expect(sync?.stat.size).toBe(2);
		expect(sync?.stat.isFile()).toBe(true);
		const asyncResult = await readFileWithStat(path);
		expect(asyncResult?.content.equals(Buffer.from("{}"))).toBe(true);
		expect(readFileIfExistsSync(path, "utf8")).toBe("{}");
		expect((await readFileIfExists(path, "utf8")) ?? "").toBe("{}");
	});

	test("propagate errors other than ENOENT", () => {
		const dir = scratch();
		expect(() => readFileWithStatSync(dir)).toThrow();
		expect(existsSync(dir)).toBe(true);
	});
});
