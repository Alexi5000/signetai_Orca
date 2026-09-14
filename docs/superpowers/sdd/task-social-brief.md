# Task brief: social preview upload verification plus docs

## Fit
Follow-up to plan Task 8. PNG export task must land first. This task verifies the upload path and records it so any maintainer can repeat it.

## Requirements (exact values, verbatim)
- File to upload: `docs/assets/social-preview.png` (1280 by 640 exact, under 1 MB).
- Record the exact click path: repo Settings plus General plus Social preview plus Upload image, plus Test with X, LinkedIn, Discord, Slack unfurl.
- Update `docs/assets/README.md` with an Upload section: file name, dimensions, safe zone center 900 by 480, where it was uploaded, date, and unfurl test results. No em dashes. American English.
- Do not change README hero markup unless the image 404s. Verify hero `picture` block resolves on branch view.

## Test cycle
- Run: `bun test scripts/checks` (must stay green).
- Run: `bun scripts/checks/run-readme-checks.ts` (must print README checks passed).
- Expected: both green. Upload itself is a manual Settings step: if gh api cannot set social preview, report BLOCKED with the exact API error and leave the docs update in place.

## Commit
- Stage only: docs/assets/README.md (plus any hero fix if needed).
- Message: `docs: record social preview upload`.

## Report
Write full report to docs/superpowers/sdd/task-social-report.md and return only: status DONE or BLOCKED, commits, one line test summary, concerns.
