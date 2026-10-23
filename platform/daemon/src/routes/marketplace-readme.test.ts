import { expect, test } from "bun:test";
import { readCapped } from "./marketplace";
const limit = 2 * 1024 * 1024;
for (const length of [undefined, "1"])
	test(`stops an oversized stream with content-length ${length}`, async () => {
		let cancelled = false;
		let pulls = 0;
		const stream = new ReadableStream<Uint8Array>({
			pull(controller) {
				pulls++;
				if (pulls > 40) {
					controller.close();
					return;
				}
				controller.enqueue(new Uint8Array(64 * 1024));
			},
			cancel() {
				cancelled = true;
			},
		});
		const res = new Response(stream, { headers: length ? { "Content-Length": length } : {} });
		await expect(readCapped(res)).rejects.toThrow("too large");
		expect(cancelled).toBe(true);
		expect(pulls).toBeLessThanOrEqual(limit / (64 * 1024) + 2);
	});
test("rejects declared oversize before consuming and cancels the body", async () => {
	let cancelled = false;
	const stream = new ReadableStream<Uint8Array>({
		cancel() {
			cancelled = true;
		},
	});
	await expect(readCapped(new Response(stream, { headers: { "Content-Length": String(limit + 1) } }))).rejects.toThrow(
		"too large",
	);
	expect(cancelled).toBe(true);
});
test("preserves UTF-8 split across chunks and normal replacement decoding", async () => {
	const source = "# 日本語 café 🦉";
	const bytes = new TextEncoder().encode(source);
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
			controller.close();
		},
	});
	expect(await readCapped(new Response(stream))).toBe(source);
	expect(await readCapped(new Response(new Uint8Array([0xff])))).toBe("�");
	expect(await readCapped(new Response(null))).toBe("");
});
test("allows exactly the byte limit and rejects multibyte input exceeding it", async () => {
	expect((await readCapped(new Response("a".repeat(limit)))).length).toBe(limit);
	await expect(readCapped(new Response("é".repeat(limit / 2 + 1)))).rejects.toThrow("too large");
});
