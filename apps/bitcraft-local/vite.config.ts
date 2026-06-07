import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const port = Number(process.env.PORT ?? 18428);
const bitjitaTarget = process.env.BITJITA_API_ORIGIN ?? "https://bitjita.com";
const localApiTarget = `http://127.0.0.1:${process.env.LOCAL_API_PORT ?? 18430}`;

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("react-dom") || id.includes("/react/") || id.includes("\\react\\")) return "vendor-react";
          if (id.includes("lucide-react")) return "vendor-icons";
          return "vendor";
        },
      },
    },
  },
  server: {
    port,
    strictPort: true,
    proxy: {
      "/api/bitjita": {
        target: bitjitaTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/bitjita/, "/api"),
      },
      "/api/local": {
        target: localApiTarget,
        changeOrigin: true,
      },
    },
  },
});
