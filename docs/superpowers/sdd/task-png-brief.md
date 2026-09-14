# Task brief: real PNG export

## Fit
Follow-up to plan Tasks 7 and 8 in docs/superpowers/plans/2026-09-14-orca-github-upgrade.md. SVG masters exist in docs/assets/. Placeholder 1px PNGs currently stand in at banner plus social paths. Replace with real rasters.

## Requirements (exact values, verbatim)
- `docs/assets/orca-banner-light.png`: 1200 by 400 PNG, light bg #FFFFFF, dark text #0F172A, under 1 MB.
- `docs/assets/orca-banner-dark.png`: 1200 by 400 PNG, dark bg #0F172A, light text #F8FAFC, under 1 MB.
- `docs/assets/social-preview.png`: 1280 by 640 PNG exact, dark bg #0F172A, center safe zone 900 by 480 kept clear, under 1 MB.
- `docs/assets/logo-512.png`: 512 by 512 PNG fallback of docs/assets/logo.svg.
- Favicon set: `docs/assets/favicon-16x16.png` (16 by 16), `docs/assets/favicon-32x32.png` (32 by 32), `docs/assets/apple-touch-icon.png` (180 by 180), `docs/assets/favicon.ico` (multi 16, 32, 48).
- Source of truth is the SVG masters. Render with rsvg-convert or resvg or sharp or Bun. Do not hand draw new art. Keep text: SignetAI Orca plus shared memory for every harness.
- Copy rule: no em dashes in any file touched. American English. Do not edit public/banner-typography.png or public/sources.png.

## Test cycle
- Run: `bun test scripts/checks` (must stay 11 pass, 0 fail).
- Verify with: `python3 -c` reading PNG headers for width, height, size under 1 MB. Print results.
- Expected: all PNGs exist with exact dimensions above.

## Commit
- Stage only: docs/assets/*.png, docs/assets/*.ico.
- Message: `feat: replace placeholder PNGs with real Orca exports`.

## Report
Write full report to docs/superpowers/sdd/task-png-report.md and return only: status DONE or BLOCKED, commits, one line test summary, concerns.
