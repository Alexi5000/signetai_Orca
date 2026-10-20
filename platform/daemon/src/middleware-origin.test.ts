import { expect, test } from "bun:test";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { registerGlobalMiddleware } from "./middleware";

test("HTTP origin enforcement rejects browser requests before route side effects", async () => {
	const app = new Hono();
	registerGlobalMiddleware(app);
	let writes = 0;
	app.all("/api/origin-proof", async (c) => {
		if (c.req.method !== "GET") {
			await c.req.json();
			writes++;
		}
		return c.json({ writes });
	});
	const listening = Promise.withResolvers<number>();
	const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 0 }, (info) => listening.resolve(info.port));
	try {
		const url = `http://127.0.0.1:${await listening.promise}/api/origin-proof`;
		for (const origin of [
			"https://untrusted.example",
			"http://localhost:3850.untrusted.example",
			"http://localhost:3850@untrusted.example",
			"null",
			"",
		]) {
			for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
				const response = await fetch(url, {
					method,
					headers: { Origin: origin, "Content-Type": "text/plain" },
					...(method === "GET" || method === "OPTIONS" ? {} : { body: '{"inert":true}' }),
				});
				expect(response.status).toBe(403);
				expect(await response.json()).toEqual({ error: "origin not allowed" });
				expect(writes).toBe(0);
			}
		}
		for (const origin of ["http://localhost:3850", "http://127.0.0.1:3850", undefined]) {
			const response = await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...(origin === undefined ? {} : { Origin: origin }),
				},
				body: '{"inert":true}',
			});
			expect(response.status).toBe(200);
			await response.json();
		}
		expect(writes).toBe(3);
		const preflight = await fetch(url, {
			method: "OPTIONS",
			headers: { Origin: "http://localhost:3850", "Access-Control-Request-Method": "POST" },
		});
		expect(preflight.status).toBe(204);
		expect(preflight.headers.get("access-control-allow-origin")).toBe("http://localhost:3850");
		expect(writes).toBe(3);
	} finally {
		const closing = new Promise<void>((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		);
		server.closeAllConnections();
		await closing;
	}
}, 30_000);
