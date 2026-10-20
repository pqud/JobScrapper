import { build } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { rmSync, readdirSync, readFileSync, writeFileSync, existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const contentScripts = [
  "detail-extract", // 공통: innerText → 이미지 폴백
];

rmSync(resolve(root, "dist"), { recursive: true, force: true });

// 1) Content scripts: self-contained IIFE (no chunk imports — Chrome-safe)
for (const name of contentScripts) {
  await build({
    configFile: false,
    root,
    logLevel: "warn",
    build: {
      emptyOutDir: false,
      outDir: "dist",
      lib: {
        entry: resolve(root, `src/content-scripts/${name}.ts`),
        formats: ["iife"],
        name: name.replace(/[^a-zA-Z0-9]/g, "_"),
        fileName: () => `content-scripts/${name}.js`,
      },
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
          extend: true,
        },
      },
    },
  });
  console.log(`✓ content-scripts/${name}.js`);
}

// 2) Background + popup + dashboard
await build({
  configFile: false,
  root,
  plugins: [
    react(),
    tailwindcss(),
    viteStaticCopy({
      targets: [
        { src: "manifest.json", dest: "." },
        { src: "rules.json", dest: "." },
        { src: "src/popup/index.html", dest: "popup" },
        { src: "src/dashboard/index.html", dest: "dashboard" },
      ],
    }),
  ],
  build: {
    emptyOutDir: false,
    outDir: "dist",
    rollupOptions: {
      input: {
        background: resolve(root, "src/background/index.ts"),
        "popup/popup": resolve(root, "src/popup/main.tsx"),
        "dashboard/dashboard": resolve(root, "src/dashboard/main.tsx"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});

/** Vite emits CSS under assets/ but static-copied HTML never links it. */
function injectCss(htmlRel, cssPrefix) {
  const htmlPath = resolve(root, "dist", htmlRel);
  const assetsDir = resolve(root, "dist/assets");
  if (!existsSync(htmlPath) || !existsSync(assetsDir)) return;
  const css = readdirSync(assetsDir).find(
    (f) => f.startsWith(cssPrefix) && f.endsWith(".css")
  );
  if (!css) return;
  let html = readFileSync(htmlPath, "utf8");
  if (html.includes(css)) return;
  const link = `    <link rel="stylesheet" href="../assets/${css}" />\n`;
  html = html.replace("</head>", `${link}</head>`);
  writeFileSync(htmlPath, html);
  console.log(`✓ linked ${css} → ${htmlRel}`);
}

injectCss("dashboard/index.html", "dashboard");

console.log("✓ background.js + popup + dashboard");
console.log("Build complete → dist/");
