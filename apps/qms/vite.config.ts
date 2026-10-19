import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// PWA service worker + manifest (vite-plugin-pwa) is a Sprint 0 task (docs/tech/SPRINT_PLAN.md).
export default defineConfig({
  plugins: [react()],
});
