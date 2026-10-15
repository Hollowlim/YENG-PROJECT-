import { build } from "esbuild";
import { loadEnv } from "vite";
import { readFile, writeFile, mkdir, cp } from "node:fs/promises";
const env = loadEnv("production", process.cwd(), "VITE_");
const result = await build({
  entryPoints: ["app.js"],
  bundle: true,
  format: "iife",
  minify: true,
  write: false,
  outdir: "sample-build",
  loader: { ".woff": "dataurl", ".woff2": "dataurl" },
  define: { "import.meta.env": JSON.stringify(env) },
});
const js = result.outputFiles
  .find((f) => f.path.endsWith(".js"))
  .text.replaceAll("/assets/", "./public/assets/")
  .replace(
    /[\x00-\x08\x0B\x0C\x0E-\x1F]/g,
    (char) => "\\x" + char.charCodeAt(0).toString(16).padStart(2, "0"),
  );
const fonts =
  result.outputFiles.find((f) => f.path.endsWith(".css"))?.text || "";
const css = await readFile("styles.css", "utf8");
let html = await readFile("source.html", "utf8");
html = html
  .replace(
    '<link rel="stylesheet" href="/styles.css" />',
    `<style>${fonts}\n${css}</style>`,
  )
  .replace(
    '<script type="module" src="/app.js"></script>',
    () => `<script>${js.replaceAll("</script", "<\\/script")}</script>`,
  );
await writeFile("index.html", html);
await mkdir("dist", { recursive: true });
await writeFile("dist/index.html", html);
await cp("public", "dist/public", { recursive: true });
console.log(
  "Built index.html: double-click to open. No server or npm needed to view the sample.",
);
