#!/usr/bin/env bun

import { closeSync, cpSync, fstatSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomicSync } from "../platform/core/src/secure-fs";

export const NPM_PACKAGE_RENAMES: ReadonlyMap<string, string> = new Map([
	["@signet/core", "@signetai/core"],
	["@signet/connector-base", "@signetai/connector-base"],
	["@signet/connector-claude-code", "@signetai/connector-claude-code"],
	["@signet/connector-codex", "@signetai/connector-codex"],
	["@signet/connector-forge", "@signetai/connector-forge"],
	["@signet/connector-gemini", "@signetai/connector-gemini"],
	["@signet/connector-hermes-agent", "@signetai/connector-hermes-agent"],
	["@signet/connector-kimi", "@signetai/connector-kimi"],
	["@signet/connector-oh-my-pi", "@signetai/connector-oh-my-pi"],
	["@signet/connector-openclaw", "@signetai/connector-openclaw"],
	["@signet/connector-opencode", "@signetai/connector-opencode"],
	["@signet/connector-pi", "@signetai/connector-pi"],
	["@signet/codex-plugin", "@signetai/codex-plugin"],
]);

export const PUBLISH_TARGETS = [
	["platform/core", "core"],
	["libs/connector-base", "connector-base"],
	["integrations/claude-code/connector", "connector-claude-code"],
	["integrations/codex/connector", "connector-codex"],
	["integrations/forge/connector", "connector-forge"],
	["integrations/gemini/connector", "connector-gemini"],
	["integrations/hermes-agent/connector", "connector-hermes-agent"],
	["integrations/kimi/connector", "connector-kimi"],
	["integrations/oh-my-pi/connector", "connector-oh-my-pi"],
	["integrations/openclaw/connector", "connector-openclaw"],
	["integrations/opencode/connector", "connector-opencode"],
	["integrations/pi/connector", "connector-pi"],
	["integrations/codex/plugin", "codex-plugin"],
] as const;

const TEXT_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".d.ts", ".json", ".md", ".map"]);

function looksTextFile(file: string): boolean {
	if (file.endsWith(".d.ts.map")) return true;
	const dot = file.lastIndexOf(".");
	return dot !== -1 && TEXT_EXTENSIONS.has(file.slice(dot));
}

export function rewritePackageSpecifiers(text: string): string {
	let next = text;
	for (const [from, to] of NPM_PACKAGE_RENAMES) {
		next = next.split(from).join(to);
	}
	return next.split("@signet/connector-${harness}").join("@signetai/connector-${harness}");
}

export function rewritePackageManifest(raw: string): string {
	const pkg = JSON.parse(raw) as Record<string, unknown>;
	if (typeof pkg.name === "string") {
		pkg.name = NPM_PACKAGE_RENAMES.get(pkg.name) ?? pkg.name;
	}
	const repository = pkg.repository;
	if (repository && typeof repository === "object" && !Array.isArray(repository)) {
		const url = (repository as Record<string, unknown>).url;
		if (typeof url === "string" && url.startsWith("https://")) {
			(repository as Record<string, unknown>).url = `git+${url}`;
		}
	}

	for (const field of ["dependencies", "optionalDependencies", "peerDependencies", "devDependencies"] as const) {
		const deps = pkg[field];
		if (!deps || typeof deps !== "object" || Array.isArray(deps)) continue;
		const rewritten: Record<string, unknown> = {};
		for (const [name, spec] of Object.entries(deps as Record<string, unknown>)) {
			rewritten[NPM_PACKAGE_RENAMES.get(name) ?? name] = spec;
		}
		pkg[field] = rewritten;
	}

	return `${JSON.stringify(pkg, null, 2)}\n`;
}

function rewriteTextFiles(dir: string): void {
	for (const dirent of readdirSync(dir, { withFileTypes: true })) {
		const entry = dirent.name;
		const path = join(dir, entry);
		if (dirent.isDirectory()) {
			rewriteTextFiles(path);
			continue;
		}
		// Inspect and read through one descriptor so the checks apply to the bytes we rewrite.
		const fd = openSync(path, "r");
		let raw: string | null = null;
		let isDirectory = false;
		try {
			const stat = fstatSync(fd);
			isDirectory = stat.isDirectory();
			if (!isDirectory && stat.isFile() && looksTextFile(path) && stat.size <= 5_000_000) {
				raw = readFileSync(fd, "utf8");
			}
		} finally {
			closeSync(fd);
		}
		if (isDirectory) {
			rewriteTextFiles(path);
			continue;
		}
		if (raw === null || raw.includes("\0")) continue;
		const next = entry === "package.json" ? rewritePackageManifest(raw) : rewritePackageSpecifiers(raw);
		if (next !== raw) writeFileAtomicSync(path, next);
	}
}

export function stageNpmPublishPackages(outputDir: string): string[] {
	rmSync(outputDir, { force: true, recursive: true });
	mkdirSync(outputDir, { recursive: true });

	const staged: string[] = [];
	for (const [sourceDir, stageName] of PUBLISH_TARGETS) {
		const targetDir = join(outputDir, stageName);
		cpSync(sourceDir, targetDir, {
			filter: (source) => !source.split(/[\\/]/).includes("node_modules"),
			recursive: true,
		});
		rewriteTextFiles(targetDir);
		staged.push(targetDir);
	}
	return staged;
}

if (import.meta.main) {
	const outputDir = process.argv[2];
	if (!outputDir) {
		throw new Error("Usage: bun scripts/stage-npm-publish.ts <output-dir>");
	}
	for (const dir of stageNpmPublishPackages(outputDir)) {
		console.log(dir);
	}
}
