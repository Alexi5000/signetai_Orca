# TechTide AI — Why This Fork Exists

## The Problem

When agents move between tools, sessions, and harnesses, identity fractures. A Claude Code agent that remembers your project conventions today forgets them when you switch to Codex or Gemini CLI tomorrow. Multi-agent teams have it worse — each agent starts from zero every session.

## Why Signet

Signet solves the portable context problem. It keeps identity, memory, and working knowledge outside any single chat app or model provider. The harness can change. The agent keeps its footing.

We use Signet internally at TechTide as the identity backbone for our multi-agent deployments. When a client runs 5+ Claude Code agents across worktrees, Signet is what ensures each agent knows who it is and what it's working on.

## What TechTide Uses This For

- **Multi-agent identity** — Each agent in a deployment gets persistent, inspectable memory that survives session boundaries
- **Cross-harness continuity** — Agents that start in Claude Code can pick up context when moved to Forge or OpenCode
- **Client onboarding** — New project deployments bootstrap from Signet workspaces with pre-loaded domain knowledge
- **Memory auditing** — Inspectable recall lets us verify what agents know before shipping them to production

## Upstream Contributions

We contribute documentation and code quality improvements back to the upstream project:

| PR | Description |
|----|-------------|
| [#746](https://github.com/Signet-AI/signetai/pull/746) | Add README for all 9 integration connectors |
| [#747](https://github.com/Signet-AI/signetai/pull/747) | Implement `parseMemory` with structured section extraction |
| [#748](https://github.com/Signet-AI/signetai/pull/748) | Fix migration stubs that silently no-op instead of throwing |

## Architecture Notes

Signet is a TypeScript monorepo with:
- **Platform** (`platform/`): Core library, daemon, native bindings
- **Integrations** (`integrations/`): 9 harness connectors (Claude Code, Codex, Forge, Gemini, Hermes, Oh My Pi, OpenClaw, OpenCode, Pi)
- **Libs** (`libs/`): Connector base, SDK
- **Web** (`web/`): Dashboard UI
- **Plugins** (`plugins/`): Graphiq knowledge graph, secrets management

Key strengths:
- **Harness-agnostic**: Works with any AI coding CLI through the connector pattern
- **97.6% LongMemEval accuracy**: Production-grade memory retrieval
- **Inspectable**: All memory is readable markdown, not opaque embeddings
- **Reversible**: Every connector supports clean install/uninstall

---

*This fork is maintained by [TechTide AI](https://github.com/TechTideOhio) as part of our agent identity infrastructure stack.*
