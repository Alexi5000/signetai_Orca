import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("readme top", () => {
  test("has Orca hero plus trust plus story link", () => {
    const md = readFileSync("README.md", "utf8");
    expect(md).toContain("# SignetAI Orca");
    expect(md).toContain("docs/assets/orca-banner-dark.png");
    expect(md).toContain("## Trust");
    expect(md).toContain("docs/ORCA-HERO-STORY.md");
    expect(md).toContain("Alex Cinovoj");
    expect(md).toContain("https://techtideai.io");
    expect(md).not.toContain("\u2014");
  });
});
