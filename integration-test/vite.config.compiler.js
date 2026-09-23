import react from "@vitejs/plugin-react";
import { removeAttributes } from "oxc-remove-attributes";
import { defineConfig } from "vite";

// React Compiler enabled. `vite:react-compiler` is itself an `enforce: 'pre'`
// plugin that lowers JSX to jsx() calls, so removeAttributes() has to come
// first in the array to still see JSXAttribute nodes. Within one enforce
// bucket Vite keeps array order.
export default defineConfig({
  plugins: [
    removeAttributes({ attributes: ["data-testid", "data-cy"] }),
    react({ compiler: true }),
  ],
  build: {
    lib: {
      entry: "./entry.tsx",
      formats: ["es"],
      fileName: "out",
    },
    outDir: "dist-compiler",
    sourcemap: true,
    minify: false,
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime", "react/compiler-runtime"],
    },
  },
});
