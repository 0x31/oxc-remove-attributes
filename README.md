# oxc-remove-attributes

Strip JSX attributes (e.g. `data-testid`) from your production bundle using **oxc** + **magic-string**.

Built for Vite 8 / `@vitejs/plugin-react` (oxc) where the old `@swc/plugin-react-remove-properties` story no longer applies. Works on any Vite ≥5, and on Rolldown directly.

## Why

If you removed `@vitejs/plugin-react-swc` in favour of the new oxc-based `@vitejs/plugin-react`, you lost access to `@swc/plugin-react-remove-properties` — there is no oxc equivalent. This plugin fills that gap without dragging Babel or SWC back into your build:

- ⚡ **Native parser** — oxc (Rust/NAPI), same family as Vite 8 internals
- 🗺️ **Real sourcemaps** — surgical removals via `magic-string`, so Sentry stack-trace columns stay accurate
- 🧠 **AST-based** — no regex edge cases, handles arbitrarily nested expressions
- 🪶 **Tiny** — single transform hook, ~120 lines, no Babel, no SWC
- 🔁 **Runtime-agnostic** — operates on raw JSX, works with classic _and_ automatic JSX runtimes

## Install

```sh
npm install -D oxc-remove-attributes
```

## Usage

```ts
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { removeAttributes } from "oxc-remove-attributes";

export default defineConfig({
  plugins: [
    react(),
    removeAttributes(), // strips data-testid by default, only on `vite build`
  ],
});
```

By default the plugin only runs during `vite build`, so test IDs stay live during `vite dev` and (importantly) for `vite build --mode test` builds used by e2e suites.

## Options

```ts
removeAttributes({
  // Attribute names to remove (exact match).
  attributes: ["data-testid"],

  // File extensions to scan.
  extensions: [".tsx", ".jsx"],

  // When this plugin runs in the Vite pipeline.
  enforce: "pre",

  // Active in 'build', 'serve', or 'both'.
  apply: "build",
});
```

### Strip multiple attributes

```ts
removeAttributes({
  attributes: ["data-testid", "data-cy", "data-test"],
});
```

### Always active (incl. dev server)

```ts
removeAttributes({ apply: "both" });
```

## How it compares

| Plugin                                | Parser                      | Sourcemap               | JSX-runtime coupled  | Babel/SWC dep              |
| ------------------------------------- | --------------------------- | ----------------------- | -------------------- | -------------------------- |
| `oxc-remove-attributes` (this)        | oxc                         | High-res (magic-string) | No                   | No                         |
| `@swc/plugin-react-remove-properties` | SWC                         | n/a (in-process)        | No                   | SWC                        |
| `rollup-plugin-jsx-remove-attributes` | Vite's `this.parse` (acorn) | Lower (astring regen)   | Yes (`_jsx`/`_jsxs`) | No                         |
| `vite-plugin-react-remove-attributes` | Inlined astring             | —                       | —                    | No (peerDep `vite ^2.4.4`) |
| `remove-attr`                         | Regex                       | None                    | No                   | No                         |

## License

ISC © 0x31
