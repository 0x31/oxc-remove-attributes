import { test as fcTest, fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { removeAttributes } from "../src/index.js";

const runTransform = async (
  code: string,
  id = "test.tsx",
  options: Parameters<typeof removeAttributes>[0] = {},
) => {
  const plugin = removeAttributes(options) as {
    transform: (code: string, id: string) => { code: string; map: unknown } | null;
  };
  const result = plugin.transform(code, id);
  return result;
};

describe("removeAttributes", () => {
  it("strips a simple data-testid string attribute", async () => {
    const result = await runTransform(`const x = <div data-testid="foo" className="bar" />;`);
    expect(result?.code).toBe(`const x = <div className="bar" />;`);
  });

  it("strips data-testid with expression value", async () => {
    const result = await runTransform(`const x = <div data-testid={id} className="bar" />;`);
    expect(result?.code).toBe(`const x = <div className="bar" />;`);
  });

  it("strips data-testid with template literal expression", async () => {
    const result = await runTransform(
      'const x = <div data-testid={`row-${id}-${i}`} className="bar" />;',
    );
    expect(result?.code).toBe(`const x = <div className="bar" />;`);
  });

  it("strips data-testid with nested function call expression", async () => {
    const result = await runTransform(
      `const x = <div data-testid={fn({ a: { b: 'c' } })} className="bar" />;`,
    );
    expect(result?.code).toBe(`const x = <div className="bar" />;`);
  });

  it("strips multiple occurrences in the same file", async () => {
    const result = await runTransform(
      `const a = <div data-testid="a" />;\nconst b = <span data-testid="b" />;`,
    );
    expect(result?.code).toBe(`const a = <div />;\nconst b = <span />;`);
  });

  it("does NOT strip attributes inside string literals", async () => {
    const result = await runTransform(`const x = 'data-testid="should-stay"';`);
    expect(result).toBeNull();
  });

  it("does NOT strip attributes inside comments", async () => {
    const result = await runTransform(`// data-testid="should-stay"\nconst x = 1;`);
    expect(result).toBeNull();
  });

  it("does NOT match a substring attribute (e.g. my-data-testid)", async () => {
    const result = await runTransform(`const x = <div my-data-testid="x" />;`);
    expect(result).toBeNull();
  });

  it("returns null when no matching attribute present", async () => {
    const result = await runTransform(`const x = <div className="bar" />;`);
    expect(result).toBeNull();
  });

  it("returns null for non-jsx file extensions", async () => {
    const result = await runTransform(`const x = <div data-testid="foo" />;`, "test.ts");
    expect(result).toBeNull();
  });

  it("handles query suffixes on file ids", async () => {
    const result = await runTransform(`const x = <div data-testid="foo" />;`, "test.tsx?used");
    expect(result?.code).toBe(`const x = <div />;`);
  });

  it("emits a sourcemap with mappings", async () => {
    const result = await runTransform(`const x = <div data-testid="foo" />;`);
    const map = result?.map as { mappings: string } | undefined;
    expect(map).toBeTruthy();
    expect(typeof map?.mappings).toBe("string");
    expect(map?.mappings.length).toBeGreaterThan(0);
  });

  it("supports custom attributes option", async () => {
    const result = await runTransform(
      `const x = <div data-cy="foo" data-testid="bar" className="x" />;`,
      "test.tsx",
      { attributes: ["data-cy"] },
    );
    expect(result?.code).toBe(`const x = <div data-testid="bar" className="x" />;`);
  });

  it("supports multiple custom attributes", async () => {
    const result = await runTransform(
      `const x = <div data-cy="a" data-test="b" data-keep="c" />;`,
      "test.tsx",
      { attributes: ["data-cy", "data-test"] },
    );
    expect(result?.code).toBe(`const x = <div data-keep="c" />;`);
  });

  it("supports custom extensions option", async () => {
    const result = await runTransform(`const x = <div data-testid="foo" />;`, "test.mtsx", {
      extensions: [".mtsx"],
    });
    expect(result?.code).toBe(`const x = <div />;`);
  });

  it("handles nested JSX elements", async () => {
    const result = await runTransform(
      `const x = <div data-testid="outer"><span data-testid="inner">hi</span></div>;`,
    );
    expect(result?.code).toBe(`const x = <div><span>hi</span></div>;`);
  });

  it("preserves whitespace around remaining attributes", async () => {
    const result = await runTransform(
      `const x = <div\n  className="a"\n  data-testid="foo"\n  id="b"\n/>;`,
    );
    expect(result?.code).toBe(`const x = <div\n  className="a"\n  id="b"\n/>;`);
  });

  it("returns null on parse errors (defers to downstream parser)", async () => {
    const result = await runTransform(`this is not valid <<< syntax`);
    expect(result).toBeNull();
  });
});

type ApplyFn = (config: unknown, env: { command: string; mode: string }) => boolean;

describe("plugin metadata", () => {
  it("exposes the expected name and defaults", () => {
    const plugin = removeAttributes() as { name: string; enforce: string };
    expect(plugin.name).toBe("oxc-remove-attributes");
    expect(plugin.enforce).toBe("pre");
  });

  it("default apply: skipped during vite build --mode test (so e2e bundles keep testids)", () => {
    const plugin = removeAttributes() as { apply: ApplyFn };
    expect(typeof plugin.apply).toBe("function");
    expect(plugin.apply({}, { command: "build", mode: "test" })).toBe(false);
    expect(plugin.apply({}, { command: "build", mode: "production" })).toBe(true);
    expect(plugin.apply({}, { command: "build", mode: "development" })).toBe(true);
    expect(plugin.apply({}, { command: "serve", mode: "development" })).toBe(false);
  });

  it("respects apply: serve", () => {
    // 'serve' has no mode-test edge case; we pass the string through unchanged.
    const plugin = removeAttributes({ apply: "serve" }) as { apply: unknown };
    expect(plugin.apply).toBe("serve");
  });

  it("respects apply: both (always active)", () => {
    const plugin = removeAttributes({ apply: "both" }) as { apply: unknown };
    expect(plugin.apply).toBeUndefined();
  });

  it("respects custom enforce", () => {
    const plugin = removeAttributes({ enforce: "post" }) as { enforce: string };
    expect(plugin.enforce).toBe("post");
  });
});

describe("JSX shape edge cases", () => {
  it("strips a shorthand (valueless) attribute", async () => {
    const result = await runTransform(`const x = <div data-testid className="bar" />;`);
    expect(result?.code).toBe(`const x = <div className="bar" />;`);
  });

  it("does NOT touch spread attributes", async () => {
    const result = await runTransform(
      `const x = <div {...props} data-testid="foo" className="bar" />;`,
    );
    expect(result?.code).toBe(`const x = <div {...props} className="bar" />;`);
  });

  it("does NOT touch namespaced attributes (e.g. xlink:href)", async () => {
    const result = await runTransform(
      `const x = <svg xlink:href="#a" data-testid="foo"><use /></svg>;`,
    );
    expect(result?.code).toBe(`const x = <svg xlink:href="#a"><use /></svg>;`);
  });

  it("strips target as the last attribute", async () => {
    const result = await runTransform(`const x = <div className="bar" data-testid="foo" />;`);
    expect(result?.code).toBe(`const x = <div className="bar" />;`);
  });

  it("strips target as the only attribute", async () => {
    const result = await runTransform(`const x = <div data-testid="foo" />;`);
    expect(result?.code).toBe(`const x = <div />;`);
  });

  it("does NOT touch attribute appearing inside a template literal", async () => {
    const result = await runTransform(
      'const html = `<div data-testid="x"></div>`;\nconst el = <div className="y" />;',
    );
    // Template literal content is preserved; no JSXAttribute matched anywhere.
    expect(result).toBeNull();
  });

  it("strips inside JSX inside expression containers", async () => {
    const result = await runTransform(
      `const x = <ul>{items.map((i) => <li data-testid={i.id} key={i.id}>{i.name}</li>)}</ul>;`,
    );
    expect(result?.code).toBe(
      `const x = <ul>{items.map((i) => <li key={i.id}>{i.name}</li>)}</ul>;`,
    );
  });

  it("handles TypeScript generic syntax in same file", async () => {
    const code = `const id = <T,>(x: T): T => x;\nconst el = <div data-testid="foo" />;`;
    const result = await runTransform(code);
    expect(result?.code).toBe(`const id = <T,>(x: T): T => x;\nconst el = <div />;`);
  });
});

describe("sourcemap correctness", () => {
  it("maps a position after the stripped attribute back to the original line", async () => {
    const { decode } = await import("@jridgewell/sourcemap-codec");

    // Three-line input with the target on line 2.
    const code =
      `const Header = () => (\n` +
      `  <div data-testid="header" className="row">\n` +
      `    <span>Hello</span>\n` +
      `  </div>\n` +
      `);\n`;
    const result = await runTransform(code);
    expect(result).not.toBeNull();
    const map = result?.map as { mappings: string };

    // Decoded format: outputLine -> [outputCol, sourceIdx, sourceLine, sourceCol][]
    const decoded = decode(map.mappings);

    // Output line 2 starts with `  <div ` (testid removed). The `<` is at
    // output column 2. It should map back to original line 2, column 2.
    const outputLine2 = decoded[1] ?? [];
    const segmentAtLeftBracket = outputLine2.find((seg) => seg[0] === 2);
    expect(segmentAtLeftBracket).toBeDefined();
    expect(segmentAtLeftBracket?.[2]).toBe(1); // source line (0-indexed) = line 2
    expect(segmentAtLeftBracket?.[3]).toBe(2); // source column

    // Output line 3 (`    <span>`) should map back to original line 3 unchanged.
    const outputLine3 = decoded[2] ?? [];
    expect(outputLine3.length).toBeGreaterThan(0);
    const firstSeg3 = outputLine3[0]!;
    expect(firstSeg3[2]).toBe(2); // source line (0-indexed) = line 3

    // sources should include our virtual filename.
    expect((map as { sources?: string[] }).sources).toContain("test.tsx");
  });

  it("emits hires (per-character) mappings", async () => {
    const { decode } = await import("@jridgewell/sourcemap-codec");
    const result = await runTransform(`const x = <div data-testid="foo" className="bar" />;`);
    expect(result).not.toBeNull();
    const decoded = decode((result!.map as { mappings: string }).mappings);
    // hires gives a segment per character on the affected line; we expect
    // many segments, not just a handful.
    const lineSegs = decoded[0] ?? [];
    expect(lineSegs.length).toBeGreaterThan(10);
  });
});

// ---------- fuzz generators ----------

const identifier = fc
  .stringMatching(/^[a-z][a-z0-9]{0,5}$/)
  .filter((s) => !["true", "false", "null", "for", "if"].includes(s));

const stringAttr = fc
  .tuple(identifier, fc.stringMatching(/^[a-zA-Z0-9 _-]{0,12}$/))
  .map(([k, v]) => `${k}="${v}"`);

const targetAttr = fc.stringMatching(/^[a-zA-Z0-9 _-]{0,12}$/).map((v) => `data-testid="${v}"`);

const jsxFragment = fc
  .tuple(identifier, fc.array(fc.oneof(stringAttr, targetAttr), { minLength: 0, maxLength: 5 }))
  .map(([tag, attrs]) => {
    const attrStr = attrs.length ? " " + attrs.join(" ") : "";
    return `const x = <${tag}${attrStr} />;`;
  });

const jsxFragmentWithoutTarget = fc
  .tuple(identifier, fc.array(stringAttr, { minLength: 0, maxLength: 5 }))
  .map(([tag, attrs]) => {
    const attrStr = attrs.length ? " " + attrs.join(" ") : "";
    return `const x = <${tag}${attrStr} />;`;
  });

const fuzzTransform = (code: string) => {
  const plugin = removeAttributes() as {
    transform: (code: string, id: string) => { code: string } | null;
  };
  return plugin.transform(code, "fuzz.tsx");
};

describe("fuzz / property tests", () => {
  fcTest.prop([jsxFragment], { numRuns: 200 })(
    "is idempotent (running twice equals running once)",
    (code) => {
      const once = fuzzTransform(code);
      if (!once) return;
      const twice = fuzzTransform(once.code);
      expect(twice).toBeNull();
    },
  );

  fcTest.prop([jsxFragmentWithoutTarget], { numRuns: 200 })(
    "returns null for code with no target attribute",
    (code) => {
      expect(fuzzTransform(code)).toBeNull();
    },
  );

  fcTest.prop([jsxFragment], { numRuns: 200 })("never increases output length", (code) => {
    const result = fuzzTransform(code);
    if (!result) return;
    expect(result.code.length).toBeLessThan(code.length);
  });
});

describe("regression: v0.1.1 fixes", () => {
  it("attributes: [] is a no-op — does not strip anything and bails fast", async () => {
    // With an empty attributes list, `new RegExp("")` matches every string
    // and parser would be invoked unnecessarily. The plugin should
    // short-circuit instead.
    const result = await runTransform(
      `const x = <div data-testid="foo" className="bar" />;`,
      "test.tsx",
      { attributes: [] },
    );
    expect(result).toBeNull();
  });

  it("sourcemap source field is de-queried (no ?query suffix)", async () => {
    const result = await runTransform(`const x = <div data-testid="foo" />;`, "Foo.tsx?used");
    expect(result).not.toBeNull();
    const map = result?.map as { sources?: string[] };
    expect(map.sources).toBeDefined();
    // Sentry / devtools see this — should be the de-queried filename.
    expect(map.sources?.[0]).toBe("Foo.tsx");
  });

  it("handles nested JSX with target attributes on outer and inner elements", async () => {
    // Outer JSXAttribute's value is a JSXElement that itself has a
    // matching attribute. Walker should not throw on overlapping/nested
    // removes.
    const code = `const x = <Outer data-testid="o" wrapper={<Inner data-testid="i" />} />;`;
    const result = await runTransform(code);
    expect(result?.code).toBe(`const x = <Outer wrapper={<Inner />} />;`);
  });

  it("handles target attribute whose value contains nested JSX with target", async () => {
    // Outer data-testid={...} contains an inner element that also has
    // data-testid. The inner one falls inside an already-removed range —
    // walker should skip descending into a removed attribute.
    const code = `const x = <div data-testid={<Foo data-testid="x" />}>hi</div>;`;
    const result = await runTransform(code);
    expect(result?.code).toBe(`const x = <div>hi</div>;`);
  });
});
