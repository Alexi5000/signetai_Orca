import { DbWriteQueueFullError } from "./db-accessor";
import { WorkspaceMigrationRetryableError } from "./workspace-writer-barrier";

/**
 * Write-side backpressure the caller can recover from by retrying shortly: the
 * accessor write queue is full, the DB owner refused admission, or a workspace
 * migration is draining writers. Routes map these to 503 + Retry-After instead
 * of a 500 or a silent drop.
 */
export function isRetryableWritePressure(error: unknown): boolean {
	if (error instanceof DbWriteQueueFullError || error instanceof WorkspaceMigrationRetryableError) return true;
	return error instanceof Error && error.name === "DbOwnerAdmissionError";
}

export const WRITE_PRESSURE_RETRY_AFTER_SECONDS = 1;
