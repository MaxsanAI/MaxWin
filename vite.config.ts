import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  return {
    // GitHub Pages preview uses /MaxWin/ by default; set VITE_BASE_PATH=/ on Cloudflare Pages.
    base: env.VITE_BASE_PATH || "/MaxWin/",
    plugins: [react()],
    build: { outDir: "dist", sourcemap: false }
  };
});
