import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

describe("readme inventory baseline", () => {
  test("README exists and has at least 150 lines", () => {
    const p = "README.md";
    expect(existsSync(p)).toBe(true);
    const lines = readFileSync(p, "utf8").split("\n").length;
    expect(lines).toBeGreaterThanOrEqual(150);
  });
  test("upstream art untouched baseline", () => {
    expect(existsSync("public/banner-typography.png")).toBe(true);
    expect(existsSync("public/sources.png")).toBe(true);
  });
});
