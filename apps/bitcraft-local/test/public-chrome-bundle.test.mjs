import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { build } from "vite";

test("the public production bundle loads the shared application chrome styles", async () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const result = await build({ root, logLevel: "silent", build: { write: false } });
  const output = Array.isArray(result) ? result.flatMap((entry) => entry.output) : result.output;
  const entryChunk = output.find((entry) => entry.type === "chunk" && entry.isEntry);

  assert.ok(entryChunk, "expected a production entry chunk");
  const importedCss = [...(entryChunk.viteMetadata?.importedCss ?? [])];
  const css = output
    .filter((entry) => entry.type === "asset" && importedCss.includes(entry.fileName))
    .map((entry) => String(entry.source))
    .join("\n");

  assert.match(css, /\.app-utility-bar\s*\{[^}]*display:\s*flex/s);
});
