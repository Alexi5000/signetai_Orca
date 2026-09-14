import { existsSync, readFileSync } from "node:fs";
import { checkImagesHaveAlt, checkNoEmDash } from "./readme-quality.ts";

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
