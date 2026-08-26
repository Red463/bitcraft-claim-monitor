import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { validateGameAssetManifest } from "../dist-server/game-data/index.js";

const manifest = JSON.parse(await readFile(
  new URL("../assets/game-icons-manifest.json", import.meta.url),
  "utf8",
));
const publicRoot = fileURLToPath(new URL("../public/", import.meta.url));
const result = validateGameAssetManifest(manifest, publicRoot);
const manifestPaths = new Set(manifest.assets.map(({ localPath }) => String(localPath).replaceAll("\\", "/")));
const iconRoot = join(publicRoot, "game-icons");
const files = await readdir(iconRoot, { recursive: true, withFileTypes: true });
const publicIconPaths = files
  .filter((entry) => entry.isFile())
  .map((entry) => relative(publicRoot, join(entry.parentPath, entry.name)).replaceAll("\\", "/"));
const unexpectedFiles = publicIconPaths.filter((localPath) => !manifestPaths.has(localPath));
if (unexpectedFiles.length) {
  throw new Error(`Unmanifested game icon files: ${unexpectedFiles.slice(0, 10).join(", ")}`);
}
if (publicIconPaths.length !== manifestPaths.size) {
  throw new Error(
    `Game icon manifest/file count mismatch: ${manifestPaths.size} manifest entries, ${publicIconPaths.length} files`,
  );
}

console.log(JSON.stringify({ ok: true, ...result }, null, 2));
