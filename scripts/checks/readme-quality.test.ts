import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

export function checkNoEmDash(text: string): boolean {
  return !text.includes("\u2014");
}

export function checkImagesHaveAlt(markdown: string): string[] {
  const bad: string[] = [];
  const re = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    const alt = m[1].trim();
    if (alt.length < 8 || alt.toLowerCase() === "image" || alt.toLowerCase() === "logo") {
      bad.push(m[0]);
    }
  }
  return bad;
}

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
