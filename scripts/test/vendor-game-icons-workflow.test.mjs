import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL("../../.github/workflows/vendor-game-icons.yml", import.meta.url);

test("game icon vendoring runs remotely with bounded memory and publishes an artifact", async () => {
  const workflow = await readFile(workflowUrl, "utf8");

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /test "\$GITHUB_REF" = "refs\/heads\/main"/);
  assert.match(workflow, /node-version:\s*24/);
  assert.match(workflow, /corepack pnpm --filter @workspace\/bitcraft-local run build:server/);
  assert.match(workflow, /node --max-old-space-size=512 apps\/bitcraft-local\/scripts\/vendor-relay-game-icons\.mjs --source-origin=https:\/\/bitjita\.com/);
  assert.match(workflow, /corepack pnpm --filter @workspace\/bitcraft-local run verify:assets/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /apps\/bitcraft-local\/assets\/game-icons-manifest\.json/);
  assert.match(workflow, /apps\/bitcraft-local\/public\/game-icons/);
  assert.doesNotMatch(workflow, /git push|contents:\s*write|pull-requests:\s*write/);
});
