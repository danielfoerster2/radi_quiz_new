import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/auth": "http://localhost:5000",
      "/emails": "http://localhost:5000",
      "/support": "http://localhost:5000"
    }
  }
});
