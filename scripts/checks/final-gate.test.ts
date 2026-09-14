import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";

describe("final gate", () => {
  test("lint workflow plus exports exist", () => {
    expect(existsSync(".github/workflows/readme-lint.yml")).toBe(true);
    expect(existsSync("docs/assets/orca-banner-dark.png")).toBe(true);
    expect(existsSync("docs/assets/orca-banner-light.png")).toBe(true);
    expect(existsSync("docs/assets/social-preview.png")).toBe(true);
  });
});
