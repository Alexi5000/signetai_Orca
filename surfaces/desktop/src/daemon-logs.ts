import { closeSync } from "node:fs";
import { openPrivateDaemonLog } from "@signet/core";

export function openDaemonLogs(workspacePath: string): { stdout: number; stderr: number } {
	const stdout = openPrivateDaemonLog(workspacePath, "daemon.out.log");
	try {
		return { stdout, stderr: openPrivateDaemonLog(workspacePath, "daemon.err.log") };
	} catch (error) {
		closeSync(stdout);
		throw error;
	}
}
