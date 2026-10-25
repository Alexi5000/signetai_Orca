import { afterEach, describe, expect, it } from "bun:test";
import { discoverLocalContextWindow, resetLocalContextWindowCache } from "./local-context-window";

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

function fakeFetch(handler: Handler): {
	fetch: (url: string, init?: RequestInit) => Promise<Response>;
	urls: string[];
} {
	const urls: string[] = [];
	return {
		urls,
		fetch: async (url, init) => {
			urls.push(`${init?.method ?? "GET"} ${url}`);
			return handler(url, init);
		},
	};
}

afterEach(() => resetLocalContextWindowCache());

describe("discoverLocalContextWindow", () => {
	it("reads vLLM's max_model_len for the configured model", async () => {
		const server = fakeFetch(() =>
			Response.json({
				data: [
					{ id: "other", max_model_len: 4096 },
					{ id: "qwen3.8-27b", max_model_len: 262144 },
				],
			}),
		);
		const window = await discoverLocalContextWindow(
			"openai-compatible",
			"http://127.0.0.1:8000/v1",
			"qwen3.8-27b",
			undefined,
			server.fetch,
		);
		expect(window).toBe(262144);
		expect(server.urls).toEqual(["GET http://127.0.0.1:8000/v1/models"]);
	});

	it("falls back to llama.cpp /props when /models carries no window", async () => {
		const server = fakeFetch((url) =>
			url.endsWith("/props")
				? Response.json({ default_generation_settings: { n_ctx: 131072 } })
				: Response.json({ data: [{ id: "qwen.gguf" }] }),
		);
		const window = await discoverLocalContextWindow(
			"llama-cpp",
			"http://127.0.0.1:8080",
			"qwen.gguf",
			undefined,
			server.fetch,
		);
		expect(window).toBe(131072);
		expect(server.urls).toEqual(["GET http://127.0.0.1:8080/v1/models", "GET http://127.0.0.1:8080/props"]);
	});

	it("reads Ollama's model_info context length", async () => {
		const server = fakeFetch((url) =>
			url.endsWith("/api/show")
				? Response.json({ model_info: { "qwen35.context_length": 262144 } })
				: new Response("no", { status: 404 }),
		);
		expect(
			await discoverLocalContextWindow("ollama", "http://127.0.0.1:11434/v1", "qwen3.8:27b", undefined, server.fetch),
		).toBe(262144);
		expect(server.urls[0]).toBe("POST http://127.0.0.1:11434/api/show");
	});

	it("caches a discovered window and retries an unreachable server only after the backoff", async () => {
		let up = false;
		let clock = 1_000;
		const server = fakeFetch(() => {
			if (!up) throw new Error("connection refused");
			return Response.json({ data: [{ id: "m", max_model_len: 65536 }] });
		});
		const discover = () =>
			discoverLocalContextWindow(
				"openai-compatible",
				"http://127.0.0.1:9/v1",
				"m",
				undefined,
				server.fetch,
				() => clock,
			);

		expect(await discover()).toBeUndefined();
		up = true;
		expect(await discover()).toBeUndefined();
		clock += 61_000;
		expect(await discover()).toBe(65536);
		clock += 10 * 61_000;
		expect(await discover()).toBe(65536);
		expect(server.urls.filter((url) => url.endsWith("/v1/models"))).toHaveLength(2);
	});

	it("does nothing without an endpoint", async () => {
		const server = fakeFetch(() => Response.json({}));
		expect(
			await discoverLocalContextWindow("openai-compatible", undefined, "m", undefined, server.fetch),
		).toBeUndefined();
		expect(server.urls).toEqual([]);
	});
});

describe("isPiCompactionStart", () => {
	it("recognizes Pi's auto-compaction start event only", async () => {
		const { isPiCompactionStart } = await import("./pipeline/dreaming");
		expect(isPiCompactionStart({ type: "compaction_start", reason: "threshold" })).toBe(true);
		expect(isPiCompactionStart({ type: "turn_start" })).toBe(false);
		expect(isPiCompactionStart(null)).toBe(false);
	});
});
