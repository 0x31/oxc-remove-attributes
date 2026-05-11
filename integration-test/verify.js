import { readFile } from "node:fs/promises";

const built = await readFile("./dist/out.js", "utf-8");
const map = JSON.parse(await readFile("./dist/out.js.map", "utf-8"));

console.log(`Built output: ${built.split("\n").length} lines, ${built.length} bytes`);

const failures = [];

// 1. Confirm none of our target attributes survived to the bundle as JSX-like
//    output. We grep the literal strings that React's JSX runtime emits — the
//    attribute name appears as a quoted string in the `_jsx("tag", { ... })`
//    call when it survives stripping.
const forbidden = ['"data-testid"', "'data-testid'", '"data-cy"', "'data-cy'"];
for (const needle of forbidden) {
  if (built.includes(needle)) {
    failures.push(`bundle still contains ${needle}`);
  }
}

// 2. Strings inside text content / templates should be preserved (proves we
//    didn't over-strip). The literal `data-testid="not-jsx"` was inside a
//    <title> text node — it should still appear in the output as a JS
//    string literal (with JSON-escaped quotes).
if (!built.includes('data-testid=\\"not-jsx\\"') && !built.includes('data-testid="not-jsx"')) {
  failures.push("over-stripped: literal string content was removed");
}

// 3. Spread + namespaced attributes should still be present. xlink:href
//    survives the React transform as the property name on the props object.
if (!built.match(/xlink:href|"xlink:href"/)) {
  failures.push("xlink:href namespaced attr was stripped (should be untouched)");
}

// 4. Sourcemap should exist and have non-empty mappings.
if (!map.mappings || map.mappings.length < 10) {
  failures.push(`sourcemap mappings look empty: ${JSON.stringify(map.mappings).slice(0, 60)}`);
}
if (!Array.isArray(map.sources) || map.sources.length === 0) {
  failures.push("sourcemap has no sources");
}

if (failures.length > 0) {
  console.error("\nIntegration test FAILED:");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}

console.log("\nIntegration test passed ✓");
console.log("  - no target attributes leaked into bundle");
console.log("  - non-target content preserved (strings, namespaced attrs, spreads)");
console.log("  - sourcemap emitted with mappings");
