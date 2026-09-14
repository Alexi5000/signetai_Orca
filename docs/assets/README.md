# Orca assets

Masters are SVG. Export PNG plus ICO before release.

- Banner light and dark: export 1200 by 400 PNG as `orca-banner-light.png` and `orca-banner-dark.png`.
- Social preview: export 1280 by 640 PNG as `social-preview.png` (center safe zone 900 by 480).
- Logo: export 512 PNG as `logo-512.png`.
- Favicon: export 16, 32, 48 PNG plus multi size ICO plus 180 apple touch PNG.
- Keep upstream `public/` art untouched.

## Upload

- File: `social-preview.png`, 1280 by 640 pixels, 27661 bytes (under 1 MB).
- Safe zone: keep key content inside the center 900 by 480 region.
- Where to upload: repo Settings, then General, then Social preview, then Upload image on `Alexi5000/signetai_Orca`.
- Status as of 2026-09-14: not yet uploaded. The GitHub REST API has no field for the social image (a PATCH with a trial field returns 200 but ignores it), so a maintainer with admin access must do this step in the web UI.
- After upload, test unfurl with X, LinkedIn, Discord, and Slack, then record results here.
- Unfurl tests: X pending, LinkedIn pending, Discord pending, Slack pending.
