import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const script = new URL("../../deploy/update-bitcraft-monitor", import.meta.url);
const hasBash = process.platform !== "win32" && spawnSync("bash", ["--version"]).status === 0;

test("atomic switch and rollback restore the previous release", { skip: !hasBash }, () => {
  const root = mkdtempSync(join(tmpdir(), "bitcraft-deploy-"));
  const releases = join(root, "releases");
  const previous = join(releases, "previous");
  const candidate = join(releases, "candidate");
  const current = join(root, "current");

  const harness = `
    set -euo pipefail
    source "$1"
    APP_ROOT="$2"
    CURRENT_LINK="$2/current"
    mkdir -p "$2/releases/previous" "$2/releases/candidate"
    ln -s "releases/previous" "$CURRENT_LINK"
    atomic_switch "$2/releases/candidate"
    [[ "$(readlink -f "$CURRENT_LINK")" == "$2/releases/candidate" ]]
    previous_release="$2/releases/previous"
    install_release_config() { return 0; }
    restart_service() { return 0; }
    wait_for_service() { return 0; }
    wait_for_health() { return 0; }
    rollback_release "$previous_release"
    [[ "$(readlink -f "$CURRENT_LINK")" == "$2/releases/previous" ]]
  `;

  try {
    const result = spawnSync("bash", ["-c", harness, "test", script.pathname, root], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
