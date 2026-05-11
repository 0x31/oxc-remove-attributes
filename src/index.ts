import MagicString from "magic-string";
import { parseSync } from "oxc-parser";

export interface RemoveAttributesOptions {
  /**
   * Attribute names to remove from JSX. Matched exactly (no glob/regex).
   * @default ['data-testid']
   */
  attributes?: string[];

  /**
   * File extensions to process. The plugin only inspects files whose `id`
   * ends with one of these (post-query-string strip).
   * @default ['.tsx', '.jsx']
   */
  extensions?: string[];

  /**
   * When this plugin runs in the Vite pipeline.
   *  - `'pre'` runs before other transforms — operates on raw JSX.
   *  - `undefined` runs in the normal phase.
   *  - `'post'` runs after other transforms.
   *
   * Default `'pre'` so we see source JSX before React/oxc lowering. This
   * keeps the plugin runtime-agnostic (works with classic and automatic
   * JSX runtimes).
   * @default 'pre'
   */
  enforce?: "pre" | "post";

  /**
   * Build mode(s) where the plugin is active.
   *  - `'build'`: only `vite build` (default — testids stay live in dev).
   *  - `'serve'`: only `vite dev`.
   *  - `'both'`: always active.
   * @default 'build'
   */
  apply?: "build" | "serve" | "both";
}

const DEFAULT_ATTRIBUTES = ["data-testid"];
const DEFAULT_EXTENSIONS = [".tsx", ".jsx"];

/**
 * Vite/Rolldown plugin that strips JSX attributes from your bundle.
 *
 * Parses with oxc, removes matching `JSXAttribute` nodes via magic-string,
 * and emits a high-resolution sourcemap so downstream tools (e.g. Sentry)
 * keep accurate stack-trace positions.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { defineConfig } from 'vite';
 * import react from '@vitejs/plugin-react';
 * import { removeAttributes } from 'oxc-remove-attributes';
 *
 * export default defineConfig({
 *   plugins: [react(), removeAttributes()],
 * });
 * ```
 */
export const removeAttributes = (options: RemoveAttributesOptions = {}) => {
  const attributes = new Set(options.attributes ?? DEFAULT_ATTRIBUTES);
  const extensions = options.extensions ?? DEFAULT_EXTENSIONS;
  const enforce = options.enforce ?? "pre";
  const apply = options.apply ?? "build";

  const shouldProcess = (id: string) => {
    const path = id.split("?")[0]!;
    return extensions.some((ext) => path.endsWith(ext));
  };

  // Cheap pre-filter: skip files that mention none of our targets at all.
  const fastBailRegex = new RegExp(
    [...attributes].map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
  );

  return {
    name: "oxc-remove-attributes",
    enforce,
    apply: apply === "both" ? undefined : apply,
    transform(code: string, id: string) {
      if (!shouldProcess(id)) return null;
      if (!fastBailRegex.test(code)) return null;

      // Strip any `?query` from the filename so oxc reads the extension
      // correctly (Vite emits ids like `Foo.tsx?used`).
      const filename = id.split("?")[0]!;
      const { program, errors } = parseSync(filename, code, {
        sourceType: "module",
        lang: "tsx",
      });
      if (errors.length > 0) return null;

      const s = new MagicString(code);
      let removed = false;

      visit(program, (node) => {
        const attr = node as unknown as { name?: { type: string; name?: string } };
        if (
          node.type === "JSXAttribute" &&
          attr.name?.type === "JSXIdentifier" &&
          typeof attr.name.name === "string" &&
          attributes.has(attr.name.name)
        ) {
          s.remove(expandStart(code, node.start), node.end);
          removed = true;
        }
      });

      if (!removed) return null;
      return { code: s.toString(), map: s.generateMap({ hires: true, source: id }) };
    },
  };
};

export default removeAttributes;

interface SpanNode {
  type: string;
  start: number;
  end: number;
  [key: string]: unknown;
}

type Visitor = (node: SpanNode) => void;

/**
 * Walk backwards from `pos` over spaces/tabs. If we cross a newline, swallow
 * it so the attribute's line disappears entirely (no orphan whitespace line).
 * Otherwise — when the attribute sits inline with other content — we
 * effectively drop just the single preceding space.
 */
const expandStart = (code: string, pos: number): number => {
  let i = pos;
  while (i > 0) {
    const c = code[i - 1];
    if (c === " " || c === "\t") i--;
    else break;
  }
  if (i > 0 && code[i - 1] === "\n") {
    i--;
    if (i > 0 && code[i - 1] === "\r") i--;
  } else if (i > 0 && code[i - 1] === "\r") {
    i--;
  }
  return i;
};

/**
 * Walk an oxc/estree AST depth-first, invoking `visitor` on every node
 * shaped like `{ type, start, end }`. Avoids a third-party walker dep.
 */
const visit = (node: unknown, visitor: Visitor) => {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) visit(item, visitor);
    return;
  }
  const n = node as Partial<SpanNode>;
  if (typeof n.type === "string" && typeof n.start === "number" && typeof n.end === "number") {
    visitor(n as SpanNode);
  }
  for (const key in node) {
    if (key === "parent") continue;
    visit((node as Record<string, unknown>)[key], visitor);
  }
};
