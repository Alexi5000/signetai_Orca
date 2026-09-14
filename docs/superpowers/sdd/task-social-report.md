# Task report: social preview upload verification plus docs

Status: BLOCKED. Docs update is committed. The image file is verified. The upload itself remains a manual web UI step because the GitHub REST API has no way to set the social preview image.

## File verification

- File: `docs/assets/social-preview.png`.
- Size: 1280 by 640 exact (PIL read), RGBA.
- Bytes: 27661, under 1 MB. PASS.
- Safe zone: prior pixel review placed all content inside the center 900 by 480 region. Recorded in `docs/assets/README.md`.

## Upload path (exact click path, verbatim)

Repo Settings plus General plus Social preview plus Upload image, on `Alexi5000/signetai_Orca`, then test with X, LinkedIn, Discord, Slack unfurl.

## API attempt (exact result)

Command: `gh api -X PATCH repos/Alexi5000/signetai_Orca -f social_preview_image=test`.

Result: HTTP 200 with the full repo JSON, but the trial field was silently ignored. No repo setting changed (description and homepage intact). The response contains no social image key. There is no REST endpoint for uploading the social preview image, so this step needs a maintainer with admin access in the web UI. No API error is returned because the API simply has no such field.

## Docs update

- `docs/assets/README.md`: added an Upload section with file name, dimensions, safe zone center 900 by 480, where it was uploaded, date 2026-09-14, and unfurl test results (all pending). No em dashes. American English.
- README hero markup: unchanged. The hero `picture` block resolves on branch view (no 404). Note: the pushed branch still serves the stale 70 byte placeholder for `orca-banner-dark.png` because local commits are ahead of origin, so the real 22082 byte image resolves after push. No markup change was needed.

## Decisions respected

- Homepage stays https://signetai.sh. Confirmed in README links and in the API repo object (`homepage: https://signetai.sh`).
- No em dashes anywhere in the edited file.
- American English.

## Commits

- 5ef6440b8 `docs: record social preview upload` (1 file, 9 insertions, staged only docs/assets/README.md).

## Commands run with output

1. `bun test scripts/checks`: 11 pass, 0 fail, 62 expect() calls across 8 files.
2. `bun scripts/checks/run-readme-checks.ts`: printed `README checks passed.`
3. Branch view check for `docs/assets/orca-banner-dark.png` on `plan/orca-github-upgrade`: resolves, shows 70 bytes (stale until push). No 404.

## Files changed

- Modified and committed: docs/assets/README.md.
- Created (this report, untracked): docs/superpowers/sdd/task-social-report.md.
- Not touched: README.md hero markup, all PNG binaries, all tests.

## Concerns

- Upload is still pending: a maintainer with admin access must upload `docs/assets/social-preview.png` via Settings, then run the X, LinkedIn, Discord, and Slack unfurl tests and record results in `docs/assets/README.md`.
- My PATCH probe touched `updated_at` on the repo object even though it changed no setting. Harmless, but noted for honesty.
- Local branch is ahead of origin, so branch view images look stale until push plus merge.
