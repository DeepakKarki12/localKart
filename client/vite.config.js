import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
const apiTarget = process.env.API_PROXY_TARGET || "http://127.0.0.1:5000";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: { "/api": apiTarget, "/socket.io": { target: apiTarget, ws: true } },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/zod")) return "validation";
          if (
            id.includes("node_modules") &&
            /react-dom|react-router|node_modules\/react\//.test(id)
          )
            return "react-vendor";
        },
      },
    },
  },
});
