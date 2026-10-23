import { describe, expect, it } from "bun:test";
import { RECIPROCAL_RANK_K, fusedRankScores, rankPositions, selectPrimaryCandidates } from "./recall-rank-fusion";

describe("rankPositions", () => {
	it("ranks ids from the highest score, starting at 1", () => {
		const ranks = rankPositions(
			new Map([
				["low", 0.4],
				["high", 0.9],
				["mid", 0.6],
			]),
			0,
		);

		expect([...ranks.entries()]).toEqual([
			["high", 1],
			["mid", 2],
			["low", 3],
		]);
	});

	it("leaves out scores below the minimum and zero scores", () => {
		const ranks = rankPositions(
			new Map([
				["kept", 0.5],
				["weak", 0.2],
				["absent", 0],
			]),
			0.3,
		);

		expect([...ranks.keys()]).toEqual(["kept"]);
	});
});

describe("fusedRankScores", () => {
	const ranks = (...ids: string[]) => new Map(ids.map((id, index) => [id, index + 1]));

	it("scores the best fused row 1, like the best keyword row before fusion", () => {
		const scores = fusedRankScores([ranks("a", "b"), ranks("c", "a")]);

		expect(scores.get("a")).toBe(1);
		expect(Math.max(...scores.values())).toBe(1);
	});

	it("scores the top of a single list 1 when no row is in both lists", () => {
		const scores = fusedRankScores([ranks("keyword-top"), ranks("vector-top")]);

		expect(scores.get("keyword-top")).toBe(1);
		expect(scores.get("vector-top")).toBe(1);
	});

	it("keeps reciprocal rank order: both lists above one list, then by position", () => {
		const scores = fusedRankScores([ranks("both", "lexical-only"), ranks("semantic-only", "both")]);
		const order = [...scores].sort((left, right) => right[1] - left[1]).map(([id]) => id);

		expect(order[0]).toBe("both");
		expect(scores.get("lexical-only")).toBeCloseTo(
			1 / (RECIPROCAL_RANK_K + 2) / (1 / (RECIPROCAL_RANK_K + 1) + 1 / (RECIPROCAL_RANK_K + 2)),
			10,
		);
		expect(scores.get("semantic-only")).toBeGreaterThan(scores.get("lexical-only") ?? 1);
	});

	it("keeps the best direct row above the hint-only cap", () => {
		const scores = fusedRankScores([ranks("weak-keyword"), ranks()]);

		expect(scores.get("weak-keyword")).toBeGreaterThan(0.75);
	});

	it("returns no scores when every list is empty", () => {
		expect(fusedRankScores([ranks(), ranks()]).size).toBe(0);
		expect(fusedRankScores([]).size).toBe(0);
	});
});

describe("selectPrimaryCandidates", () => {
	const rows = (...ids: string[]) => ids.map((id) => ({ id }));
	const ids = (selected: ReadonlyArray<{ id: string }>) => selected.map((row) => row.id);

	it("keeps the highest rows up to the budget", () => {
		const fused = rows("a", "b", "c", "d");

		expect(ids(selectPrimaryCandidates(fused, 2, new Set(["a", "b", "c", "d"]), 0, new Set()))).toEqual(["a", "b"]);
	});

	it("keeps room for the minimum number of flat rows", () => {
		const fused = rows("t1", "t2", "t3", "f1", "f2");
		const flat = new Set(["f1", "f2"]);

		expect(ids(selectPrimaryCandidates(fused, 3, flat, 2, new Set()))).toEqual(["t1", "f1", "f2"]);
	});

	it("keeps reserved rows even when they rank below the budget", () => {
		const fused = rows("t1", "t2", "t3", "t4", "v1");
		const flat = new Set(["v1"]);

		expect(ids(selectPrimaryCandidates(fused, 3, flat, 0, new Set(["v1"])))).toEqual(["v1", "t1", "t2"]);
	});

	it("counts reserved flat rows toward the flat minimum", () => {
		const fused = rows("t1", "t2", "t3", "v1", "f1");
		const flat = new Set(["v1", "f1"]);

		expect(ids(selectPrimaryCandidates(fused, 3, flat, 1, new Set(["v1"])))).toEqual(["v1", "t1", "t2"]);
	});

	it("never returns more rows than the budget", () => {
		const fused = rows("v1", "v2", "v3");

		expect(selectPrimaryCandidates(fused, 2, new Set(), 0, new Set(["v1", "v2", "v3"]))).toHaveLength(2);
	});
});
