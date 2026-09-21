import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rolldown } from "rolldown";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { removeAttributes } from "../src/index.js";

// The README advertises Rolldown as well as Vite, so bundle with Rolldown
// directly rather than through Vite. Note that `apply` and `enforce` are
// Vite-only concepts: Rolldown ignores them, which is why the plugin has to
// strip attributes on its own `transform` regardless of those options.

let dir: string;
let entry: string;

const SOURCE = `
export const App = () => (
  <div data-testid="root" className="app">
    <span data-testid="label">hi</span>
  </div>
);
`;

const bundle = async (options?: Parameters<typeof removeAttributes>[0]) => {
  const build = await rolldown({
    input: entry,
    plugins: [removeAttributes(options)],
    // Keep the JSX un-lowered so the assertions read against source-like
    // output; the plugin runs before this anyway.
    external: ["react/jsx-runtime"],
  });
  const { output } = await build.generate({ format: "esm" });
  return output[0].code;
};

describe("rolldown", () => {
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "oxc-remove-attributes-"));
    entry = join(dir, "entry.jsx");
    await writeFile(entry, SOURCE);
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("strips attributes when used as a plain Rolldown plugin", async () => {
    const code = await bundle();
    expect(code).not.toContain("data-testid");
    expect(code).toContain("className");
  });

  it("keeps attributes that were not configured", async () => {
    const code = await bundle({ attributes: ["data-cy"] });
    expect(code).toContain("data-testid");
  });

  it("runs regardless of `apply`, which Rolldown does not implement", async () => {
    // `apply: 'serve'` would keep the plugin out of a Vite build entirely.
    // Rolldown has no such concept, so the transform still runs.
    const code = await bundle({ apply: "serve" });
    expect(code).not.toContain("data-testid");
  });
});
