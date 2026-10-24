#!/usr/bin/env bun

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readFileWithStatSync } from "../platform/core/src/secure-fs";

interface NativeAsset {
	readonly name: string;
	readonly platform: string;
	readonly sha256: string;
	readonly size: number;
}

interface ComponentEntry {
	readonly url: string;
	readonly sha256: string;
	readonly size: number;
}

type ComponentsMap = {
	readonly connectors?: ComponentEntry;
	readonly daemonJs?: ComponentEntry;
};

const root = join(import.meta.dir, "..");
const nativeDir = join(root, "dist", "native");
const version = process.env.SIGNET_VERSION ?? JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;

if (!existsSync(nativeDir)) {
	throw new Error(`Native artifact directory does not exist: ${nativeDir}`);
}

function platformFromName(name: string): string | null {
	if (
		name === "native-manifest.json" ||
		name.endsWith(".sha256") ||
		name.startsWith("signet-connectors-") ||
		name.startsWith("signet-daemon-js-") ||
		name === "daemon-js-manifest.json"
	) {
		return null;
	}

	const match = name.match(/^signet-(.+?)(?:\.exe)?$/);
	return match?.[1] ?? null;
}

const assets: NativeAsset[] = readdirSync(nativeDir)
	.flatMap((name) => {
		const platform = platformFromName(name);
		if (!platform) return [];
		const path = join(nativeDir, name);
		if (!statSync(path).isFile()) return [];
		// Hash and size come from one descriptor so they describe the same file.
		const file = readFileWithStatSync(path);
		if (!file?.stat.isFile()) return [];
		return [
			{
				name,
				platform,
				sha256: createHash("sha256").update(file.content).digest("hex"),
				size: file.stat.size,
			},
		];
	})
	.sort((a, b) => a.platform.localeCompare(b.platform));

function loadConnectorComponent(): ComponentEntry | null {
	const tarballName = `signet-connectors-${version}.tar.gz`;
	const tarballPath = join(nativeDir, tarballName);
	const file = readFileWithStatSync(tarballPath);
	if (!file?.stat.isFile() || file.stat.size === 0) return null;
	const { stat } = file;
	const sha256 = createHash("sha256").update(file.content).digest("hex");
	return {
		url: `signet-connectors-${version}.tar.gz`,
		sha256,
		size: stat.size,
	};
}

function loadDaemonJsComponent(): ComponentEntry | null {
	const tarballName = `signet-daemon-js-${version}.tar.gz`;
	const tarballPath = join(nativeDir, tarballName);
	const file = readFileWithStatSync(tarballPath);
	if (!file?.stat.isFile() || file.stat.size === 0) return null;
	return {
		url: tarballName,
		sha256: createHash("sha256").update(file.content).digest("hex"),
		size: file.stat.size,
	};
}

const connectors = loadConnectorComponent();
const daemonJs = loadDaemonJsComponent();
if (assets.length === 0 && !connectors && !daemonJs) {
	throw new Error(`No native Signet binaries or runtime components found in ${nativeDir}`);
}

const components: ComponentsMap = {
	...(connectors ? { connectors } : {}),
	...(daemonJs ? { daemonJs } : {}),
};

const manifest = {
	schemaVersion: 1 as const,
	version,
	assets,
	components,
};

const out = join(nativeDir, "native-manifest.json");
writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${out}`);
