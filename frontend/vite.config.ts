import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev-only: proxies /api straight to nginx (already published on :80), so
// the gateway never needs its own published port even for frontend
// development — same invariant as production, just exercised locally.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:80",
    },
  },
});
