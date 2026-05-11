import MagicString from "magic-string";
import { parseSync } from "oxc-parser";
import type { Plugin } from "vite";

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
   * When the plugin is active.
   *  - `'build'` (default): runs during `vite build` *except* when
   *    `--mode test` is used, so e2e/test bundles keep their testids.
   *  - `'serve'`: runs only during `vite dev`.
   *  - `'both'`: always active (dev + build, regardless of mode).
   *  - function: full control — receives Vite's `(config, env)` and
   *    returns whether to include the plugin.
   * @default 'build'
   */
  apply?: "build" | "serve" | "both" | ((config: unknown, env: ApplyEnv) => boolean);
}

export interface ApplyEnv {
  command: "build" | "serve";
  mode: string;
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
export const removeAttributes = (options: RemoveAttributesOptions = {}): Plugin => {
  const attributes = new Set(options.attributes ?? DEFAULT_ATTRIBUTES);
  const extensions = options.extensions ?? DEFAULT_EXTENSIONS;
  const enforce = options.enforce ?? "pre";
  const applyOption = options.apply ?? "build";

  const shouldProcess = (id: string) => {
    const path = id.split("?")[0]!;
    return extensions.some((ext) => path.endsWith(ext));
  };

  // Cheap pre-filter: skip files that mention none of our targets at all.
  const fastBailRegex = new RegExp(
    [...attributes].map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
  );

  // Translate string shorthands into the (config, env) => boolean form Vite
  // expects. Critically, the default `'build'` excludes `--mode test` so
  // that e2e bundles built with `vite build --mode test` keep their
  // testids intact — Vite's plain `apply: 'build'` would not.
  const resolveApply = (): Plugin["apply"] => {
    if (typeof applyOption === "function") {
      return applyOption as Plugin["apply"];
    }
    if (applyOption === "both") return undefined;
    if (applyOption === "serve") return "serve";
    return (_config, env) => env.command === "build" && env.mode !== "test";
  };

  return {
    name: "oxc-remove-attributes",
    enforce,
    apply: resolveApply(),
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
