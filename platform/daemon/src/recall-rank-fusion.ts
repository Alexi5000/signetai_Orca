export const RECIPROCAL_RANK_K = 60;

export function rankPositions(scores: ReadonlyMap<string, number>, minScore: number): Map<string, number> {
	const kept = [...scores.entries()].filter(([, score]) => score > 0 && score >= minScore);
	kept.sort((left, right) => right[1] - left[1]);
	return new Map(kept.map(([id], index) => [id, index + 1]));
}

export function reciprocalRankScore(
	positions: ReadonlyArray<number | undefined>,
	k: number = RECIPROCAL_RANK_K,
): number {
	if (positions.length === 0) return 0;
	let sum = 0;
	for (const position of positions) {
		if (position !== undefined) sum += 1 / (k + position);
	}
	return (sum * (k + 1)) / positions.length;
}
