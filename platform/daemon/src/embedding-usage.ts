import type { DbAccessor } from "./db-accessor";
import { getDbOwnerMaintenance, ownerTransaction } from "./db-owner-maintenance";
import { type EmbeddingCostRates, resolveEmbeddingAccounting } from "./embedding-cost";
import { logger } from "./logger";
import { getActiveTelemetry } from "./telemetry";
export type EmbeddingUsageSource = "memory-capture" | "artifact-index" | "recall" | "dreaming" | "other";

export interface EmbeddingUsageAttribution {
	readonly source?: EmbeddingUsageSource;
	readonly agentId?: string;
	readonly sessionHash?: string;
}

interface EmbeddingUsageRow {
	readonly day: string;
	readonly agent_id: string;
	readonly source_kind: string;
	readonly provider: string;
	readonly requests: number;
	readonly tokens: number;
}
function todayKey(now: Date = new Date()): string {
	return now.toISOString().slice(0, 10);
}

const UPSERT_SQL = `
	INSERT INTO embedding_usage (day, agent_id, source_kind, provider, requests, tokens)
	VALUES (?, ?, ?, ?, 1, ?)
	ON CONFLICT(day, agent_id, source_kind, provider)
	DO UPDATE SET requests = requests + 1, tokens = tokens + excluded.tokens
`;
export function recordEmbeddingUsage(input: {
	readonly provider: string;
	readonly tokens: number;
	readonly source: EmbeddingUsageSource;
	readonly agentId?: string;
	readonly sessionHash?: string;
	readonly baseUrl?: string;
	readonly costRates?: EmbeddingCostRates;
	readonly now?: Date;
}): void {
	const accounting = resolveEmbeddingAccounting(input.provider, input.tokens, {
		baseUrl: input.baseUrl,
		rates: input.costRates,
	});
	getActiveTelemetry()?.record("pipeline.embedding", {
		tokens: input.tokens,
		provider: input.provider,
		sourceKind: input.source,
		...(input.sessionHash ? { sessionHash: input.sessionHash } : {}),
		cost: accounting.cost,
		accountingProvenance: accounting.accountingProvenance,
	});
	const maintenance = getDbOwnerMaintenance();
	if (!maintenance) return;
	try {
		void ownerTransaction(
			maintenance.owner,
			"embedding.usage.record",
			[
				{
					sql: UPSERT_SQL,
					params: [todayKey(input.now), input.agentId ?? "", input.source, input.provider, input.tokens],
					result: "run",
				},
			],
			{ deadlineMs: 1000 },
		).catch((e) => {
			logger.warn("embedding", "Failed to record embedding usage", {
				error: e instanceof Error ? e.message : String(e),
			});
		});
	} catch (e) {
		logger.warn("embedding", "Failed to record embedding usage", {
			error: e instanceof Error ? e.message : String(e),
		});
	}
}

export interface EmbeddingUsageSummary {
	readonly total: { readonly requests: number; readonly tokens: number };
	readonly today: { readonly requests: number; readonly tokens: number };
	readonly bySource: ReadonlyArray<{ readonly source: string; readonly requests: number; readonly tokens: number }>;
	readonly byProvider: ReadonlyArray<{ readonly provider: string; readonly requests: number; readonly tokens: number }>;
}

let cachedEmbeddingUsageSummary: EmbeddingUsageSummary | null = null;
export async function readEmbeddingUsageSummary(
	_accessor: DbAccessor,
	now: Date = new Date(),
): Promise<EmbeddingUsageSummary | null> {
	try {
		const owner = getDbOwnerMaintenance();
		if (!owner) throw new Error("Database owner unavailable for embedding usage");
		const queries = [
			{
				sql: "SELECT COALESCE(SUM(requests), 0) AS requests, COALESCE(SUM(tokens), 0) AS tokens FROM embedding_usage",
				params: [],
				result: "get" as const,
			},
			{
				sql: "SELECT COALESCE(SUM(requests), 0) AS requests, COALESCE(SUM(tokens), 0) AS tokens FROM embedding_usage WHERE day = ?",
				params: [todayKey(now)],
				result: "get" as const,
			},
			{
				sql: "SELECT source_kind AS source, SUM(requests) AS requests, SUM(tokens) AS tokens FROM embedding_usage GROUP BY source_kind ORDER BY tokens DESC",
				params: [],
				result: "all" as const,
			},
			{
				sql: "SELECT provider, SUM(requests) AS requests, SUM(tokens) AS tokens FROM embedding_usage GROUP BY provider ORDER BY tokens DESC",
				params: [],
				result: "all" as const,
			},
		];
		const [total, today, bySource, byProvider] = await Promise.all(
			queries.map(
				(statement) =>
					owner.owner.submit(
						{
							kind: "query",
							statement: { ...statement, readonly: true },
						},
						{ operation: "embedding.usage.summary", lane: "read", deadlineMs: 200 },
					).result,
			),
		);
		const summary = { total, today, bySource, byProvider } as EmbeddingUsageSummary;
		cachedEmbeddingUsageSummary = summary;
		return summary;
	} catch (e) {
		logger.warn("embedding", "Failed to read embedding usage summary", {
			error: e instanceof Error ? e.message : String(e),
		});
		return null;
	}
}
export function getCachedEmbeddingUsageSummary(): EmbeddingUsageSummary | null {
	return cachedEmbeddingUsageSummary;
}

export type { EmbeddingUsageRow };
