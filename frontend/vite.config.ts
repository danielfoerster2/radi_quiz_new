import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const backendTarget = "http://localhost:5000";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/auth": backendTarget,
      "/account": backendTarget,
      "/classes": backendTarget,
      "/quizzes": backendTarget,
      "/questions": backendTarget,
      "/amc": backendTarget,
      "/analysis": backendTarget,
      "/emails": backendTarget,
      "/support": backendTarget
    }
  }
});
