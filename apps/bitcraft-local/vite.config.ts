import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const port = Number(process.env.PORT ?? 18428);
const bitjitaTarget = process.env.BITJITA_API_ORIGIN ?? "https://bitjita.com";
const localApiTarget = `http://127.0.0.1:${process.env.LOCAL_API_PORT ?? 18430}`;

export default defineConfig({
  plugins: [react()],
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
