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
	const directory = lstatSync(path);
	if (!directory.isDirectory() || directory.isSymbolicLink())
		throw new Error("Daemon log directory must not be a symlink");
	assertOwned(directory);
	if (process.platform !== "win32" && (directory.mode & 0o022) !== 0)
		throw new Error("Daemon log directory must not be writable by other users");
}

function openLog(path: string): number {
	const flags = constants.O_WRONLY | constants.O_APPEND | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);
	let fd: number;
	try {
		fd = openSync(path, flags | constants.O_CREAT | constants.O_EXCL, 0o600);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
		fd = openSync(path, flags, 0o600);
	}
	try {
		const opened = fstatSync(fd);
		const named = lstatSync(path);
		if (
			!opened.isFile() ||
			opened.nlink !== 1 ||
			named.isSymbolicLink() ||
			opened.dev !== named.dev ||
			opened.ino !== named.ino
		)
			throw new Error("Daemon log must be a single-link regular file");
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
