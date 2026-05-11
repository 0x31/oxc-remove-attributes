# oxc-remove-attributes

[![License](https://img.shields.io/github/license/0x31/oxc-remove-attributes?style=for-the-badge&labelColor=2e3440&color=6f4fbe)](https://github.com/0x31/oxc-remove-attributes/blob/main/LICENSE)
[![Version](https://img.shields.io/npm/v/oxc-remove-attributes.svg?label=Version&style=for-the-badge&labelColor=2e3440&color=eea837)](https://www.npmjs.com/package/oxc-remove-attributes)
[![Downloads](https://img.shields.io/npm/dw/oxc-remove-attributes?style=for-the-badge&labelColor=2e3440&color=50b6a9)](https://www.npmjs.com/package/oxc-remove-attributes)
[![Vite Badge](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=fff&style=for-the-badge)](https://vite.dev)
[![TypeScript Badge](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=fff&style=for-the-badge)](https://www.typescriptlang.org)

A Vite/Rolldown plugin that removes JSX attributes (e.g. `data-testid`) from production builds. Parses with [oxc](https://oxc.rs) and emits accurate sourcemaps via [magic-string](https://github.com/Rich-Harris/magic-string).

Intended as a replacement for `@swc/plugin-react-remove-properties` after the move from `@vitejs/plugin-react-swc` to the oxc-based `@vitejs/plugin-react` in Vite 8, where no oxc equivalent of that SWC plugin exists.

## Install

```bash
yarn add -D oxc-remove-attributes
```

or

```bash
npm i --save-dev oxc-remove-attributes
```

## Usage

In `vite.config.ts` or `vite.config.js`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { removeAttributes } from "oxc-remove-attributes";

export default defineConfig({
  plugins: [react(), removeAttributes()],
});
```

By default the plugin only runs during `vite build`, so `data-testid` attributes remain in dev and in `vite build --mode test` builds used by e2e suites.

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

## License

ISC
