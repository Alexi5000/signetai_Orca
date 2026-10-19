import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { chunkMarkdownHierarchically } from "../import";

describe("hierarchical Markdown import headings", () => {
	test("preserves heading levels, whitespace and section content", () => {
		for (const header of ["# Title", "##  Two", "###\tThree", "#  "]) {
			const chunks = chunkMarkdownHierarchically(`${header}\nFirst body.\n\nSecond body.`);
			expect(chunks).toHaveLength(1);
			expect(chunks[0]?.header).toBe(header);
			expect(chunks[0]?.text).toContain("First body.\n\nSecond body.");
		}
	});

	test("keeps malformed and unsupported headings in source content", () => {
		for (const header of ["#### Four", "#No space", "# ", "# A\rX"]) {
			const chunks = chunkMarkdownHierarchically(`${header}\nBody.`);
			expect(chunks[0]?.header).toBe("");
			expect(chunks[0]?.text).toBe(`${header}\nBody.`);
		}
	});

	test("bounds malformed heading processing in the actual import parser", async () => {
		const modulePath = fileURLToPath(new URL("../import.ts", import.meta.url));
		const child = Bun.spawn(
			[
				process.execPath,
				"-e",
				`
			import { chunkMarkdownHierarchically } from ${JSON.stringify(modulePath)};
			for (const separator of ["\\r", "\\u2028", "\\u2029"]) {
				const input = "#" + " ".repeat(100000) + "A" + separator + "X\\nBody.";
				const result = chunkMarkdownHierarchically(input);
				if (result[0]?.header !== "" || !result[0]?.text.includes("Body.")) process.exit(1);
			}
			console.log("bounded");
		`,
			],
			{ stdout: "pipe", stderr: "pipe" },
		);
		const timer = setTimeout(() => child.kill("SIGKILL"), 2000);
		try {
			expect(await child.exited).toBe(0);
			expect((await new Response(child.stdout).text()).trim()).toBe("bounded");
		} finally {
			clearTimeout(timer);
			child.kill();
			await child.exited;
		}
	});
});
