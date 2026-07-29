import { resolve } from "node:path";

import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: false,
    minify: false,
    outDir: "dist-server/game-data/bindings",
    rollupOptions: {
      input: {
        global: resolve("src/server/game-data/bindings/global/index.ts"),
        regional: resolve("src/server/game-data/bindings/regional/index.ts"),
      },
      output: {
        chunkFileNames: "chunks/[name]-[hash].js",
        entryFileNames: "[name].js",
      },
    },
    sourcemap: true,
    ssr: true,
    target: "node22",
  },
});
