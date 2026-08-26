import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const updater = readFileSync(new URL("../../deploy/update-bitcraft-claim-monitor-relay", import.meta.url), "utf8");
let workflow = "";
try {
  workflow = readFileSync(new URL("../../.github/workflows/install-public-oauth-credentials.yml", import.meta.url), "utf8");
} catch {
  // RED: the protected credential workflow does not exist yet.
}

test("restricted updater exposes a revision-bound public OAuth credential mode", () => {
  assert.match(updater, /--install-public-oauth-credentials/);
  assert.match(updater, /public-oauth-credentials-v1/);
  assert.match(updater, /PUBLIC_OAUTH_HELPER_PATH=.*install-public-oauth-credentials\.mjs/);
  assert.match(updater, /delegate_public_oauth_mode\(\)/);
  assert.match(updater, /Public OAuth credential installation requires the active deployed revision/);
  assert.match(updater, /stage_public_oauth_helper "\$active_release" "\$bootstrap_root"/);
  assert.match(updater, /show "\$REVISION:deploy\/install-public-oauth-credentials\.mjs"/);
  assert.match(updater, /BITCRAFT_PUBLIC_OAUTH_UPDATER=1/);
  assert.match(updater, /install -o root -g root -m 0755[\s\S]*install-public-oauth-credentials\.mjs/);
});

test("public OAuth credential workflow is manual, approved, stdin-only, and leaves gates disabled", () => {
  assert.match(workflow, /^name: Install public Claim Monitor OAuth credentials$/m);
  assert.match(workflow, /workflow_dispatch:[\s\S]*confirmation:[\s\S]*type: string/);
  assert.match(workflow, /GITHUB_REF.*refs\/heads\/main/);
  assert.match(workflow, /approve:[\s\S]*environment: relay-cutover/);
  assert.match(workflow, /install:[\s\S]*environment: relay-preview/);
  assert.match(workflow, /PUBLIC_DISCORD_OAUTH_CLIENT_ID:.*secrets\.PUBLIC_DISCORD_OAUTH_CLIENT_ID/);
  assert.match(workflow, /PUBLIC_DISCORD_OAUTH_CLIENT_SECRET:.*secrets\.PUBLIC_DISCORD_OAUTH_CLIENT_SECRET/);
  assert.match(workflow, /public-oauth-credentials-v1/);
  assert.match(workflow, /node -e[\s\S]*JSON\.stringify[\s\S]*\| ssh/);
  assert.match(workflow, /--install-public-oauth-credentials --confirmation 'claim-monitor\.com'/);
  assert.match(workflow, /publicProfileEnabled === false/);
  assert.match(workflow, /publicCollaborationEnabled === false/);
  assert.match(workflow, /publicLegalConfigurationConfirmed === false/);
  assert.doesNotMatch(workflow, /--client-id|--client-secret|echo .*PUBLIC_DISCORD|printenv|set -x/);
});
