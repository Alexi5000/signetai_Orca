import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkImagesHaveAlt, checkNoEmDash } from "./readme-quality.ts";

describe("readme quality helpers", () => {
  test("flags em dash", () => {
    expect(checkNoEmDash("clean - hyphen ok")).toBe(true);
    expect(checkNoEmDash("bad \u2014 dash")).toBe(false);
  });
  test("flags weak alt text", () => {
    const md = '![image](./a.png)\n![CLI init creates project in 8 seconds](./b.png)';
    expect(checkImagesHaveAlt(md)).toEqual(["![image](./a.png)"]);
  });
  test("current README has no em dash", () => {
    const md = readFileSync("README.md", "utf8");
    expect(checkNoEmDash(md)).toBe(true);
  });
});
