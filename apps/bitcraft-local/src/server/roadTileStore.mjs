import { mkdir, open, readFile, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";

const VERSION = /^g-\d+-\d+-\d+$/;

function within(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function writeJson(filePath, value) {
  const handle = await open(filePath, "w");
  try { await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8"); await handle.sync(); }
  finally { await handle.close(); }
}

export function createRoadTileStore({ dataDir, now = () => new Date() }) {
  const root = path.resolve(dataDir, "map-road-tiles");
  const versions = path.join(root, "versions");
  const pointerPath = path.join(root, "current.json");
  if (!within(path.resolve(dataDir), root)) throw new TypeError("Road tile store path escapes data directory");
  let current;

  async function readPointer() {
    if (current !== undefined) return current;
    try {
      const value = JSON.parse(await readFile(pointerPath, "utf8"));
      current = value && VERSION.test(value.version) ? value : null;
    } catch (error) {
      if (error?.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
      current = null;
    }
    return current;
  }

  async function prune() {
    let entries;
    try { entries = await readdir(versions, { withFileTypes: true }); }
    catch (error) { if (error?.code === "ENOENT") return; throw error; }
    for (const entry of entries) if (entry.isDirectory() && entry.name !== current?.version) {
      const target = path.resolve(versions, entry.name);
      if (within(versions, target)) await rm(target, { recursive: true, force: true });
    }
  }

  return {
    async install({ generation, regionIds, observedAt, bounds, tiles, featureCount }) {
      if (!/^\d+$/.test(String(generation))) throw new TypeError("Road generation must be a decimal integer");
      await mkdir(versions, { recursive: true });
      await readPointer();
      const stamp = now().getTime();
      const version = `g-${generation}-${stamp}-${process.pid}`;
      const staging = path.join(versions, `.staging-${version}`);
      const installed = path.join(versions, version);
      let totalBytes = 0;
      try {
        await mkdir(staging);
        for (const tile of tiles) {
          const bytes = Buffer.from(tile.bytes);
          totalBytes += bytes.byteLength;
          const directory = path.join(staging, "tiles", String(tile.z), String(tile.x));
          await mkdir(directory, { recursive: true });
          const handle = await open(path.join(directory, `${tile.y}.webp`), "wx");
          try { await handle.writeFile(bytes); } finally { await handle.close(); }
        }
        const manifest = {
          provider: "relay", generation: String(generation), generatedAt: now().toISOString(), observedAt,
          regionIds: [...new Set(regionIds.map(String))], dimension: "1", bounds,
          zoomRange: { min: -5, max: 0 }, tileCount: tiles.length, totalBytes, featureCount,
        };
        await writeJson(path.join(staging, "manifest.json"), manifest);
        await rename(staging, installed);
        const pointer = { version, manifest };
        const temporary = path.join(root, `.current-${process.pid}-${stamp}.tmp`);
        await writeJson(temporary, pointer);
        await rename(temporary, pointerPath);
        current = pointer;
        await prune();
        return { ...manifest };
      } catch (error) {
        await rm(staging, { recursive: true, force: true });
        throw error;
      }
    },
    async readManifest() { return (await readPointer())?.manifest ?? null; },
    async readTile({ style, z, x, y }) {
      if (style !== "roads") return null;
      const pointer = await readPointer();
      if (!pointer) return null;
      try {
        const target = path.resolve(versions, pointer.version, "tiles", String(z), String(x), `${y}.webp`);
        if (!within(path.join(versions, pointer.version), target)) return null;
        return { bytes: await readFile(target), contentType: "image/webp", generation: pointer.manifest.generation };
      } catch (error) {
        if (error?.code === "ENOENT") return null;
        throw error;
      }
    },
  };
}
