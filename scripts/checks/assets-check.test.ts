import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const files = [
  "docs/assets/orca-banner-light.svg",
  "docs/assets/orca-banner-dark.svg",
  "docs/assets/pixel-orca.svg",
  "docs/assets/logo.svg",
  "docs/assets/social-preview.svg",
  "docs/assets/favicon.svg",
  "docs/assets/README.md",
  "docs/assets/showcase/README.md",
];

describe("orca assets", () => {
  test("all masters exist and SVGs have title", () => {
    for (const f of files) {
      expect(existsSync(f)).toBe(true);
    }
    for (const f of files.filter((x) => x.endsWith(".svg"))) {
      const s = readFileSync(f, "utf8");
      expect(s).toContain("<svg");
      expect(s).toContain("<title>");
    }
  });
});
