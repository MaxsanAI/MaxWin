import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  // Cloudflare Pages serves from the domain root. Other hosts can override this explicitly.
  const base = env.VITE_BASE_PATH || "/";
  return {
    base,
    plugins: [react()],
    build: { outDir: "dist", sourcemap: false }
  };
});
