import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// GitHub's dependency graph does not parse bun.lock, so Dependabot never
// reports vulnerable versions locked for the MemoryBench UI. This test keeps
// the lockfile from regressing below the first releases that fix the known
// critical/high advisories (osv-scanner, 2026-10-26).

const lockPath = join(import.meta.dir, "..", "ui", "bun.lock")

type Floor = { major: number; min: string }

// Per-major floors. A locked version whose major has no floor fails the test,
// so a new major line has to be reviewed before it is accepted.
const floors: Record<string, Floor[]> = {
	next: [{ major: 15, min: "15.5.28" }],
	"drizzle-orm": [{ major: 0, min: "0.45.2" }],
	nanoid: [{ major: 3, min: "3.3.18" }],
	postcss: [{ major: 8, min: "8.5.23" }],
	sharp: [{ major: 0, min: "0.35.5" }],
	picomatch: [
		{ major: 2, min: "2.3.2" },
		{ major: 4, min: "4.0.4" },
	],
	browserslist: [{ major: 4, min: "4.28.7" }],
	"source-map-js": [{ major: 1, min: "1.2.2" }],
}

function parse(version: string): number[] {
	return version
		.split("-")[0]
		.split(".")
		.map((part) => Number.parseInt(part, 10))
}

function atLeast(version: string, min: string): boolean {
	const a = parse(version)
	const b = parse(min)
	for (let i = 0; i < 3; i++) {
		if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0)
	}
	return true
}

function lockedVersions(lock: string, name: string): string[] {
	const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
	const pattern = new RegExp(`\\["${escaped}@([0-9][^"]*)"`, "g")
	return [...new Set([...lock.matchAll(pattern)].map((m) => m[1]))]
}

describe("memorybench/ui bun.lock security floors", () => {
	const lock = readFileSync(lockPath, "utf8")

	for (const [name, pkgFloors] of Object.entries(floors)) {
		test(`${name} is locked at a patched version`, () => {
			const versions = lockedVersions(lock, name)
			expect(versions.length).toBeGreaterThan(0)
			for (const version of versions) {
				const floor = pkgFloors.find((f) => f.major === parse(version)[0])
				expect(floor, `${name}@${version} has no reviewed floor`).toBeDefined()
				expect(atLeast(version, floor?.min ?? "0"), `${name}@${version} < ${floor?.min}`).toBe(true)
			}
		})
	}
})
