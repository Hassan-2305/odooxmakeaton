import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  server: {
    port: 3000,
    strictPort: true,
    proxy: { "/api": process.env.API_PROXY_TARGET ?? "http://localhost:4000" },
    // Bind-mounted sources on Docker Desktop (Windows/macOS) don't emit fs events.
    watch: process.env.VITE_USE_POLLING === "true" ? { usePolling: true, interval: 300 } : undefined,
  },
});
