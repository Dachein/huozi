/**
 * Ad-hoc CLI: read an HTML file from disk, run validateHuoziHtml,
 * print issues as a small report. Used for spot-checking the latest
 * published HTMLs against the v1 validation rules.
 */
import { readFileSync } from "node:fs";
import { argv } from "node:process";
import { validateHuoziHtml, summarize } from "../src/lib/html/validate";

const path = argv[2];
if (!path) {
  console.error("usage: tsx scripts/run-validate.ts <html-file>");
  process.exit(2);
}
const html = readFileSync(path, "utf8");
const issues = validateHuoziHtml(html);
const s = summarize(issues);
console.log(`\n=== ${path} ===`);
console.log(
  `summary: ${s.error} error · ${s.warning} warning · ${s.hint} hint  (${s.total} total)`,
);
for (const issue of issues) {
  const loc = issue.line !== undefined ? ` (line ${issue.line})` : "";
  console.log(`  [${issue.level}] ${issue.code}${loc}`);
  console.log(`     ${issue.message}`);
  if (issue.remedy) console.log(`     → ${issue.remedy}`);
}
if (issues.length === 0) console.log("  (clean)");
