import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "../dist/web",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": "http://localhost:3000",
      "/webhooks": "http://localhost:3000",
      "/health": "http://localhost:3000",
      "/debug": "http://localhost:3000",
    },
  },
});
