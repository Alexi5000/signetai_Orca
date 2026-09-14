import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

describe("hero story", () => {
  test("file exists with required sections and no em dash", () => {
    const p = "docs/ORCA-HERO-STORY.md";
    expect(existsSync(p)).toBe(true);
    const md = readFileSync(p, "utf8");
    for (const h of ["## The client problem", "## Why Alex picked Signet", "## What Orca changed", "## Result for the client", "## Credit"]) {
      expect(md).toContain(h);
    }
    expect(md).not.toContain("\u2014");
    expect(md).toContain("https://github.com/Signet-AI/signetai");
    expect(md).toContain("Alex Cinovoj");
    expect(md).toContain("TechTide AI");
  });
});
