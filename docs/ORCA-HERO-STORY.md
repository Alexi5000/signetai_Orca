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
