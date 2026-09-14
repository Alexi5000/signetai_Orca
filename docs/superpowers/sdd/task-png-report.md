# Task report: real PNG export

Status: DONE. All placeholder PNGs replaced with real rasters rendered from the SVG masters. No prose files touched, so no em dash risk. American English not applicable to binary output. Upstream public art untouched.

## Commits

- 507aff99f `feat: replace placeholder PNGs with real Orca exports` (8 files, staged only docs/assets PNG/ICO per the brief)

## Commands run with output

1. `bun test scripts/checks` (baseline before work): 11 pass, 0 fail, 62 expect() calls.
2. Render via sharp (density 144, fit fill, PNG compression 9), one `bun -e` call reading each SVG master and writing the exact target size:
   - orca-banner-light.svg to orca-banner-light.png 1200x400
   - orca-banner-dark.svg to orca-banner-dark.png 1200x400
   - social-preview.svg (1200x630 viewBox) scaled to social-preview.png 1280x640
   - logo.svg to logo-512.png 512x512
   - favicon.svg to favicon-16x16.png, favicon-32x32.png, apple-touch-icon.png 180x180, plus temp 48x48 for the ICO
   - Output: all 8 writes confirmed.
3. `favicon.ico`: first built with PIL, but PIL auto added a duplicate 16x16 frame (4 frames). Rebuilt manually as a PNG compressed ICO with exactly 3 frames. Verified header: count 3, frames (16,16), (32,32), (48,48). PIL reopens it cleanly.
4. Dimension verification (`python3 -c`, PIL header reads):
   - orca-banner-light.png: (1200, 400), 22292 bytes, corner bg (255,255,255) equals #FFFFFF
   - orca-banner-dark.png: (1200, 400), 22082 bytes, corner bg (15,23,42) equals #0F172A
   - social-preview.png: (1280, 640), 48099 bytes, corner bg (15,23,42) equals #0F172A
   - logo-512.png: (512, 512), 14936 bytes
   - favicon-16x16.png: (16, 16), 292 bytes
   - favicon-32x32.png: (32, 32), 573 bytes
   - apple-touch-icon.png: (180, 180), 3147 bytes
   - All PNGs under 1 MB. Text confirmed rendered (antialiased color counts 480 to 1995 per banner, not flat fills).
5. `bun test scripts/checks` (after work): 11 pass, 0 fail, 62 expect() calls.
6. `git status --short` after work shows no changes under public/, so public/banner-typography.png and public/sources.png are untouched.

## Files changed

- Modified: docs/assets/orca-banner-dark.png (70 bytes to 22082), docs/assets/orca-banner-light.png (70 bytes to 22292), docs/assets/social-preview.png (70 bytes to 48099)
- Created: docs/assets/logo-512.png, docs/assets/favicon-16x16.png, docs/assets/favicon-32x32.png, docs/assets/apple-touch-icon.png, docs/assets/favicon.ico
- Created (this report): docs/superpowers/sdd/task-png-report.md
- Not touched: every SVG master, public/ art, all prose and test files

## Fix verification

Status: DONE. One asset re-rendered (social-preview.png). All other PNGs and the ICO confirmed as is. No SVG masters, prose, or test files touched.

### 1. Social stretch

Confirmed: prior social-preview.png scaled the 1200x630 viewBox (aspect 1.905) to 1280x640 (aspect 2.0) with fill, a horizontal stretch factor of (1280/1200)/(640/630) = 1.05, about 5 percent. Glyph widths measured 5 percent over native, so visible distortion YES at pixel review level.

Fix: re-rendered natively at 1280x640 with exact aspect. Rendered the SVG aspect preserved at full height 640 (width round(640*1200/630) = 1219), then centered on a 1280x640 canvas of the same bg #0F172A (left offset 30). Padding pixels equal the bg, so seams are invisible and glyphs are undistorted. SVG master untouched. New file: 27661 bytes (was 48099), 1280x640, corners all (15,23,42). Non bg pixel bbox x 274..1004, y 224..384, fully inside the center safe zone x 190..1090, y 80..560 (900x480 centered). Render command: `bun C:\Users\Admin\AppData\Local\Temp\opencode\fix-social.mjs` (sharp, density 144, PNG compression 9).

### 2. Text color and string proof

Method: title band text pixel sampling (not corners) plus text region crop counts. No OCR engine on this machine (tesseract absent) and PNGs carry no embedded text chunks (PIL info keys are dpi only), so string presence is proven by text region crops plus SVG master source.

- orca-banner-light.png title band dominant text color (15,23,42) equals #0F172A. PASS.
- orca-banner-dark.png title band dominant text color (248,250,252) equals #F8FAFC. PASS.
- Title band non bg pixels: light 6406, dark 6406, social 8747. Subtitle band non bg pixels: light 1713, dark 1707, social 2188. Both bands populated in all three files, matching two rendered text lines.
- SVG masters (render source) contain both strings: orca-banner-light.svg, orca-banner-dark.svg, and social-preview.svg each contain "SignetAI Orca" and "shared memory for every harness" (grep, docs/assets, 5 matches including titles).

### 3. Header dump (all 8 artifacts)

- docs/assets/orca-banner-light.png bytes=22292 size=(1200, 400) mode=RGBA
- docs/assets/orca-banner-dark.png bytes=22082 size=(1200, 400) mode=RGBA
- docs/assets/social-preview.png bytes=27661 size=(1280, 640) mode=RGBA
- docs/assets/logo-512.png bytes=14936 size=(512, 512) mode=RGBA
- docs/assets/favicon-16x16.png bytes=292 size=(16, 16) mode=RGBA
- docs/assets/favicon-32x32.png bytes=573 size=(32, 32) mode=RGBA
- docs/assets/apple-touch-icon.png bytes=3147 size=(180, 180) mode=RGBA
- docs/assets/favicon.ico bytes=1752 reserved=0 type=1 count=3; entry 0: 16x16 bpp=32 size=292 offset=54; entry 1: 32x32 bpp=32 size=573 offset=346; entry 2: 48x48 bpp=32 size=833 offset=919. Expectation 3 frames 16/32/48 met (raw ICO directory parse; PIL reports the same sizes set).
- All PNGs under 1 MB.

### 4. License files untouched

`git diff --name-only f8e1a4952 HEAD -- LICENSE NOTICE THIRD_PARTY_LICENSES.md` returned empty, and `git status --short` shows no changes to those paths. Untouched confirmed.

### Tests

`bun test scripts/checks` after fix: 11 pass, 0 fail, 62 expect() calls.

## Concerns

- social-preview.svg has a 1200x630 viewBox while the brief requires a 1280x640 PNG. Rendered by exact scaling (aspect 1.905 to 2.0), so the art is very slightly stretched horizontally. Text stays centered, so the 900x480 center safe zone holds, but a pixel perfect reviewer could regenerate the master at 1280x640 viewBox later.
- logo.svg and favicon.svg use rounded rectangles, so corner pixels are transparent rather than #0F172A. Expected from the masters, not a defect.
- Banner text uses Inter with Arial fallback through sharp/librsvg, so glyph shapes may differ slightly from a designer machine with Inter installed. Copy strings match the masters exactly.
