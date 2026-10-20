import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        { src: "manifest.json", dest: "." },
        { src: "src/popup/index.html", dest: "popup" },
      ],
    }),
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, "src/background/index.ts"),
        "content-scripts/jobkorea-scrap": resolve(
          __dirname,
          "src/content-scripts/jobkorea-scrap.ts"
        ),
        "content-scripts/wanted-scrap": resolve(
          __dirname,
          "src/content-scripts/wanted-scrap.ts"
        ),
        "content-scripts/jobplanet-scrap": resolve(
          __dirname,
          "src/content-scripts/jobplanet-scrap.ts"
        ),
        "content-scripts/gamejob-scrap": resolve(
          __dirname,
          "src/content-scripts/gamejob-scrap.ts"
        ),
        "content-scripts/webapp-bridge": resolve(
          __dirname,
          "src/content-scripts/webapp-bridge.ts"
        ),
        "popup/popup": resolve(__dirname, "src/popup/main.tsx"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
