import { existsSync } from "node:fs";
import {
	runTranscriptRecoveryScan,
	type TranscriptRecoveryScanOptions,
	type TranscriptRecoveryStore,
} from "./transcript-recovery-worker";

interface ChildInput {
	readonly basePath: string;
	readonly agentId: string;
	readonly options: Omit<TranscriptRecoveryScanOptions, "signal">;
}

function writeLine(stream: NodeJS.WriteStream, line: string): Promise<void> {
	return new Promise((resolve) => stream.write(`${line}\n`, () => resolve()));
}

async function main(): Promise<void> {
	if (process.env.SIGNET_DB_WRITES_BLOCKED === "1") {
		throw new Error("Transcript recovery child refused writable accessor because database writes are blocked");
	}
	const encoded = process.env.SIGNET_TRANSCRIPT_RECOVERY_INPUT;
	if (encoded === undefined) throw new Error("Transcript recovery child input is missing");
	const input = JSON.parse(encoded) as ChildInput;
	let nextId = 0;
	let pending: { id: number; resolve: (value: unknown) => void; reject: (error: Error) => void } | null = null;
	let buffer = "";
	process.stdin.setEncoding("utf8");
	process.stdin.on("data", (chunk: string) => {
		buffer += chunk;
		if (buffer.length > 1_048_576) {
			pending?.reject(new Error("Transcript recovery response exceeds limit"));
			process.stdin.destroy();
			return;
		}
		let newline: number;
		while ((newline = buffer.indexOf("\n")) >= 0) {
			const line = buffer.slice(0, newline);
			buffer = buffer.slice(newline + 1);
			try {
				const response = JSON.parse(line) as { id: number; result?: unknown; error?: string };
				if (!pending || response.id !== pending.id) throw new Error("Unexpected recovery store response");
				if (response.error) pending.reject(new Error(response.error));
				else pending.resolve(response.result);
			} catch (error) {
				pending?.reject(error instanceof Error ? error : new Error(String(error)));
			}
		}
	});
	process.stdin.on("end", () => pending?.reject(new Error("Transcript recovery parent disconnected")));
	async function call<T>(method: keyof TranscriptRecoveryStore, args: readonly unknown[]): Promise<T> {
		if (pending) throw new Error("Concurrent recovery store request");
		const id = ++nextId;
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			return await new Promise<T>((resolve, reject) => {
				pending = { id, resolve: (value) => resolve(value as T), reject };
				timer = setTimeout(() => reject(new Error("Transcript recovery store request timed out")), 30_000);
				const line = JSON.stringify({ type: "store-request", id, method, args });
				if (line.length > 1_048_576) reject(new Error("Transcript recovery request exceeds limit"));
				else void writeLine(process.stdout, line).catch(reject);
			});
		} finally {
			if (timer) clearTimeout(timer);
			pending = null;
		}
	}
	const store: TranscriptRecoveryStore = {
		frontiers: async () => new Map(await call<Array<[string, string | null]>>("frontiers", [])),
		fingerprints: async (...args) => new Map(await call<Array<[string, string]>>("fingerprints", args)),
		save: (...args) => call("save", args),
		clear: (...args) => call("clear", args),
		mark: (...args) => call("mark", args),
		receipt: (...args) => call("receipt", args),
		enqueue: (...args) => call("enqueue", args),
	};
	try {
		const holdFile = process.env.SIGNET_TRANSCRIPT_RECOVERY_TEST_HOLD_FILE;
		while (holdFile !== undefined && existsSync(holdFile)) await new Promise((resolve) => setTimeout(resolve, 5));
		const result = await runTranscriptRecoveryScan(store, input.basePath, input.agentId, input.options);
		await writeLine(process.stdout, JSON.stringify({ type: "result", result }));
	} finally {
		process.stdin.destroy();
	}
}

void main().then(
	() => process.exit(0),
	async (error: unknown) => {
		await writeLine(process.stderr, error instanceof Error ? (error.stack ?? error.message) : String(error));
		process.exit(1);
	},
);
