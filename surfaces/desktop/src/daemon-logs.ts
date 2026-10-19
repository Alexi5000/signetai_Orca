import {
	closeSync,
	constants,
	fchmodSync,
	fstatSync,
	lstatSync,
	mkdirSync,
	openSync,
	realpathSync,
	type Stats,
} from "node:fs";
import { dirname, join } from "node:path";

function assertTrustedAncestors(workspace: string): void {
	if (process.platform === "win32") return;
	const ancestors: string[] = [];
	for (let path = dirname(workspace); ; path = dirname(path)) {
		ancestors.push(path);
		if (dirname(path) === path) break;
	}
	for (const path of ancestors.reverse()) {
		const stat = lstatSync(path);
		const trustedOwner = stat.uid === 0 || stat.uid === process.getuid?.();
		const protectedStickyDirectory = stat.uid === 0 && (stat.mode & 0o1000) !== 0;
		if (
			!stat.isDirectory() ||
			stat.isSymbolicLink() ||
			!trustedOwner ||
			((stat.mode & 0o022) !== 0 && !protectedStickyDirectory)
		) {
			throw new Error("Daemon workspace ancestors must not allow replacement by other users");
		}
	}
}

function assertOwned(stat: Stats): void {
	if (process.platform !== "win32" && stat.uid !== process.getuid?.())
		throw new Error("Daemon log path is not owned by the current user");
}

function privateDirectory(path: string): void {
	try {
		mkdirSync(path, { mode: 0o700 });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
	}
	const before = lstatSync(path);
	if (!before.isDirectory() || before.isSymbolicLink()) throw new Error("Daemon log directory must not be a symlink");
	assertOwned(before);
	if (process.platform === "win32") return;
	const fd = openSync(path, constants.O_RDONLY | (constants.O_DIRECTORY ?? 0) | (constants.O_NOFOLLOW ?? 0));
	try {
		const opened = fstatSync(fd);
		if (!opened.isDirectory() || opened.dev !== before.dev || opened.ino !== before.ino)
			throw new Error("Daemon log directory changed while opening");
		assertOwned(opened);
		fchmodSync(fd, 0o700);
	} finally {
		closeSync(fd);
	}
}

function openLog(path: string): number {
	let before: Stats | undefined;
	try {
		before = lstatSync(path);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
	if (before && (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1))
		throw new Error("Daemon log must be a single-link regular file");
	if (before) assertOwned(before);
	const flags =
		constants.O_WRONLY |
		constants.O_APPEND |
		(constants.O_NOFOLLOW ?? 0) |
		(constants.O_NONBLOCK ?? 0) |
		(before ? 0 : constants.O_CREAT | constants.O_EXCL);
	const fd = openSync(path, flags, 0o600);
	try {
		const opened = fstatSync(fd);
		if (!opened.isFile() || opened.nlink !== 1 || (before && (opened.dev !== before.dev || opened.ino !== before.ino)))
			throw new Error("Daemon log changed while opening");
		assertOwned(opened);
		if (process.platform !== "win32") fchmodSync(fd, 0o600);
		return fd;
	} catch (error) {
		closeSync(fd);
		throw error;
	}
}

export function openDaemonLogs(workspacePath: string): { stdout: number; stderr: number } {
	const workspace = realpathSync(workspacePath);
	assertTrustedAncestors(workspace);
	const root = lstatSync(workspace);
	assertOwned(root);
	if (!root.isDirectory() || (process.platform !== "win32" && (root.mode & 0o022) !== 0))
		throw new Error("Daemon workspace must not be writable by other users");
	const daemonDir = join(workspace, ".daemon");
	privateDirectory(daemonDir);
	const logDir = join(daemonDir, "logs");
	privateDirectory(logDir);
	const stdout = openLog(join(logDir, "daemon.out.log"));
	try {
		return { stdout, stderr: openLog(join(logDir, "daemon.err.log")) };
	} catch (error) {
		closeSync(stdout);
		throw error;
	}
}
