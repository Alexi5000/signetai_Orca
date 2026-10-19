import { describe, expect, it } from "bun:test";
import { buildTranscriptFromEntries } from "./transcript.js";

describe("Pi transcript builder", () => {
	it("recognizes role aliases and skips unknown roles", () => {
		const transcript = buildTranscriptFromEntries([
			{ type: "message", message: { role: "human", content: "hello" } },
			{ type: "message", message: { role: "agent", content: [{ input_text: "hi" }] } },
			{ type: "message", message: { role: "mystery", content: "do not mislabel" } },
			{ type: "message", message: { role: "toolResult", content: "tool output" } },
		]);

		expect(transcript).toBe("User: hello\nAssistant: hi\nTool: tool output");
	});
});

describe("transcript whitespace bounds", () => {
	it("preserves in-line spacing and collapses multiline whitespace", () => {
		expect(buildTranscriptFromEntries([{ type: "message", message: { role: "user", content: "a  b\r\n \n c" } }])).toBe(
			"User: a  b c",
		);
	});
	it("handles long whitespace with no newline without backtracking", () => {
		const started = performance.now();
		expect(
			buildTranscriptFromEntries([{ type: "message", message: { role: "user", content: `a${" ".repeat(100_000)}b` } }]),
		).toContain("User: a");
		expect(performance.now() - started).toBeLessThan(1000);
	});
});
