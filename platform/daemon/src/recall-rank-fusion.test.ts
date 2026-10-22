import { describe, expect, it } from "bun:test";
import { RECIPROCAL_RANK_K, rankPositions, reciprocalRankScore } from "./recall-rank-fusion";

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

describe("reciprocalRankScore", () => {
	it("scores 1 when an id is first in every list", () => {
		expect(reciprocalRankScore([1, 1])).toBe(1);
	});

	it("scores the same for rank 1 in either list, whatever the raw scores were", () => {
		expect(reciprocalRankScore([1, undefined])).toBe(reciprocalRankScore([undefined, 1]));
		expect(reciprocalRankScore([1, undefined])).toBeCloseTo(0.5, 10);
	});

	it("ranks an id found in both lists above one found in a single list", () => {
		expect(reciprocalRankScore([5, 5])).toBeGreaterThan(reciprocalRankScore([1, undefined]));
	});

	it("drops as the position grows", () => {
		const first = reciprocalRankScore([1, undefined]);
		const tenth = reciprocalRankScore([10, undefined]);

		expect(tenth).toBeLessThan(first);
		expect(tenth).toBeCloseTo((RECIPROCAL_RANK_K + 1) / (2 * (RECIPROCAL_RANK_K + 10)), 10);
	});

	it("scores 0 when the id is in no list", () => {
		expect(reciprocalRankScore([undefined, undefined])).toBe(0);
		expect(reciprocalRankScore([])).toBe(0);
	});
});
