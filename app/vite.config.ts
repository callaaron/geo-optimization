import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      // 开发时把 /api 转发到后端（node server/index.mjs，默认 8787）
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
});
