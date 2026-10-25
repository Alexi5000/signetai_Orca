import { spawnHidden as spawn, type ChildProcess } from "@signet/core";
import { createHash } from "node:crypto";
import { open, readdir, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DbAccessor, WriteDb } from "./db-accessor";
import { logger } from "./logger";
import { getDbOwnerForAccessor } from "./db-owner-runtime";
import { deriveSessionEndFallbackId } from "./session-end-recovery";
import { enqueueTranscriptCaptureJob, type TranscriptCaptureJobInput } from "./transcript-capture-worker";

export const TRANSCRIPT_RECOVERY_INTERVAL_MS = 5 * 60_000;
export const TRANSCRIPT_RECOVERY_SETTLE_MS = 60_000;
export const TRANSCRIPT_RECOVERY_MAX_BYTES = 50 * 1024 * 1024;
export const TRANSCRIPT_RECOVERY_MAX_FILES_PER_SCAN = 50;
export const TRANSCRIPT_RECOVERY_MAX_DISCOVERED_FILES = 50_000;
export const TRANSCRIPT_RECOVERY_MAX_RETRY_DELAY_MS = 30 * 60_000;
export const TRANSCRIPT_RECOVERY_STOP_GRACE_MS = 5_000;
const CLAUDE_CODE_SUBAGENT_DIRECTORY = "subagents";

interface RecoveryCandidate {
	readonly harness: "claude-code" | "codex";
	readonly rootPath: string;
	readonly path: string;
	readonly size: number;
	readonly mtimeMs: number;
}

interface TranscriptMetadata {
	readonly sessionKey: string;
	readonly project: string | null;
	readonly capturedAt: string;
}

export interface TranscriptRecoveryStore {
	frontiers(): Promise<Map<string, string | null>>;
	fingerprints(candidates: readonly RecoveryCandidate[]): Promise<Map<string, string>>;
	save(candidate: RecoveryCandidate, cursor: string | null): Promise<void>;
	clear(roots: TranscriptRecoveryRoots): Promise<void>;
	mark(candidate: RecoveryCandidate, fingerprint: string, sessionId: string, scannedAt: string): Promise<void>;
	receipt(path: string): Promise<{ source_size_bytes: number | null; source_mtime_ms: number | null } | undefined>;
	enqueue(input: TranscriptCaptureJobInput): Promise<string | null>;
}

export type TranscriptRecoveryStoreRequest = {
	[K in keyof TranscriptRecoveryStore]: {
		readonly type: "store-request";
		readonly id: number;
		readonly method: K;
		readonly args: Parameters<TranscriptRecoveryStore[K]>;
	};
}[keyof TranscriptRecoveryStore];

export interface TranscriptRecoveryRoots {
	readonly claudeCode: string;
	readonly codex: string;
}

export interface TranscriptRecoveryScanOptions {
	readonly roots?: Partial<TranscriptRecoveryRoots>;
	readonly nowMs?: number;
	readonly settleMs?: number;
	readonly maxBytes?: number;
	readonly maxFiles?: number;
	readonly maxDiscoveredFiles?: number;
	readonly signal?: AbortSignal;
}

export interface TranscriptRecoveryScanResult {
	readonly discovered: number;
	readonly examined: number;
	readonly enqueued: number;
	readonly deduplicated: number;
	readonly skippedRecent: number;
	readonly skippedOversized: number;
	readonly skippedUnchanged: number;
	readonly skippedInvalid: number;
}

export function parseTranscriptRecoveryResult(output: string): TranscriptRecoveryScanResult | null {
	for (const line of output.split("\n")) {
		try {
			const event = JSON.parse(line) as { type?: string; result?: TranscriptRecoveryScanResult };
			if (event.type === "result" && event.result !== null && typeof event.result === "object") {
				const counts = [
					"discovered",
					"examined",
					"enqueued",
					"deduplicated",
					"skippedRecent",
					"skippedOversized",
					"skippedUnchanged",
					"skippedInvalid",
				] as const;
				if (counts.every((key) => Number.isSafeInteger(event.result?.[key]) && (event.result?.[key] ?? -1) >= 0))
					return event.result;
			}
		} catch {}
	}
	return null;
}

function parseTranscriptRecoveryChildPid(output: string): number | null {
	for (const line of output.split("\n")) {
		try {
			const event = JSON.parse(line) as { type?: string; pid?: unknown };
			if (event.type === "started" && typeof event.pid === "number" && Number.isInteger(event.pid)) return event.pid;
		} catch {}
	}
	return null;
}

export interface TranscriptRecoveryWorkerHandle {
	stop(): Promise<void>;
	nudge(): void;
	readonly running: boolean;
	readonly childPid: number | null;
}

type TranscriptRecoveryWorkerOptions = TranscriptRecoveryScanOptions & {
	readonly intervalMs?: number;
	readonly execution?: "child" | "in-process";
	readonly childPath?: string;
	readonly supervisorPath?: string;
};

function defaultRoots(): TranscriptRecoveryRoots {
	const home = homedir();
	return {
		claudeCode: join(home, ".claude", "projects"),
		codex: join(home, ".codex", "sessions"),
	};
}

async function discoverFiles(
	root: string,
	harness: RecoveryCandidate["harness"],
	maxFiles: number,
	output: RecoveryCandidate[],
	signal?: AbortSignal,
): Promise<boolean> {
	const pending = [root];
	while (pending.length > 0) {
		if (signal?.aborted) return false;
		if (output.length >= maxFiles) return false;
		const directory = pending.pop();
		if (!directory) break;
		let entries: Array<{
			readonly name: string;
			isDirectory(): boolean;
			isFile(): boolean;
		}>;
		try {
			entries = await readdir(directory, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			if (signal?.aborted) return false;
			if (output.length >= maxFiles) return false;
			const path = join(directory, entry.name);
			if (entry.isDirectory()) {
				if (harness === "claude-code" && entry.name === CLAUDE_CODE_SUBAGENT_DIRECTORY) continue;
				pending.push(path);
				continue;
			}
			if (!entry.name.endsWith(".jsonl")) continue;
			if (harness === "codex" && !entry.name.startsWith("rollout-")) continue;
			try {
				const resolvedPath = await realpath(path);
				const metadata = await stat(resolvedPath);
				if (!metadata.isFile()) continue;
				output.push({ harness, rootPath: root, path: resolvedPath, size: metadata.size, mtimeMs: metadata.mtimeMs });
			} catch {}
		}
	}
	return !signal?.aborted;
}

function record(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function nonEmptyString(...values: unknown[]): string | null {
	for (const value of values) {
		if (typeof value === "string" && value.trim().length > 0) return value.trim();
	}
	return null;
}

function readMetadata(candidate: RecoveryCandidate, raw: string): TranscriptMetadata | null {
	for (const line of raw.split(/\r?\n/, 100)) {
		if (!line.trim()) continue;
		let parsed: Record<string, unknown> | null = null;
		try {
			parsed = record(JSON.parse(line));
		} catch {
			continue;
		}
		if (!parsed) continue;
		const payload = record(parsed.payload);
		const sessionKey =
			candidate.harness === "codex"
				? nonEmptyString(payload?.session_id, payload?.id, parsed.session_id, parsed.sessionId)
				: nonEmptyString(parsed.sessionId, parsed.session_id, payload?.session_id, payload?.id);
		if (!sessionKey) continue;
		if (candidate.harness === "claude-code" && parsed.isSidechain === true) return null;
		const project = nonEmptyString(payload?.cwd, parsed.cwd);
		return { sessionKey, project, capturedAt: new Date(candidate.mtimeMs).toISOString() };
	}

	const fallback = basename(candidate.path, ".jsonl").match(
		candidate.harness === "codex" ? /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i : /^(.+)$/,
	)?.[1];
	if (!fallback) return null;
	return {
		sessionKey: fallback,
		project: null,
		capturedAt: new Date(candidate.mtimeMs).toISOString(),
	};
}

const RECOVERY_METADATA_MAX_BYTES = 256 * 1024;

async function readMetadataFromSource(
	candidate: RecoveryCandidate,
	signal?: AbortSignal,
): Promise<TranscriptMetadata | null> {
	throwIfAborted(signal);
	if (candidate.size <= 0) return null;
	const handle = await open(candidate.path, "r");
	try {
		const buffer = Buffer.alloc(Math.min(candidate.size, RECOVERY_METADATA_MAX_BYTES));
		const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
		throwIfAborted(signal);
		return readMetadata(candidate, buffer.subarray(0, bytesRead).toString("utf8"));
	} finally {
		await handle.close().catch(() => undefined);
	}
}
function sourceMetadataFingerprint(candidate: RecoveryCandidate): string {
	return createHash("sha256")
		.update(String(candidate.size))
		.update("\0")
		.update(String(Math.trunc(candidate.mtimeMs)))
		.digest("hex");
}

function markScanned(
	db: WriteDb,
	agentId: string,
	candidate: RecoveryCandidate,
	contentSha256: string,
	sessionId: string,
	scannedAt: string,
): void {
	db.prepare(
		`INSERT INTO transcript_recovery_files (
			agent_id, source_path, harness, size_bytes, mtime_ms, content_sha256, session_id, last_scanned_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(agent_id, source_path) DO UPDATE SET
			harness = excluded.harness,
			size_bytes = excluded.size_bytes,
			mtime_ms = excluded.mtime_ms,
			content_sha256 = excluded.content_sha256,
			session_id = excluded.session_id,
			last_scanned_at = excluded.last_scanned_at`,
	).run(
		agentId,
		candidate.path,
		candidate.harness,
		candidate.size,
		Math.trunc(candidate.mtimeMs),
		contentSha256,
		sessionId,
		scannedAt,
	);
}

function frontierKey(candidate: RecoveryCandidate): string {
	return `${candidate.harness}\\0${candidate.rootPath}`;
}

async function loadFrontiers(
	dbAccessor: DbAccessor,
	agentId: string,
	signal?: AbortSignal,
): Promise<Map<string, string | null>> {
	return dbAccessor.withReadDbAsync(
		(db) => {
			const rows = db
				.prepare("SELECT harness, root_path, cursor_path FROM transcript_recovery_frontiers WHERE agent_id = ?")
				.all(agentId) as Array<{ harness: string; root_path: string; cursor_path?: string | null }>;
			return new Map(rows.map((row) => [`${row.harness}\\0${row.root_path}`, row.cursor_path ?? null]));
		},
		{
			siteToken: "db:transcript-recovery.scan.load-frontiers",
			operation: "transcript-recovery.load-frontiers",
			signal,
		},
	);
}

async function loadRecoveryFingerprints(
	dbAccessor: DbAccessor,
	agentId: string,
	candidates: readonly RecoveryCandidate[],
	signal?: AbortSignal,
): Promise<Map<string, string>> {
	if (candidates.length === 0) return new Map();
	return dbAccessor.withReadDbAsync(
		(db) => {
			const placeholders = candidates.map(() => "?").join(", ");
			const rows = db
				.prepare(
					`SELECT source_path, content_sha256
					 FROM transcript_recovery_files
					 WHERE agent_id = ? AND source_path IN (${placeholders})`,
				)
				.all(agentId, ...candidates.map((candidate) => candidate.path)) as Array<{
				source_path: string;
				content_sha256: string;
			}>;
			return new Map(rows.map((row) => [row.source_path, row.content_sha256]));
		},
		{
			siteToken: "db:transcript-recovery.scan.load-fingerprints",
			operation: "transcript-recovery.load-fingerprints",
			signal,
		},
	);
}

async function saveFrontier(
	dbAccessor: DbAccessor,
	agentId: string,
	candidate: RecoveryCandidate,
	cursorPath: string | null,
	signal?: AbortSignal,
): Promise<void> {
	await dbAccessor.withWriteTxAsync(
		(db) => {
			db.prepare(
				`INSERT INTO transcript_recovery_frontiers (agent_id, harness, root_path, cursor_path, updated_at)
				 VALUES (?, ?, ?, ?, ?)
				 ON CONFLICT(agent_id, harness, root_path) DO UPDATE SET
					cursor_path = excluded.cursor_path,
					updated_at = excluded.updated_at`,
			).run(agentId, candidate.harness, candidate.rootPath, cursorPath, new Date().toISOString());
		},
		{ siteToken: "db:transcript-recovery.scan.save-frontier", operation: "transcript-recovery.save-frontier", signal },
	);
}

async function clearFrontiers(
	dbAccessor: DbAccessor,
	agentId: string,
	roots: TranscriptRecoveryRoots,
	signal?: AbortSignal,
): Promise<void> {
	await dbAccessor.withWriteTxAsync(
		(db) => {
			db.prepare("DELETE FROM transcript_recovery_frontiers WHERE agent_id = ? AND root_path IN (?, ?)").run(
				agentId,
				roots.claudeCode,
				roots.codex,
			);
		},
		{
			siteToken: "db:transcript-recovery.scan.clear-frontiers",
			operation: "transcript-recovery.clear-frontiers",
			signal,
		},
	);
}

function throwIfAborted(signal: AbortSignal | undefined): void {
	if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error("Transcript recovery aborted");
}

function createRecoveryStore(
	dbAccessor: DbAccessor,
	basePath: string,
	agentId: string,
	signal?: AbortSignal,
): TranscriptRecoveryStore {
	return {
		frontiers: () => loadFrontiers(dbAccessor, agentId, signal),
		fingerprints: (candidates) => loadRecoveryFingerprints(dbAccessor, agentId, candidates, signal),
		save: (candidate, cursor) => saveFrontier(dbAccessor, agentId, candidate, cursor, signal),
		clear: (roots) => clearFrontiers(dbAccessor, agentId, roots, signal),
		mark: (candidate, fingerprint, sessionId, scannedAt) =>
			dbAccessor.withWriteTxAsync((db) => markScanned(db, agentId, candidate, fingerprint, sessionId, scannedAt), {
				siteToken: "db:transcript-recovery.scan.mark-invalid",
				operation: "transcript-recovery.mark-scanned",
				signal,
			}),
		receipt: (path) =>
			dbAccessor.withReadDbAsync(
				(db) =>
					db
						.prepare(
							"SELECT source_size_bytes, source_mtime_ms FROM transcript_capture_jobs WHERE agent_id = ? AND transcript_path = ? ORDER BY updated_at DESC, created_at DESC, id DESC LIMIT 1",
						)
						.get(agentId, path) as { source_size_bytes: number | null; source_mtime_ms: number | null } | undefined,
				{
					siteToken: "db:transcript-recovery.scan.capture-receipt",
					operation: "transcript-recovery.lookup-capture-receipt",
					signal,
				},
			),
		enqueue: (input) => enqueueTranscriptCaptureJob(dbAccessor, { ...input, agentId, basePath }, signal),
	};
}

async function dispatchRecoveryStore(
	store: TranscriptRecoveryStore,
	request: TranscriptRecoveryStoreRequest,
): Promise<unknown> {
	switch (request.method) {
		case "frontiers":
			return Array.from(await store.frontiers());
		case "fingerprints":
			return Array.from(await store.fingerprints(...request.args));
		case "save":
			return store.save(...request.args);
		case "clear":
			return store.clear(...request.args);
		case "mark":
			return store.mark(...request.args);
		case "receipt":
			return store.receipt(...request.args);
		case "enqueue":
			return store.enqueue(...request.args);
		default:
			throw new Error("Unsupported transcript recovery store operation");
	}
}

export async function executeTranscriptRecoveryStore(
	dbAccessor: DbAccessor,
	basePath: string,
	agentId: string,
	request: TranscriptRecoveryStoreRequest,
): Promise<unknown> {
	return dispatchRecoveryStore(createRecoveryStore(dbAccessor, basePath, agentId), request);
}

export async function runTranscriptRecoveryScan(
	database: DbAccessor | TranscriptRecoveryStore,
	basePath: string,
	agentId: string,
	options: TranscriptRecoveryScanOptions = {},
): Promise<TranscriptRecoveryScanResult> {
	const store = "frontiers" in database ? database : createRecoveryStore(database, basePath, agentId, options.signal);
	const roots = { ...defaultRoots(), ...options.roots };
	const nowMs = options.nowMs ?? Date.now();
	const settleMs = options.settleMs ?? TRANSCRIPT_RECOVERY_SETTLE_MS;
	const maxBytes = options.maxBytes ?? TRANSCRIPT_RECOVERY_MAX_BYTES;
	const maxFiles = options.maxFiles ?? TRANSCRIPT_RECOVERY_MAX_FILES_PER_SCAN;
	const maxDiscoveredFiles = options.maxDiscoveredFiles ?? TRANSCRIPT_RECOVERY_MAX_DISCOVERED_FILES;
	const discoveredCandidates: RecoveryCandidate[] = [];
	const claudeDiscoveryLimit = Math.max(1, Math.floor(maxDiscoveredFiles / 2));
	const claudeDiscoveryComplete = await discoverFiles(
		roots.claudeCode,
		"claude-code",
		claudeDiscoveryLimit,
		discoveredCandidates,
		options.signal,
	);
	const codexDiscoveryComplete = await discoverFiles(
		roots.codex,
		"codex",
		maxDiscoveredFiles,
		discoveredCandidates,
		options.signal,
	);
	const discoveryComplete = claudeDiscoveryComplete && codexDiscoveryComplete;
	const candidates = Array.from(
		new Map(discoveredCandidates.map((candidate) => [`${candidate.harness}\0${candidate.path}`, candidate])).values(),
	);
	candidates.sort((a, b) => a.path.localeCompare(b.path));
	const frontiers = await store.frontiers();
	const recoveryFingerprints = new Map<string, string>();
	for (let offset = 0; offset < candidates.length; offset += 100) {
		for (const [path, fingerprint] of await store.fingerprints(candidates.slice(offset, offset + 100))) {
			recoveryFingerprints.set(path, fingerprint);
		}
	}
	const resumableCandidates = candidates.filter((candidate) => {
		const cursor = frontiers.get(frontierKey(candidate));
		if (cursor === undefined || cursor === null || candidate.path > cursor) return true;
		return recoveryFingerprints.get(candidate.path) !== sourceMetadataFingerprint(candidate);
	});
	const skippedUnchanged = candidates.length - resumableCandidates.length;

	let examined = 0;
	let enqueued = 0;
	let deduplicated = 0;
	let skippedRecent = 0;
	let skippedOversized = 0;
	let skippedInvalid = 0;

	for (const candidate of resumableCandidates) {
		throwIfAborted(options.signal);
		if (nowMs - candidate.mtimeMs < settleMs) {
			skippedRecent++;
			await store.save(candidate, candidate.path);
			continue;
		}
		if (candidate.size > maxBytes) {
			skippedOversized++;
			await store.save(candidate, candidate.path);
			continue;
		}
		if (examined >= maxFiles) break;
		examined++;

		let metadata: TranscriptMetadata | null;
		try {
			metadata = await readMetadataFromSource(candidate, options.signal);
		} catch (error) {
			throwIfAborted(options.signal);
			logger.debug("transcripts", "Transcript recovery metadata read failed", {
				path: candidate.path,
				error: error instanceof Error ? error.message : String(error),
			});
			skippedInvalid++;
			await store.save(candidate, candidate.path);
			continue;
		}
		const sourceFingerprint = sourceMetadataFingerprint(candidate);
		if (!metadata) {
			const skippedSessionId = `recovery-skip:${createHash("sha256")
				.update(candidate.path)
				.update("\0")
				.update(sourceFingerprint)
				.digest("hex")
				.slice(0, 24)}`;
			await store.mark(candidate, sourceFingerprint, skippedSessionId, new Date(nowMs).toISOString());
			skippedInvalid++;
			await store.save(candidate, candidate.path);
			continue;
		}

		const sessionId = deriveSessionEndFallbackId(metadata.sessionKey, candidate.path, "");
		const existingCapture = await store.receipt(candidate.path);
		const jobId = await store.enqueue({
			agentId,
			harness: candidate.harness,
			sessionKey: metadata.sessionKey,
			sessionId,
			project: metadata.project,
			transcript: "",
			transcriptPath: candidate.path,
			basePath,
			capturedAt: metadata.capturedAt,
			endedAt: metadata.capturedAt,
		});
		if (!jobId) {
			skippedInvalid++;
			await store.save(candidate, candidate.path);
			continue;
		}
		await store.mark(candidate, sourceFingerprint, sessionId, new Date(nowMs).toISOString());
		await store.save(candidate, candidate.path);
		if (
			existingCapture &&
			existingCapture.source_size_bytes === candidate.size &&
			existingCapture.source_mtime_ms === Math.trunc(candidate.mtimeMs)
		) {
			deduplicated++;
		} else enqueued++;
	}
	if (!options.signal?.aborted && discoveryComplete && resumableCandidates.length === 0) {
		await store.clear(roots);
	}

	return {
		discovered: candidates.length,
		examined,
		enqueued,
		deduplicated,
		skippedRecent,
		skippedOversized,
		skippedUnchanged,
		skippedInvalid,
	};
}

export function startTranscriptRecoveryWorker(
	dbAccessor: DbAccessor,
	basePath: string,
	agentId: string,
	options: TranscriptRecoveryWorkerOptions = {},
): TranscriptRecoveryWorkerHandle {
	let stopped = false;
	let running = false;
	let completed = false;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let activeScan: Promise<void> | null = null;
	let activeChild: ChildProcess | null = null;
	let activeTargetPid: number | null = null;
	const cancellation = new AbortController();
	const execution = options.execution ?? "child";
	let retryDelayMs = options.intervalMs ?? TRANSCRIPT_RECOVERY_INTERVAL_MS;

	const scheduleRetry = (): void => {
		if (stopped || completed || timer) return;
		timer = setTimeout(() => {
			timer = null;
			void scan();
		}, retryDelayMs);
		retryDelayMs = Math.min(retryDelayMs * 2, TRANSCRIPT_RECOVERY_MAX_RETRY_DELAY_MS);
	};

	const signalActiveProcesses = (signal: NodeJS.Signals): void => {
		if (activeTargetPid !== null) {
			try {
				if (process.platform !== "win32") process.kill(-activeTargetPid, signal);
			} catch {}
			try {
				process.kill(activeTargetPid, signal);
			} catch {}
		}
		if (activeChild !== null) {
			try {
				activeChild.kill(signal);
			} catch {}
		}
	};

	const runChild = async (): Promise<TranscriptRecoveryScanResult> => {
		const childName = fileURLToPath(import.meta.url).endsWith(".ts")
			? "transcript-recovery-child.ts"
			: "transcript-recovery-child.js";
		const supervisorName = fileURLToPath(import.meta.url).endsWith(".ts")
			? "transcript-recovery-supervisor.ts"
			: "transcript-recovery-supervisor.js";
		const childPath = options.childPath ?? join(dirname(fileURLToPath(import.meta.url)), childName);
		const supervisorPath = options.supervisorPath ?? join(dirname(fileURLToPath(import.meta.url)), supervisorName);
		const {
			intervalMs: _intervalMs,
			signal: _signal,
			execution: _execution,
			childPath: _childPath,
			supervisorPath: _supervisorPath,
			...scanOptions
		} = options;
		const child = spawn(process.execPath, [supervisorPath], {
			env: {
				...process.env,
				SIGNET_TRANSCRIPT_RECOVERY_CHILD_PATH: childPath,
				SIGNET_TRANSCRIPT_RECOVERY_INPUT: JSON.stringify({ basePath, agentId, options: scanOptions }),
			},
			stdio: ["pipe", "pipe", "pipe"],
		});
		activeChild = child;

		return await new Promise<TranscriptRecoveryScanResult>((resolve, reject) => {
			let output = "";
			let lineBuffer = "";
			let pendingStore: Promise<void> | null = null;
			let errorOutput = "";
			let settled = false;
			const settle = (callback: () => void): void => {
				if (settled) return;
				settled = true;
				callback();
			};
			child.stdout?.setEncoding("utf8");
			child.stdout?.on("data", (chunk: string) => {
				lineBuffer += chunk;
				if (lineBuffer.length > 1_048_576) {
					signalActiveProcesses("SIGKILL");
					settle(() => reject(new Error("Transcript recovery output exceeds limit")));
					return;
				}
				let newline: number;
				while ((newline = lineBuffer.indexOf("\n")) >= 0) {
					const line = lineBuffer.slice(0, newline);
					lineBuffer = lineBuffer.slice(newline + 1);
					let event: { type?: string };
					try {
						event = JSON.parse(line) as { type?: string };
					} catch {
						continue;
					}
					if (event.type !== "store-request") {
						output = `${output}${line}\n`.slice(-65_536);
						activeTargetPid = parseTranscriptRecoveryChildPid(output) ?? activeTargetPid;
						continue;
					}
					if (pendingStore || cancellation.signal.aborted) {
						signalActiveProcesses("SIGKILL");
						settle(() => reject(new Error("Concurrent or cancelled recovery store request")));
						return;
					}
					const request = event as TranscriptRecoveryStoreRequest;
					pendingStore = (async () => {
						let response: string;
						try {
							const owner = await getDbOwnerForAccessor(dbAccessor);
							throwIfAborted(cancellation.signal);
							const handle = owner.submit(
								{ kind: "transcript_recovery_store", basePath, agentId, request },
								{
									operation: `transcript-recovery.${request.method}`,
									lane: "write",
									deadlineMs: 30_000,
								},
							);
							const cancel = () => handle.cancel();
							cancellation.signal.addEventListener("abort", cancel, { once: true });
							let result: unknown;
							try {
								result = await handle.result;
							} finally {
								cancellation.signal.removeEventListener("abort", cancel);
							}
							response = JSON.stringify({ id: request.id, result });
							if (response.length > 1_048_576) throw new Error("Transcript recovery response exceeds limit");
						} catch (error) {
							response = JSON.stringify({
								id: request.id,
								error: error instanceof Error ? error.message : String(error),
							});
						}
						pendingStore = null;
						if (!child.stdin?.destroyed) child.stdin?.write(`${response}\n`);
					})();
				}
			});
			child.stdin?.on("error", () => {});
			child.stderr?.setEncoding("utf8");
			child.stderr?.on("data", (chunk: string) => {
				errorOutput = `${errorOutput}${chunk}`.slice(-2_000);
			});
			child.on("error", (error) => settle(() => reject(error)));
			child.on("close", async (code, signal) => {
				await pendingStore;
				const result = parseTranscriptRecoveryResult(output);
				if (code === 0 && signal === null) {
					if (result === null)
						settle(() => reject(new Error("Transcript recovery child omitted its completion receipt")));
					else settle(() => resolve(result));
					return;
				}
				const detail = signal === null ? `exit code ${code ?? "unknown"}` : `signal ${signal}`;
				const cause = errorOutput.trim().split("\n")[0]?.trim();
				settle(() => reject(new Error(`Transcript recovery child exited with ${detail}${cause ? `: ${cause}` : ""}`)));
			});
		});
	};

	const scan = async (): Promise<void> => {
		if (stopped || running) return;
		running = true;
		activeScan = (async () => {
			try {
				const result =
					execution === "in-process"
						? await runTranscriptRecoveryScan(dbAccessor, basePath, agentId, {
								...options,
								signal: cancellation.signal,
							})
						: await runChild();
				if (result.enqueued > 0 || result.deduplicated > 0) {
					logger.info("transcripts", "Transcript recovery scan complete", { ...result });
				}
				completed = true;
			} catch (error) {
				if (cancellation.signal.aborted || stopped) return;
				logger.warn("transcripts", "Transcript recovery scan failed", {
					error: error instanceof Error ? error.message : String(error),
				});
			}
		})();
		try {
			await activeScan;
		} finally {
			activeScan = null;
			activeChild = null;
			activeTargetPid = null;
			running = false;
			if (!completed) scheduleRetry();
		}
	};

	queueMicrotask(() => void scan());
	return {
		async stop(): Promise<void> {
			stopped = true;
			cancellation.abort();
			if (timer) clearTimeout(timer);
			timer = null;
			const scanToStop = activeScan;
			if (scanToStop === null) return;
			activeChild?.stdin?.end();
			signalActiveProcesses("SIGTERM");
			let graceTimer: ReturnType<typeof setTimeout> | undefined;
			const stoppedGracefully = await Promise.race([
				scanToStop.then(
					() => true,
					() => true,
				),
				new Promise<boolean>((resolve) => {
					graceTimer = setTimeout(() => resolve(false), TRANSCRIPT_RECOVERY_STOP_GRACE_MS);
				}),
			]);
			if (graceTimer !== undefined) clearTimeout(graceTimer);
			if (!stoppedGracefully) {
				signalActiveProcesses("SIGKILL");
				await scanToStop;
			}
		},
		nudge(): void {
			completed = false;
			retryDelayMs = options.intervalMs ?? TRANSCRIPT_RECOVERY_INTERVAL_MS;
			if (timer) clearTimeout(timer);
			timer = null;
			queueMicrotask(() => void scan());
		},
		get running(): boolean {
			return !stopped;
		},
		get childPid(): number | null {
			return activeTargetPid ?? activeChild?.pid ?? null;
		},
	};
}
