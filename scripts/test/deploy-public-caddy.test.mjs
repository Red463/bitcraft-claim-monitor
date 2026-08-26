import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

let publicCaddy = null;
try {
  publicCaddy = await import("../../deploy/configure-public-caddy.mjs");
} catch {
  // RED: the protected public Caddy bootstrap does not exist yet.
}

const liveCaddy = `app.timbersteeltrade.com {
	reverse_proxy 127.0.0.1:19430 {
		header_up Host {host}
		header_up X-Forwarded-For {remote_host}
		header_up X-Forwarded-Host {host}
		header_up X-Forwarded-Proto {scheme}
	}
}

relay.timbersteeltrade.com {
	redir https://app.timbersteeltrade.com{uri} permanent
}
`;

const referenceCaddy = `${liveCaddy}
claim-monitor.com {
	reverse_proxy 127.0.0.1:19430 {
		header_up Host {host}
		header_up X-Forwarded-For {remote_host}
		header_up X-Forwarded-Host {host}
		header_up X-Forwarded-Proto {scheme}
	}
}

www.claim-monitor.com {
	redir https://claim-monitor.com{uri} permanent
}
`;

test("candidate merge preserves every live block and adds only the reviewed public hosts", () => {
  assert.ok(publicCaddy, "public Caddy bootstrap helper must exist");
  const candidate = publicCaddy.buildPublicCaddyCandidate(liveCaddy, referenceCaddy);

  assert.equal(candidate.changed, true);
  assert.equal(candidate.content.startsWith(liveCaddy), true);
  assert.equal(candidate.content.match(/^claim-monitor\.com \{/gm)?.length, 1);
  assert.equal(candidate.content.match(/^www\.claim-monitor\.com \{/gm)?.length, 1);
  assert.match(candidate.content, /reverse_proxy 127\.0\.0\.1:19430/);
  assert.match(candidate.content, /redir https:\/\/claim-monitor\.com\{uri\} permanent/);
  assert.match(candidate.content, /relay\.timbersteeltrade\.com/);
});

test("candidate merge is idempotent and refuses partial or unsafe live public routing", () => {
  assert.ok(publicCaddy, "public Caddy bootstrap helper must exist");
  const complete = publicCaddy.buildPublicCaddyCandidate(referenceCaddy, referenceCaddy);
  assert.deepEqual(complete, { content: referenceCaddy, changed: false });

  const apexOnly = referenceCaddy.replace(/\nwww\.claim-monitor\.com \{[\s\S]*?\n\}\n$/, "\n");
  assert.throws(
    () => publicCaddy.buildPublicCaddyCandidate(apexOnly, referenceCaddy),
    /partially configured/i,
  );
  assert.throws(
    () => publicCaddy.buildPublicCaddyCandidate(
      liveCaddy.replace("header_up X-Forwarded-Host {host}\n", ""),
      referenceCaddy,
    ),
    /forwarding headers/i,
  );
});

test("installation keeps a root-only backup and restores it when local verification fails", async () => {
  assert.ok(publicCaddy, "public Caddy bootstrap helper must exist");
  const root = mkdtempSync(join(tmpdir(), "claim-monitor-caddy-"));
  const livePath = join(root, "Caddyfile");
  const referencePath = join(root, "Caddyfile.example");
  writeFileSync(livePath, liveCaddy);
  writeFileSync(referencePath, referenceCaddy);

  try {
    await assert.rejects(
      publicCaddy.installPublicCaddyConfiguration({
        livePath,
        referencePath,
        backupDirectory: root,
        runCaddy: () => undefined,
        verifyLocalProfiles: async () => false,
        backupStamp: "test",
      }),
      /local profile verification failed/i,
    );
    assert.equal(readFileSync(livePath, "utf8"), liveCaddy);
    assert.equal(readFileSync(join(root, "Caddyfile.before-claim-monitor-test"), "utf8"), liveCaddy);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("successful installation is idempotent and does not replace its original backup", async () => {
  assert.ok(publicCaddy, "public Caddy bootstrap helper must exist");
  const root = mkdtempSync(join(tmpdir(), "claim-monitor-caddy-success-"));
  const livePath = join(root, "Caddyfile");
  const referencePath = join(root, "Caddyfile.example");
  writeFileSync(livePath, liveCaddy);
  writeFileSync(referencePath, referenceCaddy);

  try {
    const first = await publicCaddy.installPublicCaddyConfiguration({
      livePath,
      referencePath,
      backupDirectory: root,
      runCaddy: () => undefined,
      verifyLocalProfiles: async () => true,
      backupStamp: "success",
    });
    assert.equal(first.changed, true);
    assert.equal(readFileSync(first.backupPath, "utf8"), liveCaddy);
    assert.equal(readFileSync(livePath, "utf8").match(/^claim-monitor\.com \{/gm)?.length, 1);

    const second = await publicCaddy.installPublicCaddyConfiguration({
      livePath,
      referencePath,
      backupDirectory: root,
      runCaddy: () => undefined,
      verifyLocalProfiles: async () => true,
      backupStamp: "unused",
    });
    assert.deepEqual(second, { changed: false, backupPath: null });
    assert.equal(readFileSync(first.backupPath, "utf8"), liveCaddy);
    assert.equal(readFileSync(livePath, "utf8").match(/^claim-monitor\.com \{/gm)?.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
