# Task brief: About box check

## Fit
Follow-up to plan Phase 6. Verifies the GitHub About box matches the README without breaking upstream attribution.

## Requirements (exact values, verbatim)
- Read live state: `gh api repos/Alexi5000/signetai_Orca --jq "{description, homepage, topics}"`.
- Expected description: Orca - TechTide persistent AI agent identity across harnesses (keep current line unless empty, then set exactly this).
- Homepage must stay https://signetai.sh (inherited). Do not swap to TechTide. TechTide link lives in README, not homepage.
- Topics: keep existing 7 (agent-identity, ai-memory, claude-code, multi-agent, portable-context, signet, techtide). Add self-hosted only if valid for the repo. Never remove signet or upstream relevant topics.
- If gh api cannot write (permissions), report BLOCKED with the exact error and make no changes. Read only check still counts as evidence.
- Copy rule: no em dashes. American English.

## Test cycle
- Run: `bun test scripts/checks` (must stay green).
- Print before and after `gh api` output as evidence.
- Expected: description non empty, homepage https://signetai.sh, topics superset of the 7 above.

## Commit
- No file commit expected (Settings only). If a docs note is needed, update docs/assets/README.md with an About section.
- Message if commit: `chore: record About box state`.

## Report
Write full report to docs/superpowers/sdd/task-about-report.md and return only: status DONE or BLOCKED, commits, one line test summary, concerns.
