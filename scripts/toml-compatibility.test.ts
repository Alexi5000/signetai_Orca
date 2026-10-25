import { expect, test } from "bun:test";
import { dirname } from "node:path";
const pluginRoot = dirname(Bun.resolveSync("@opencode-ai/plugin", import.meta.dir));
const { Effect, FileSystem, Path } = await import(Bun.resolveSync("effect", pluginRoot));
const { Primitive } = await import(Bun.resolveSync("effect/unstable/cli", pluginRoot));

test("OpenCode's Effect TOML consumer parses configuration with the patched parser", async () => {
	const value = await Effect.runPromise(
		Primitive.fileParse({ format: "toml" })
			.parse("/fixture.toml")
			.pipe(
				Effect.provide(
					FileSystem.layerNoop({
						exists: () => Effect.succeed(true),
						stat: () => Effect.succeed({ type: "File" }),
						readFileString: () => Effect.succeed('name = "test"\n[server]\nport = 4050\n'),
					}),
				),
				Effect.provide(Path.layer),
			),
	);
	expect((value as { name: string }).name).toBe("test");
	expect((value as { server: { port: number } }).server.port).toBe(4050);
});
