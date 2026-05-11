import react from "@vitejs/plugin-react";
import { removeAttributes } from "oxc-remove-attributes";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), removeAttributes({ attributes: ["data-testid", "data-cy"] })],
  build: {
    lib: {
      entry: "./entry.tsx",
      formats: ["es"],
      fileName: "out",
    },
    outDir: "dist",
    sourcemap: true,
    minify: false,
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime"],
    },
  },
});
