import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// In development, /api is proxied to the Express backend so the browser sees
// one origin (the session cookie stays first-party, no CORS needed).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: env.DEV_API_PROXY || "http://localhost:5000",
          changeOrigin: false,
        },
      },
    },
    build: {
      target: "es2020",
      sourcemap: false,
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules/three")) return "three";
            if (id.includes("node_modules/react") || id.includes("node_modules/scheduler")) return "react";
            return undefined;
          },
        },
      },
    },
  };
});
