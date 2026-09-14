import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("upstream credit", () => {
  test("README credits upstream with links", () => {
    const md = readFileSync("README.md", "utf8");
    expect(md).toContain("https://github.com/Signet-AI/signetai");
    expect(md).toContain("## Built from Signet");
    expect(md).toContain("Apache-2.0");
    expect(md).toContain("Alexi5000/signetai_Orca");
  });
});
