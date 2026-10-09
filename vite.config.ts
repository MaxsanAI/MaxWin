import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  // Cloudflare Pages serves from the domain root; GitHub Pages needs the repository subpath.
  const base = env.VITE_BASE_PATH || (process.env.CF_PAGES ? "/" : "/MaxWin/");
  return {
    base,
    plugins: [react()],
    build: { outDir: "dist", sourcemap: false }
  };
});
