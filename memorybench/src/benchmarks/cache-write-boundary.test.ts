import { afterEach, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, relative } from "node:path"
import { LoCoMoBenchmark } from "./locomo"
import { ConvoMemBenchmark } from "./convomem"
const dirs: string[] = []
const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})
for (const kind of ["locomo", "convomem"]) {
  test(`${kind} downloads a regular cache at a configured external directory`, async () => {
    const root = mkdtempSync(join(tmpdir(), "benchmark-cache-"))
    dirs.push(root)
    const cache = join(root, kind === "locomo" ? "locomo.json" : "convomem_data.json")
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify(
          kind === "locomo"
            ? []
            : [
                {
                  evidenceItems: [
                    { question: "q", answer: "a", message_evidences: [], conversations: [] },
                  ],
                },
              ]
        )
      )) as unknown as typeof fetch
    const benchmark = kind === "locomo" ? new LoCoMoBenchmark() : new ConvoMemBenchmark()
    await benchmark.load({ dataPath: relative(process.cwd(), kind === "locomo" ? cache : root) })
    expect(Array.isArray(JSON.parse(readFileSync(cache, "utf8")))).toBe(true)
  })

  test(`${kind} refuses a dangling cache link`, async () => {
    const root = mkdtempSync(join(tmpdir(), "benchmark-cache-"))
    dirs.push(root)
    const cache = join(root, kind === "locomo" ? "locomo.json" : "convomem_data.json")
    const victim = join(root, "missing")
    symlinkSync(victim, cache)
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify(
          kind === "locomo"
            ? []
            : [
                {
                  evidenceItems: [
                    { question: "q", answer: "a", message_evidences: [], conversations: [] },
                  ],
                },
              ]
        )
      )) as unknown as typeof fetch
    const benchmark = kind === "locomo" ? new LoCoMoBenchmark() : new ConvoMemBenchmark()
    await expect(
      benchmark.load({ dataPath: relative(process.cwd(), kind === "locomo" ? cache : root) })
    ).rejects.toThrow()
    expect(existsSync(victim)).toBe(false)
  })
  test(`${kind} refuses a cache link swapped in during download`, async () => {
    const root = mkdtempSync(join(tmpdir(), "benchmark-cache-"))
    dirs.push(root)
    const cache = join(root, kind === "locomo" ? "locomo.json" : "convomem_data.json")
    const victim = join(root, "victim")
    writeFileSync(victim, "unchanged")
    globalThis.fetch = (async () => {
      if (!existsSync(cache)) symlinkSync(victim, cache)
      return new Response(
        JSON.stringify(
          kind === "locomo"
            ? []
            : [
                {
                  evidenceItems: [
                    { question: "q", answer: "a", message_evidences: [], conversations: [] },
                  ],
                },
              ]
        )
      )
    }) as unknown as typeof fetch
    const benchmark = kind === "locomo" ? new LoCoMoBenchmark() : new ConvoMemBenchmark()
    await expect(
      benchmark.load({ dataPath: relative(process.cwd(), kind === "locomo" ? cache : root) })
    ).rejects.toThrow()
    expect(readFileSync(victim, "utf8")).toBe("unchanged")
  })
}
