import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const manifest = JSON.parse(await fs.readFile(path.join(root, "manifest.json"), "utf8"));
const pluginId = manifest.id;

if (!pluginId || typeof pluginId !== "string") {
  throw new Error("manifest.json must contain a string id.");
}

const releaseRoot = path.join(root, "release");
const pluginRoot = path.join(releaseRoot, pluginId);

await fs.rm(releaseRoot, { recursive: true, force: true });
await fs.mkdir(pluginRoot, { recursive: true });

for (const file of ["manifest.json", "main.js", "styles.css", "versions.json"]) {
  await fs.copyFile(path.join(root, file), path.join(pluginRoot, file));
}

process.stdout.write(`Prepared release folder at ${path.relative(root, pluginRoot)}\n`);
