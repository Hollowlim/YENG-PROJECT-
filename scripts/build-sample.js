import { build } from "esbuild";
import { loadEnv } from "vite";
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { readFile, writeFile, mkdir, cp } from "node:fs/promises";
const { values: buildOptions } = parseArgs({
  options: {
    demo: { type: "boolean", default: false },
    "out-dir": { type: "string" },
  },
});
// Demo tests must never fall through to the project's public live defaults.
const env = buildOptions.demo
  ? { VITE_SUPABASE_URL: "", VITE_SUPABASE_PUBLISHABLE_KEY: "" }
  : loadEnv("production", process.cwd(), "VITE_");
const result = await build({
  entryPoints: ["app.js"],
  bundle: true,
  jsx: "automatic",
  format: "iife",
  minify: true,
  write: false,
  outdir: "sample-build",
  loader: { ".woff": "dataurl", ".woff2": "dataurl", ".png": "dataurl" },
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
if (buildOptions["out-dir"]) {
  const target = resolve(buildOptions["out-dir"]);
  await mkdir(target, { recursive: true });
  await writeFile(resolve(target, "index.html"), html);
  await cp("public", resolve(target, "public"), { recursive: true });
  console.log(`Built ${target}/index.html${buildOptions.demo ? " (isolated demo)" : ""}.`);
} else {
  await writeFile("index.html", html);
  await mkdir("dist", { recursive: true });
  await writeFile("dist/index.html", html);
  await cp("public", "dist/public", { recursive: true });
  console.log("Built index.html and dist. Open index.html to view the website.");
}
