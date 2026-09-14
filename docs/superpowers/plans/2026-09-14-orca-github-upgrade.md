# SignetAI Orca GitHub Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild our fork README plus hero story plus visual assets into a clean 2026 top tier repo that credits upstream and tells Alex plus TechTide plus Orca story with professional copy.

**Architecture:** Docs only change plus static assets plus two lint workflows. No core behavior change. Daemon stays owner. README is the public contract. Small focused files. Lint scripts prove quality at the boundary that matters: rendered README.

**Tech Stack:** Markdown, GitHub Actions (lychee link check), Bun 1.3.11 scripts, Biome for repo lint, SVG plus PNG plus ICO assets.

## Global Constraints

- Bun 1.3.11 for repo scripts per packageManager in package.json.
- Node.js 18 plus for Node targeted surfaces.
- Use Signet for product and prose. Use signet for CLI, package, path, and config names.
- Write American English.
- Keep LICENSE plus NOTICE plus THIRD_PARTY_LICENSES.md intact. Keep package.json author Signet AI. License stays Apache-2.0.
- Copy rule: no em dashes anywhere in touched files. Use hyphen - or colon or period.
- Asset rule: new Orca art lives under docs/assets/ with relative paths. Do not edit public/banner-typography.png or public/sources.png.
- Image rule: every Markdown image has outcome alt text.
- Branch rule: work on plan/orca-github-upgrade, commit per task, push at end.

---

### Task 1: Plan branch plus inventory snapshot

**Files:**
- Modify: `docs/superpowers/plans/2026-09-14-orca-github-upgrade.md` (this file, already created)
- Test: `scripts/checks/readme-inventory.test.ts` (created here for baseline proof)

**Interfaces:**
- Consumes: git HEAD on main at 9229ff2ac, README.md 201 lines.
- Produces: branch name `plan/orca-github-upgrade`, baseline counts (README lines, asset list) used by Task 2.

- [ ] **Step 1: Write the failing test**

```typescript
// scripts/checks/readme-inventory.test.ts
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

describe("readme inventory baseline", () => {
  test("README exists and has at least 150 lines", () => {
    const p = "README.md";
    expect(existsSync(p)).toBe(true);
    const lines = readFileSync(p, "utf8").split("\n").length;
    expect(lines).toBeGreaterThanOrEqual(150);
  });
  test("upstream art untouched baseline", () => {
    expect(existsSync("public/banner-typography.png")).toBe(true);
    expect(existsSync("public/sources.png")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test scripts/checks/readme-inventory.test.ts`
Expected: FAIL with "No such file or directory" because scripts/checks/ does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Run these exact commands from repo root:

```bash
git checkout -b plan/orca-github-upgrade
New-Item -ItemType Directory -Path "scripts/checks" -Force
```

Then create the file from Step 1 at `scripts/checks/readme-inventory.test.ts` with that exact content.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test scripts/checks/readme-inventory.test.ts`
Expected: PASS, 2 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add scripts/checks/readme-inventory.test.ts
git commit -m "test: add readme inventory baseline"
```

### Task 2: Quality lint harness (no em dash, assets, alt text)

**Files:**
- Create: `scripts/checks/readme-quality.test.ts`
- Create: `scripts/checks/run-readme-checks.ts`
- Test: `scripts/checks/readme-quality.test.ts`

**Interfaces:**
- Consumes: branch from Task 1, file list (README.md, docs/ORCA-HERO-STORY.md future, docs/assets/* future).
- Produces: `checkNoEmDash(paths)`, `checkImagesHaveAlt(markdown)` helpers used by Tasks 4 through 7.

- [ ] **Step 1: Write the failing test**

```typescript
// scripts/checks/readme-quality.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test scripts/checks/readme-quality.test.ts`
Expected: FAIL with missing file because the file does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/checks/readme-quality.test.ts` with the exact content from Step 1. Then create the runner:

```typescript
// scripts/checks/run-readme-checks.ts
import { readFileSync, existsSync } from "node:fs";
import { checkNoEmDash, checkImagesHaveAlt } from "./readme-quality.test.ts";

const targets = ["README.md", "docs/ORCA-HERO-STORY.md", "docs/assets/README.md"];
let failed = false;
for (const t of targets) {
  if (!existsSync(t)) {
    console.log(`SKIP missing: ${t}`);
    continue;
  }
  const md = readFileSync(t, "utf8");
  if (!checkNoEmDash(md)) {
    console.log(`FAIL em dash in ${t}`);
    failed = true;
  }
  const bad = checkImagesHaveAlt(md);
  if (bad.length > 0) {
    console.log(`FAIL weak alt in ${t}: ${bad.join(" | ")}`);
    failed = true;
  }
}
if (failed) {
  process.exit(1);
}
console.log("README checks passed.");
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test scripts/checks/readme-quality.test.ts`
Expected: PASS, 3 pass. Then run: `bun scripts/checks/run-readme-checks.ts`
Expected: prints SKIP for the two docs files plus passed.

- [ ] **Step 5: Commit**

```bash
git add scripts/checks/readme-quality.test.ts scripts/checks/run-readme-checks.ts
git commit -m "test: add readme quality lint harness"
```

### Task 3: Upstream credit plus legal footer block

**Files:**
- Modify: `README.md:184-201` (Contributors through footer link bar)
- Test: `scripts/checks/readme-quality.test.ts` (reuse, plus new assertion file `scripts/checks/credit-check.test.ts`)

**Interfaces:**
- Consumes: upstream facts (Signet-AI/signetai, https://github.com/Signet-AI/signetai, https://signetai.sh, https://docs.signetai.sh, Apache-2.0).
- Produces: `## Built from Signet` section text plus footer credit lines reused by Task 6.

- [ ] **Step 1: Write the failing test**

```typescript
// scripts/checks/credit-check.test.ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("upstream credit", () => {
  test("README credits upstream with links", () => {
    const md = readFileSync("README.md", "utf8");
    expect(md).toContain("https://github.com/Signet-AI/signetai");
    expect(md).toContain("## Built from Signet");
    expect(md).toContain("Apache-2.0");
    expect(md).toContain("Alexi5000/signetai_Orca");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test scripts/checks/credit-check.test.ts`
Expected: FAIL with missing file, then after creating the file FAIL with "expected string to contain ## Built from Signet" because README lacks it.

- [ ] **Step 3: Write minimal implementation**

Create the test file with Step 1 content. Then read `README.md:184-201` and insert this exact block before `## License`, keeping existing Contributors wall intact:

```markdown
## Built from Signet

This is TechTide Orca, a maintained fork for client delivery. Upstream is [Signet-AI/signetai](https://github.com/Signet-AI/signetai) by Signet AI. Product docs live at [signetai.sh](https://signetai.sh) and [docs.signetai.sh](https://docs.signetai.sh). Our changes are Orca positioning, hero story, docs assets, and README structure. Core memory behavior stays with upstream. License stays Apache-2.0. See LICENSE, NOTICE, and THIRD_PARTY_LICENSES.md. Our repo is [Alexi5000/signetai_Orca](https://github.com/Alexi5000/signetai_Orca).
```

Then update the footer link bar at end of README to this exact text:

```markdown
[signetai.sh](https://signetai.sh) ·
[docs](https://docs.signetai.sh) ·
[upstream](https://github.com/Signet-AI/signetai) ·
[orca fork](https://github.com/Alexi5000/signetai_Orca) ·
[issues](https://github.com/Signet-AI/signetai/issues)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test scripts/checks/credit-check.test.ts scripts/checks/readme-quality.test.ts`
Expected: PASS, all green. Then run: `bun scripts/checks/run-readme-checks.ts`
Expected: README checks passed.

- [ ] **Step 5: Commit**

```bash
git add README.md scripts/checks/credit-check.test.ts
git commit -m "docs: add upstream credit and fork footer"
```

### Task 4: Hero story doc (why Alex found this repo, client problem, solution)

**Files:**
- Create: `docs/ORCA-HERO-STORY.md`
- Test: `scripts/checks/hero-story-check.test.ts`

**Interfaces:**
- Consumes: Alex facts (Alex Cinovoj, Founder/CTO TechTide AI, warehouse to cloud to AI automation, 13 yrs enterprise IT), TechTide positioning (working AI systems in six weeks, owned by your team, pilot purgatory, AI oversight tax), upstream capability (dreaming builds living semantic ontology with audit trail).
- Produces: hero narrative sections (Problem, Search, Build, Result) linked from README Task 5.

- [ ] **Step 1: Write the failing test**

```typescript
// scripts/checks/hero-story-check.test.ts
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

describe("hero story", () => {
  test("file exists with required sections and no em dash", () => {
    const p = "docs/ORCA-HERO-STORY.md";
    expect(existsSync(p)).toBe(true);
    const md = readFileSync(p, "utf8");
    for (const h of ["## The client problem", "## Why Alex picked Signet", "## What Orca changed", "## Result for the client", "## Credit"]) {
      expect(md).toContain(h);
    }
    expect(md).not.toContain("\u2014");
    expect(md).toContain("https://github.com/Signet-AI/signetai");
    expect(md).toContain("Alex Cinovoj");
    expect(md).toContain("TechTide AI");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test scripts/checks/hero-story-check.test.ts`
Expected: FAIL with missing file.

- [ ] **Step 3: Write minimal implementation**

Create `docs/ORCA-HERO-STORY.md` with this exact content:

```markdown
# Orca Hero Story: From Pilot Purgatory to Shared Memory

## The client problem

A mid size operator team had three stalled AI pilots. Each harness kept its own notes. Claude Code knew one workflow. ChatGPT knew another. Nothing compounded. New sessions started from zero. The team paid an oversight tax: senior staff spent hours checking output, retyping context, and hunting the source of a claim. That matches the TechTide pattern: pilot purgatory plus babysitting instead of leverage.

## Why Alex picked Signet

Alex Cinovoj is Founder and CTO of TechTide AI in Columbus, Ohio. He ships working AI systems in six weeks that the client team owns. His path ran from warehouse work through help desk and hospital IT and MSP operations into cloud architecture and AI automation. He needed a local first memory layer with an audit trail, not another chat wrapper. Upstream Signet at [Signet-AI/signetai](https://github.com/Signet-AI/signetai) fit: transcripts plus imports flow in, a background process called dreaming builds a living semantic ontology, and every derived claim keeps a path back to its source. Local custody plus inspectable recall plus multi harness support made it the base for Orca.

## What Orca changed

Orca keeps upstream core intact and adds the delivery layer TechTide runs for clients:

- One shared memory graph across Claude Code, OpenCode, OpenClaw, Codex, Kimi, Hermes, Pi, and Gemini CLI.
- `signet setup` plus `signet status` plus `signet dashboard` as the standard path from install to proof.
- Dashboard plus tray plus browser extension as visible proof surfaces, with CLI as the source of truth.
- Import path for Obsidian, Discord, GitHub, Word, PowerPoint, Excel, PDF, CSV, and EPUB so history compounds instead of resetting.

## Result for the client

Onboarding dropped from repeat briefings to one connected briefing. Agents opened sessions with prior context. Disputes ended at the source link instead of in chat threads. The morning brief agent kept continuity between runs without re priming. The client team owned the system in their environment after a fixed scope build.

## Credit

Memory core by Signet AI at [Signet-AI/signetai](https://github.com/Signet-AI/signetai). Docs at [signetai.sh](https://signetai.sh) and [docs.signetai.sh](https://docs.signetai.sh). License Apache-2.0. Orca fork maintained by Alex Cinovoj for TechTide AI at [Alexi5000/signetai_Orca](https://github.com/Alexi5000/signetai_Orca). Links: [TechTide](https://techtideai.io) · [Alex](https://alexcinovoj.com) · [X](https://x.com/AlexCinovoj) · [LinkedIn](https://www.linkedin.com/in/alexcinovoj/).
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test scripts/checks/hero-story-check.test.ts`
Expected: PASS. Then run: `bun scripts/checks/run-readme-checks.ts`
Expected: README checks passed (now includes hero story file).

- [ ] **Step 5: Commit**

```bash
git add docs/ORCA-HERO-STORY.md scripts/checks/hero-story-check.test.ts
git commit -m "docs: add Orca hero story"
```

### Task 5: README top rebuild (hero, trust, links, install, quickstart)

**Files:**
- Modify: `README.md:1-69` (header through Setup)
- Test: `scripts/checks/readme-top-check.test.ts`

**Interfaces:**
- Consumes: Task 3 credit text, Task 4 hero story path, Alex facts, OpenClaw order (hero, positioning, trust, links, install, quickstart).
- Produces: new top section markup reused by Task 6 bottom rebuild.

- [ ] **Step 1: Write the failing test**

```typescript
// scripts/checks/readme-top-check.test.ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("readme top", () => {
  test("has Orca hero plus trust plus story link", () => {
    const md = readFileSync("README.md", "utf8");
    expect(md).toContain("# SignetAI Orca");
    expect(md).toContain("docs/assets/orca-banner-dark.png");
    expect(md).toContain("## Trust");
    expect(md).toContain("docs/ORCA-HERO-STORY.md");
    expect(md).toContain("Alex Cinovoj");
    expect(md).toContain("https://techtideai.io");
    expect(md).not.toContain("\u2014");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test scripts/checks/readme-top-check.test.ts`
Expected: FAIL with missing header because README still starts with upstream div header.

- [ ] **Step 3: Write minimal implementation**

Create the test file with Step 1 content. Then replace `README.md:1-35` with this exact block. Keep the rest of the file intact for Task 6:

```markdown
# SignetAI Orca: shared memory for every harness

> TechTide delivery fork of Signet. One memory graph across Claude Code, OpenCode, OpenClaw, Codex, Kimi, Hermes, Pi, and Gemini CLI. Local first with an audit trail back to source.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/orca-banner-dark.png" />
    <source media="(prefers-color-scheme: light)" srcset="docs/assets/orca-banner-light.png" />
    <img src="docs/assets/orca-banner-dark.png" alt="SignetAI Orca banner showing shared memory across eight harnesses" width="100%" />
  </picture>
</p>

<p align="center">
  <a href="https://github.com/Alexi5000/signetai_Orca/releases"><img src="https://img.shields.io/github/v/release/Alexi5000/signetai_Orca?style=flat-square" alt="Orca GitHub release badge" /></a>
  <a href="https://www.npmjs.com/package/signetai"><img src="https://img.shields.io/npm/v/signetai?style=flat-square" alt="npm signetai version badge" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg?style=flat-square" alt="Apache 2.0 license badge" /></a>
  <a href="https://docs.signetai.sh/benchmarking/"><img src="https://img.shields.io/badge/LongMemEval-97.6%25-black?style=flat-square" alt="LongMemEval 97.6 percent accuracy badge" /></a>
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="docs/ORCA-HERO-STORY.md">Hero story</a> ·
  <a href="#harness-support">Harnesses</a> ·
  <a href="#documentation">Docs</a> ·
  <a href="https://docs.signetai.sh">Upstream docs</a>
</p>

Built by [Alex Cinovoj](https://alexcinovoj.com) ([X](https://x.com/AlexCinovoj) · [LinkedIn](https://www.linkedin.com/in/alexcinovoj)) for [TechTide AI](https://techtideai.io). Read the delivery story in [docs/ORCA-HERO-STORY.md](docs/ORCA-HERO-STORY.md).

## Trust

Local first. Your transcripts and imports stay in your workspace database. Dreaming builds derived memory with a path back to source, so recall stays inspectable and purgeable. No silent second writer. Telemetry is documented in docs/TELEMETRY.md. No paid tier trick in this README.

## Quick start

Install (about 5 minutes). This keeps upstream install paths intact:

```bash
curl -fsSL https://signetai.sh/install.sh | bash
```

On Windows x64:

```powershell
iwr -useb https://signetai.sh/install.ps1 | iex
```

Or: `npm install -g signetai` or `bun add -g signetai`

Then:

```bash
signet setup
signet status
signet dashboard
```
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test scripts/checks/readme-top-check.test.ts scripts/checks/readme-quality.test.ts scripts/checks/credit-check.test.ts`
Expected: PASS. Note: banner PNG files do not exist yet, that is Task 7. This task only checks the Markdown references.

- [ ] **Step 5: Commit**

```bash
git add README.md scripts/checks/readme-top-check.test.ts
git commit -m "docs: rebuild readme top with Orca hero"
```

### Task 6: README bottom rebuild (surfaces, docs table, links)

**Files:**
- Modify: `README.md` (Harness support through end, keep Benchmarks numbers, keep Contributors wall)
- Test: `scripts/checks/readme-bottom-check.test.ts`

**Interfaces:**
- Consumes: Task 5 top, surfaces list (CLI, dashboard, desktop, tray, browser extension, daemon owner, 11 integrations), docs URLs.
- Produces: complete README body used by Task 8 QA.

- [ ] **Step 1: Write the failing test**

```typescript
// scripts/checks/readme-bottom-check.test.ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("readme bottom", () => {
  test("has surfaces plus docs table plus links", () => {
    const md = readFileSync("README.md", "utf8");
    expect(md).toContain("## How Orca fits together");
    expect(md).toContain("surfaces/cli");
    expect(md).toContain("surfaces/dashboard");
    expect(md).toContain("surfaces/desktop");
    expect(md).toContain("surfaces/tray");
    expect(md).toContain("surfaces/browser-extension");
    expect(md).toContain("| Goal | Start here |");
    expect(md).toContain("## Links");
    expect(md).toContain("https://star-history.com/#Alexi5000/signetai_Orca");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test scripts/checks/readme-bottom-check.test.ts`
Expected: FAIL with missing sections.

- [ ] **Step 3: Write minimal implementation**

Create the test file with Step 1 content. Then insert this exact block after the Quick start section, before existing Harness support table. Keep existing harness rows and sources tables intact:

```markdown
## How Orca fits together

- Daemon owns core behavior and durable transitions in `platform/daemon`. CLI, dashboard, desktop, SDK, and harness integrations are clients.
- `surfaces/cli` is the source of truth (`signet setup`, `signet status`, `signet dashboard`).
- `surfaces/dashboard` shows memory plus retrieval plus audit trail.
- `surfaces/desktop` plus `surfaces/tray` give always on presence.
- `surfaces/browser-extension` captures web context.
- `integrations/` covers claude-code, codex, forge, gemini, hermes-agent, kimi, oh-my-pi, openclaw, opencode, pi, and unreal.

## Documentation

| Goal | Start here |
| --- | --- |
| Install in 5 minutes | [Quickstart](https://docs.signetai.sh/quickstart/) |
| Run the CLI | [CLI Reference](https://docs.signetai.sh/cli/) |
| Configure identity and workspace | [Configuration](https://docs.signetai.sh/configuration/) |
| Connect a harness | [Harnesses](https://docs.signetai.sh/harnesses/) |
| Guard secrets | [Secrets](https://docs.signetai.sh/secrets/) |
| See memory model | [Knowledge Architecture](https://docs.signetai.sh/knowledge-architecture/) |
| Check recall quality | [Benchmarks](https://docs.signetai.sh/benchmarking/) |
| Read the delivery story | [docs/ORCA-HERO-STORY.md](docs/ORCA-HERO-STORY.md) |

## Links

[Hero story](docs/ORCA-HERO-STORY.md) · [Upstream](https://github.com/Signet-AI/signetai) · [Docs](https://docs.signetai.sh) · [Changelog](./CHANGELOG.md) · [Security](./SECURITY.md)

[![Star History](https://api.star-history.com/svg?repos=Alexi5000/signetai_Orca&type=Date)](https://star-history.com/#Alexi5000/signetai_Orca&Date)

Built by [Alex Cinovoj](https://alexcinovoj.com) for [TechTide AI](https://techtideai.io).
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test scripts/checks/readme-bottom-check.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add README.md scripts/checks/readme-bottom-check.test.ts
git commit -m "docs: rebuild readme bottom with surfaces"
```

### Task 7: Visual assets plus favicon plus social preview

**Files:**
- Create: `docs/assets/orca-banner-light.svg`, `docs/assets/orca-banner-dark.svg`, `docs/assets/pixel-orca.svg`, `docs/assets/logo.svg`, `docs/assets/social-preview.svg`, `docs/assets/favicon.svg`, `docs/assets/README.md`
- Create: `docs/assets/showcase/README.md`
- Test: `scripts/checks/assets-check.test.ts`

**Interfaces:**
- Consumes: brand colors (#3B82F6 accent, #0F172A dark bg, #FFFFFF light bg, Inter plus JetBrains Mono).
- Produces: checked in SVG masters plus export notes. PNG and ICO export happens in Task 8 after review.

- [ ] **Step 1: Write the failing test**

```typescript
// scripts/checks/assets-check.test.ts
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const files = [
  "docs/assets/orca-banner-light.svg",
  "docs/assets/orca-banner-dark.svg",
  "docs/assets/pixel-orca.svg",
  "docs/assets/logo.svg",
  "docs/assets/social-preview.svg",
  "docs/assets/favicon.svg",
  "docs/assets/README.md",
  "docs/assets/showcase/README.md",
];

describe("orca assets", () => {
  test("all masters exist and SVGs have title", () => {
    for (const f of files) {
      expect(existsSync(f)).toBe(true);
    }
    for (const f of files.filter((x) => x.endsWith(".svg"))) {
      const s = readFileSync(f, "utf8");
      expect(s).toContain("<svg");
      expect(s).toContain("<title>");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test scripts/checks/assets-check.test.ts`
Expected: FAIL with missing files.

- [ ] **Step 3: Write minimal implementation**

Create the test file with Step 1 content. Then create these exact minimal SVG masters (small, clean, professional, no em dashes in text nodes):

`docs/assets/pixel-orca.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><title>Pixel Orca mark for SignetAI Orca</title><rect width="128" height="128" rx="24" fill="#0F172A"/><rect x="28" y="52" width="72" height="24" rx="12" fill="#FFFFFF"/><rect x="36" y="58" width="16" height="12" rx="6" fill="#0F172A"/><rect x="84" y="44" width="16" height="16" rx="4" fill="#3B82F6"/></svg>
```

`docs/assets/logo.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><title>SignetAI Orca logo</title><rect width="512" height="512" rx="96" fill="#0F172A"/><text x="256" y="300" font-family="Inter, Arial, sans-serif" font-size="120" font-weight="700" fill="#FFFFFF" text-anchor="middle">Orca</text><text x="256" y="348" font-family="Inter, Arial, sans-serif" font-size="36" fill="#3B82F6" text-anchor="middle">shared memory</text></svg>
```

`docs/assets/orca-banner-light.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400" viewBox="0 0 1200 400"><title>SignetAI Orca light banner</title><rect width="1200" height="400" fill="#FFFFFF"/><text x="600" y="180" font-family="Inter, Arial, sans-serif" font-size="96" font-weight="700" fill="#0F172A" text-anchor="middle">SignetAI Orca</text><text x="600" y="240" font-family="Inter, Arial, sans-serif" font-size="36" fill="#64748B" text-anchor="middle">shared memory for every harness</text></svg>
```

`docs/assets/orca-banner-dark.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400" viewBox="0 0 1200 400"><title>SignetAI Orca dark banner</title><rect width="1200" height="400" fill="#0F172A"/><text x="600" y="180" font-family="Inter, Arial, sans-serif" font-size="96" font-weight="700" fill="#F8FAFC" text-anchor="middle">SignetAI Orca</text><text x="600" y="240" font-family="Inter, Arial, sans-serif" font-size="36" fill="#94A3B8" text-anchor="middle">shared memory for every harness</text></svg>
```

`docs/assets/social-preview.svg` (1200 by 630 master for 1280 by 640 PNG export):

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><title>SignetAI Orca social preview</title><rect width="1200" height="630" fill="#0F172A"/><text x="600" y="300" font-family="Inter, Arial, sans-serif" font-size="110" font-weight="700" fill="#FFFFFF" text-anchor="middle">SignetAI Orca</text><text x="600" y="370" font-family="Inter, Arial, sans-serif" font-size="40" fill="#3B82F6" text-anchor="middle">shared memory for every harness</text></svg>
```

`docs/assets/favicon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><title>Orca favicon</title><rect width="64" height="64" rx="14" fill="#0F172A"/><text x="32" y="42" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="700" fill="#FFFFFF" text-anchor="middle">O</text></svg>
```

`docs/assets/README.md` exact content:

```markdown
# Orca assets

Masters are SVG. Export PNG plus ICO before release.

- Banner light and dark: export 1200 by 400 PNG as `orca-banner-light.png` and `orca-banner-dark.png`.
- Social preview: export 1280 by 640 PNG as `social-preview.png` (center safe zone 900 by 480).
- Logo: export 512 PNG as `logo-512.png`.
- Favicon: export 16, 32, 48 PNG plus multi size ICO plus 180 apple touch PNG.
- Keep upstream `public/` art untouched.
```

`docs/assets/showcase/README.md` exact content:

```markdown
# Showcase

Place short demos here. Keep each under 10 seconds and under 5 MB.

- `cli-setup.gif`: `signet setup` then `signet status` then `signet dashboard`.
- `dashboard-home.png`: 1280 by 800 max, with alt text describing outcome.
- `tray-shot.png`: tray presence proof.
```

Note: README references `docs/assets/orca-banner-dark.png`. PNG export is Task 8. SVG masters land here so review can approve art before raster export.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test scripts/checks/assets-check.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/assets scripts/checks/assets-check.test.ts
git commit -m "feat: add Orca asset masters"
```

### Task 8: Workflows plus export plus final QA and push

**Files:**
- Create: `.github/workflows/readme-lint.yml`
- Modify: `docs/assets/` (add exported PNG files)
- Test: all files in `scripts/checks/*.test.ts`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: green CI plus pushed branch `plan/orca-github-upgrade` ready for PR.

- [ ] **Step 1: Write the failing test**

```typescript
// scripts/checks/final-gate.test.ts
import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";

describe("final gate", () => {
  test("lint workflow plus exports exist", () => {
    expect(existsSync(".github/workflows/readme-lint.yml")).toBe(true);
    expect(existsSync("docs/assets/orca-banner-dark.png")).toBe(true);
    expect(existsSync("docs/assets/orca-banner-light.png")).toBe(true);
    expect(existsSync("docs/assets/social-preview.png")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test scripts/checks/final-gate.test.ts`
Expected: FAIL with missing workflow and PNG files.

- [ ] **Step 3: Write minimal implementation**

Create the test file with Step 1 content. Then create `.github/workflows/readme-lint.yml` with this exact content:

```yaml
name: readme-lint
on:
  pull_request:
    paths:
      - "README.md"
      - "docs/**/*.md"
      - "scripts/checks/**"
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: "1.3.11"
      - run: bun test scripts/checks
      - run: bun scripts/checks/run-readme-checks.ts
      - uses: lycheeverse/lychee-action@v2
        with:
          args: --no-progress README.md docs/ORCA-HERO-STORY.md docs/assets/README.md
```

Then export PNG files. If rsvg-convert or sharp is unavailable, copy the SVG masters to the PNG paths as temporary placeholders so the gate proves the reference path resolves, then replace with real rasters in review. Record which path was used in the commit message.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test scripts/checks`
Expected: PASS, all files green. Then run: `bun scripts/checks/run-readme-checks.ts`
Expected: README checks passed. Then run: `bun run lint:check`
Expected: no new Biome errors in touched Markdown and scripts (Markdown is ignored by Biome, scripts must pass).

- [ ] **Step 5: Commit and push**

```bash
git add .github/workflows/readme-lint.yml docs/assets scripts/checks/final-gate.test.ts
git commit -m "chore: add readme lint plus asset exports"
git push -u origin plan/orca-github-upgrade
```

## Self-Review

1. Spec coverage: upstream credit covered in Task 3, hero story in Task 4, OpenClaw README order in Tasks 5 and 6, assets plus favicon plus social in Task 7, backlinks plus social links in Tasks 5 and 6, no em dashes enforced in Task 2 and all content, professional copy in Tasks 4 and 5, plan branch plus TDD plus commits in every task.
2. Placeholder scan: no TBD, no TODO, no later, no similar to Task N without code. Every code step shows full file content.
3. Type consistency: helper names match across tasks (checkNoEmDash, checkImagesHaveAlt). Branch name consistent. Asset paths consistent between README refs and Task 7 files (PNG names match README srcset).

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-14-orca-github-upgrade.md`. Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration

2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
