/**
 * Secure filesystem primitives shared by the daemon, CLI, connectors, and tests.
 *
 * - Temporary directories are created with `mkdtemp` (unpredictable name,
 *   exclusive creation) and restricted to the owner (0o700).
 * - Temporary files are created exclusively (`wx` / O_EXCL) with mode 0o600,
 *   so another local user cannot pre-create, read, or swap them.
 * - Durable writes go through a private sibling temp file and an atomic
 *   rename. The final file keeps its previous permissions (or the process
 *   default for new files) so callers' visible behavior is unchanged, and
 *   readers never observe a partially written file.
 * - Reads that need metadata open the file first and `fstat` the descriptor,
 *   instead of `stat`-then-`open` on a path that can change in between.
 */

import { randomBytes } from "node:crypto";
import {
	type Stats,
	chmodSync,
	closeSync,
	constants,
	fchmodSync,
	fstatSync,
	fsyncSync,
	lstatSync,
	mkdirSync,
	linkSync,
	mkdtempSync,
	openSync,
	readFileSync,
	realpathSync,
	renameSync,
	unlinkSync,
	writeSync,
} from "node:fs";
import { chmod, lstat, mkdtemp, open, realpath, rename, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export const PRIVATE_DIR_MODE = 0o700;
export const PRIVATE_FILE_MODE = 0o600;

export type SecureWriteData = string | NodeJS.ArrayBufferView;

export interface AtomicWriteOptions {
	/** Final file mode. Defaults to the existing file's mode, or the process default (0o666 & ~umask) for new files. */
	readonly mode?: number;
	/** Text encoding for string data (default utf8). */
	readonly encoding?: BufferEncoding;
	/** Flush file data to disk before the rename (default false, matching ordinary writes). */
	readonly fsync?: boolean;
	/** Defaults to true for compatibility. False rejects linked and nonregular leaves. */
	readonly followSymlinks?: boolean;
}

export interface FileWithStat<T extends string | Buffer> {
	readonly content: T;
	readonly stat: Stats;
}

function isErrnoCode(error: unknown, code: string): boolean {
	return (
		typeof error === "object" && error !== null && "code" in error && (error as NodeJS.ErrnoException).code === code
	);
}

function toBuffer(data: SecureWriteData, encoding: BufferEncoding = "utf8"): Buffer {
	if (typeof data === "string") return Buffer.from(data, encoding);
	return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
}

function defaultFileMode(): number {
	// process.umask() with no argument is the only portable way to read the mask.
	const mask = typeof process.umask === "function" ? process.umask() : 0o022;
	return 0o666 & ~mask;
}

function tempSiblingPath(target: string): string {
	return join(dirname(target), `.${basename(target)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
}

/** Create a private (0o700) temporary directory with an unpredictable name. */
export function createPrivateTempDir(prefix: string, parent: string = tmpdir()): string {
	const dir = mkdtempSync(join(parent, prefix));
	chmodSync(dir, PRIVATE_DIR_MODE);
	return dir;
}

/** Async variant of {@link createPrivateTempDir}. */
export async function createPrivateTempDirAsync(prefix: string, parent: string = tmpdir()): Promise<string> {
	const dir = await mkdtemp(join(parent, prefix));
	await chmod(dir, PRIVATE_DIR_MODE);
	return dir;
}

/** Resolve the file that a write to `path` should replace, following an existing symlink. */
function resolveWriteTargetSync(path: string, followSymlinks = true): { target: string; existingMode: number | null } {
	let st: Stats;
	try {
		st = lstatSync(path);
	} catch (error) {
		if (isErrnoCode(error, "ENOENT")) return { target: path, existingMode: null };
		throw error;
	}
	if (!followSymlinks && (!st.isFile() || st.nlink !== 1)) {
		throw new Error("Refusing to replace a linked or nonregular file");
	}
	if (st.isSymbolicLink()) {
		let target: string;
		try {
			target = realpathSync(path);
		} catch (error) {
			// Dangling symlink: keep the previous behavior of writing through it.
			if (isErrnoCode(error, "ENOENT")) return { target: path, existingMode: null };
			throw error;
		}
		return resolveWriteTargetSync(target);
	}
	return { target: path, existingMode: st.mode & 0o7777 };
}

async function resolveWriteTarget(
	path: string,
	followSymlinks = true,
): Promise<{ target: string; existingMode: number | null }> {
	let st: Stats;
	try {
		st = await lstat(path);
	} catch (error) {
		if (isErrnoCode(error, "ENOENT")) return { target: path, existingMode: null };
		throw error;
	}
	if (!followSymlinks && (!st.isFile() || st.nlink !== 1)) {
		throw new Error("Refusing to replace a linked or nonregular file");
	}
	if (st.isSymbolicLink()) {
		let target: string;
		try {
			target = await realpath(path);
		} catch (error) {
			if (isErrnoCode(error, "ENOENT")) return { target: path, existingMode: null };
			throw error;
		}
		return resolveWriteTarget(target);
	}
	return { target: path, existingMode: st.mode & 0o7777 };
}

/**
 * Write `path` atomically: data goes to an exclusively created 0o600 sibling
 * temp file, which is then renamed over the destination. Symlinked
 * destinations are preserved by replacing the link target.
 */
export function writeFileAtomicSync(path: string, data: SecureWriteData, options: AtomicWriteOptions = {}): void {
	const { target, existingMode } = resolveWriteTargetSync(path, options.followSymlinks);
	const finalMode = options.mode ?? existingMode ?? defaultFileMode();
	const tmp = tempSiblingPath(target);
	const buffer = toBuffer(data, options.encoding);
	const fd = openSync(tmp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, PRIVATE_FILE_MODE);
	let renamed = false;
	try {
		try {
			let offset = 0;
			while (offset < buffer.length) offset += writeSync(fd, buffer, offset, buffer.length - offset);
			if (options.fsync === true) fsyncSync(fd);
			if (finalMode !== PRIVATE_FILE_MODE) fchmodSync(fd, finalMode);
		} finally {
			closeSync(fd);
		}
		renameSync(tmp, target);
		renamed = true;
	} finally {
		if (!renamed) {
			try {
				unlinkSync(tmp);
			} catch {
				// Best-effort cleanup; preserve the original failure.
			}
		}
	}
}

/** The selected root may be an alias; descendants must be unlinked. Ancestor directory mutation by another process is outside this boundary. */
export function writeFileScopedAtomicSync(
	root: string,
	path: string,
	data: SecureWriteData,
	options: AtomicWriteOptions = {},
): void {
	const lexicalRoot = resolve(root);
	const suffix = relative(lexicalRoot, resolve(lexicalRoot, path));
	if (!suffix || suffix === ".." || suffix.startsWith(`..${sep}`) || isAbsolute(suffix)) {
		throw new Error("Write destination is outside the selected directory");
	}
	mkdirSync(lexicalRoot, { recursive: true });
	const canonicalRoot = realpathSync(lexicalRoot);
	let parent = canonicalRoot;
	for (const segment of suffix.split(sep).slice(0, -1)) {
		parent = join(parent, segment);
		try {
			mkdirSync(parent);
		} catch (error) {
			if (!isErrnoCode(error, "EEXIST")) throw error;
		}
		if (!lstatSync(parent).isDirectory()) throw new Error("Write parent must be an unlinked directory");
	}
	writeFileAtomicSync(join(canonicalRoot, suffix), data, { ...options, followSymlinks: false });
}

/** Async variant of {@link writeFileAtomicSync}. */
export async function writeFileAtomic(
	path: string,
	data: SecureWriteData,
	options: AtomicWriteOptions = {},
): Promise<void> {
	const { target, existingMode } = await resolveWriteTarget(path, options.followSymlinks);
	const finalMode = options.mode ?? existingMode ?? defaultFileMode();
	const tmp = tempSiblingPath(target);
	const buffer = toBuffer(data, options.encoding);
	const handle = await open(tmp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, PRIVATE_FILE_MODE);
	let renamed = false;
	try {
		try {
			await handle.writeFile(buffer);
			if (options.fsync === true) await handle.sync();
			if (finalMode !== PRIVATE_FILE_MODE) await handle.chmod(finalMode);
		} finally {
			await handle.close();
		}
		await rename(tmp, target);
		renamed = true;
	} finally {
		if (!renamed) await unlink(tmp).catch(() => {});
	}
}

/**
 * Publish complete content with a no-replace hard link from an exclusive staging file, replacing
 * `if (!existsSync(path)) writeFileSync(path, ...)`. Returns false when the
 * file already existed.
 */
export function writeFileExclusiveSync(
	path: string,
	data: SecureWriteData,
	options: { readonly mode?: number; readonly encoding?: BufferEncoding; readonly fsync?: boolean } = {},
): boolean {
	const tmp = tempSiblingPath(path);
	const fd = openSync(tmp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, PRIVATE_FILE_MODE);
	try {
		try {
			const buffer = toBuffer(data, options.encoding);
			let offset = 0;
			while (offset < buffer.length) offset += writeSync(fd, buffer, offset, buffer.length - offset);
			fchmodSync(fd, options.mode ?? defaultFileMode());
			if (options.fsync) fsyncSync(fd);
		} finally {
			closeSync(fd);
		}
		try {
			linkSync(tmp, path);
			return true;
		} catch (error) {
			if (isErrnoCode(error, "EEXIST")) return false;
			throw error;
		}
	} finally {
		unlinkSync(tmp);
	}
}

/** Create `path` exclusively (O_EXCL) for writing with `mode` (default 0o600). Returns the descriptor. */
export function openFileExclusiveSync(path: string, mode: number = PRIVATE_FILE_MODE): number {
	return openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, mode);
}

/** Open `path` for appending, creating it with `mode` (default 0o600) when missing. */
export function openAppendSync(path: string, mode: number = PRIVATE_FILE_MODE): number {
	return openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND, mode);
}

/** Append `data` to `path` through a single opened descriptor (created with `mode` when missing). */
export function appendFileSecureSync(path: string, data: SecureWriteData, mode: number = PRIVATE_FILE_MODE): void {
	const fd = openAppendSync(path, mode);
	try {
		const buffer = toBuffer(data);
		let offset = 0;
		while (offset < buffer.length) offset += writeSync(fd, buffer, offset, buffer.length - offset);
	} finally {
		closeSync(fd);
	}
}

/** Async variant of {@link appendFileSecureSync}. */
export async function appendFileSecure(
	path: string,
	data: SecureWriteData,
	mode: number = PRIVATE_FILE_MODE,
): Promise<void> {
	const handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND, mode);
	try {
		await handle.writeFile(toBuffer(data));
	} finally {
		await handle.close();
	}
}

/** Read a file and its metadata through one descriptor. Returns null when the file does not exist. */
export function readFileWithStatSync(path: string): FileWithStat<Buffer> | null;
export function readFileWithStatSync(path: string, encoding: BufferEncoding): FileWithStat<string> | null;
export function readFileWithStatSync(
	path: string,
	encoding?: BufferEncoding,
): FileWithStat<string> | FileWithStat<Buffer> | null {
	let fd: number;
	try {
		fd = openSync(path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
	} catch (error) {
		if (isErrnoCode(error, "ENOENT")) return null;
		throw error;
	}
	try {
		const stat = fstatSync(fd);
		if (!stat.isFile()) throw Object.assign(new Error("Expected a regular file"), { code: "EINVAL" });
		const raw = readFileSync(fd);
		return encoding ? { content: raw.toString(encoding), stat } : { content: raw, stat };
	} finally {
		closeSync(fd);
	}
}

/** Async variant of {@link readFileWithStatSync}. */
export async function readFileWithStat(path: string): Promise<FileWithStat<Buffer> | null>;
export async function readFileWithStat(path: string, encoding: BufferEncoding): Promise<FileWithStat<string> | null>;
export async function readFileWithStat(
	path: string,
	encoding?: BufferEncoding,
): Promise<FileWithStat<string> | FileWithStat<Buffer> | null> {
	let handle: Awaited<ReturnType<typeof open>>;
	try {
		handle = await open(path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
	} catch (error) {
		if (isErrnoCode(error, "ENOENT")) return null;
		throw error;
	}
	try {
		const stat = await handle.stat();
		if (!stat.isFile()) throw Object.assign(new Error("Expected a regular file"), { code: "EINVAL" });
		const raw = await handle.readFile();
		return encoding ? { content: raw.toString(encoding), stat } : { content: raw, stat };
	} finally {
		await handle.close();
	}
}

/** Read a file, returning null when it does not exist (replaces exists/stat-then-read). */
export function readFileIfExistsSync(path: string): Buffer | null;
export function readFileIfExistsSync(path: string, encoding: BufferEncoding): string | null;
export function readFileIfExistsSync(path: string, encoding?: BufferEncoding): string | Buffer | null {
	const result = encoding ? readFileWithStatSync(path, encoding) : readFileWithStatSync(path);
	return result ? result.content : null;
}

/** Async variant of {@link readFileIfExistsSync}. */
export async function readFileIfExists(path: string): Promise<Buffer | null>;
export async function readFileIfExists(path: string, encoding: BufferEncoding): Promise<string | null>;
export async function readFileIfExists(path: string, encoding?: BufferEncoding): Promise<string | Buffer | null> {
	const result = encoding ? await readFileWithStat(path, encoding) : await readFileWithStat(path);
	return result ? result.content : null;
}
