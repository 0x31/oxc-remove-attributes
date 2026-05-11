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

describe("plugin metadata", () => {
  it("exposes the expected name and defaults", () => {
    const plugin = removeAttributes() as { name: string; enforce: string; apply: unknown };
    expect(plugin.name).toBe("oxc-remove-attributes");
    expect(plugin.enforce).toBe("pre");
    expect(plugin.apply).toBe("build");
  });

  it("respects apply: both", () => {
    const plugin = removeAttributes({ apply: "both" }) as { apply: unknown };
    expect(plugin.apply).toBeUndefined();
  });

  it("respects custom enforce", () => {
    const plugin = removeAttributes({ enforce: "post" }) as { enforce: string };
    expect(plugin.enforce).toBe("post");
  });
});
