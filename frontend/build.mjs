// Bundles the React app into ./dist with esbuild.  npm run build | npm run watch
import * as esbuild from "esbuild";
import { cpSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";

const watch = process.argv.includes("--watch");
const keepSnapshot = existsSync("dist/snapshot.json") ? readFileSync("dist/snapshot.json") : null;
rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
cpSync("public", "dist", { recursive: true });
if (keepSnapshot && !existsSync("public/snapshot.json")) writeFileSync("dist/snapshot.json", keepSnapshot);
cpSync("index.html", "dist/index.html");

const options = {
  entryPoints: ["src/main.jsx"],
  bundle: true,
  minify: !watch,
  sourcemap: watch,
  outdir: "dist/assets",
  entryNames: "app",
  jsx: "automatic",
  loader: { ".woff2": "file", ".woff": "file", ".ttf": "file" },
  define: { "process.env.NODE_ENV": watch ? '"development"' : '"production"' },
  target: ["es2020"],
  logLevel: "info",
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log("Watching src/ ... (serve dist/ with the FastAPI server)");
} else {
  await esbuild.build(options);
}
