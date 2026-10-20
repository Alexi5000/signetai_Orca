import { expect, test } from "bun:test";
import { summarizeIdentity } from "./identity";

function summary(content: string): string {
	return summarizeIdentity({
		identity: { path: "IDENTITY.md", content, mtime: new Date(0), size: content.length },
	});
}

test("identity summary preserves ordinary first-heading names and metadata", () => {
	expect(summary("intro\n#   Ada  \n# Another")).toBe("Name: Ada  \nFiles: 1 identity files loaded\nSize: 25 bytes");
	expect(summary("#\tAda\r\nBody")).toContain("Name: Ada\n");
});

test("empty headings do not consume the following paragraph", () => {
	expect(summary("#   \nprivate body")).not.toContain("Name:");
	expect(summary("#   \nbody\n# Valid")).toContain("Name: Valid\n");
});

test("malformed multiline headings are scanned without regex backtracking", () => {
	for (const separator of ["\r", "\u2028", "\u2029", "\n"]) {
		const result = summary(`#${" ".repeat(1_000_000)}${separator}body`);
		expect(result).not.toContain("Name:");
	}
});
