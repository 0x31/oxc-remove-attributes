import { readFile } from "node:fs/promises";

const scenario = process.argv[2];
if (scenario !== "strip" && scenario !== "mode-test") {
  console.error(`usage: verify.js <strip|mode-test>`);
  process.exit(2);
}

const distDir = scenario === "mode-test" ? "./dist-mode-test" : "./dist";
const built = await readFile(`${distDir}/out.js`, "utf-8");
const map = JSON.parse(await readFile(`${distDir}/out.js.map`, "utf-8"));

console.log(`[${scenario}] built output: ${built.split("\n").length} lines, ${built.length} bytes`);

const failures = [];
const forbidden = ['"data-testid"', "'data-testid'", '"data-cy"', "'data-cy'"];

if (scenario === "strip") {
  // Default `vite build`: target attributes must NOT survive in the bundle.
  for (const needle of forbidden) {
    if (built.includes(needle)) failures.push(`bundle still contains ${needle}`);
  }

  // Strings inside text content / templates should be preserved.
  if (!built.includes('data-testid=\\"not-jsx\\"') && !built.includes('data-testid="not-jsx"')) {
    failures.push("over-stripped: literal string content was removed");
  }

  // Spread + namespaced attributes should still be present.
  if (!built.match(/xlink:href|"xlink:href"/)) {
    failures.push("xlink:href namespaced attr was stripped (should be untouched)");
  }

  // Sourcemap should exist and have non-empty mappings.
  if (!map.mappings || map.mappings.length < 10) {
    failures.push(`sourcemap mappings look empty: ${JSON.stringify(map.mappings).slice(0, 60)}`);
  }
  if (!Array.isArray(map.sources) || map.sources.length === 0) {
    failures.push("sourcemap has no sources");
  }

  // Sourcemap sources must be de-queried (no ?used / ?commonjs-proxy etc).
  for (const src of map.sources ?? []) {
    if (typeof src === "string" && src.includes("?")) {
      failures.push(`sourcemap source contains query string: ${src}`);
    }
  }
} else {
  // `vite build --mode test`: e2e bundles must KEEP target attributes
  // because Playwright/Cypress locate elements by them. This is the
  // contract the plugin's default `apply` honours.
  let kept = 0;
  for (const needle of forbidden) {
    if (built.includes(needle)) kept++;
  }
  if (kept === 0) {
    failures.push(
      "mode=test build stripped target attributes — the default apply() should skip mode=test so e2e selectors keep working",
    );
  }
}

if (failures.length > 0) {
  console.error(`\n[${scenario}] integration test FAILED:`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}

console.log(`[${scenario}] integration test passed ✓`);
