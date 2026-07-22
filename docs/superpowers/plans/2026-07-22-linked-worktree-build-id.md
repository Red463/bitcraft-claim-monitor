# Linked Worktree Build ID Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore browser update detection after staged GitHub deployments by resolving the deployed revision from linked Git worktree metadata.

**Architecture:** Extend the existing server release helper at its current filesystem boundary. Environment revisions remain authoritative; the Git fallback learns to resolve a `.git` pointer file before reading `HEAD`, while every existing caller and frontend polling behavior remains unchanged.

**Tech Stack:** Node.js 24, ES modules, `node:path`, Node test runner.

## Global Constraints

- Preserve the `/api/local/health` response shape and existing frontend polling behavior.
- Do not change the deployment workflow, systemd environment, application version, or database.
- Treat missing, malformed, or unreadable Git metadata as an unavailable build ID rather than a server error.
- For the filesystem fallback, use the first 12 characters only after resolving a valid 40-character Git revision; preserve existing environment-variable behavior.

---

### Task 1: Resolve build IDs from linked worktrees

**Files:**
- Modify: `apps/bitcraft-local/src/server/appRelease.mjs`
- Test: `apps/bitcraft-local/test/server-app-release.test.mjs`

**Interfaces:**
- Consumes: `currentAppBuildId({ env, repoRoot, readFileSync, joinPath })` and Git's `.git` pointer-file format.
- Produces: `currentAppBuildId({ env, repoRoot, readFileSync, joinPath, isAbsolutePath, resolvePath }): string`, preserving all current call sites through defaults.

- [ ] **Step 1: Add the failing linked-worktree regression test**

Add a test that models both absolute and relative Git directory pointers:

```js
test("currentAppBuildId follows linked worktree gitdir pointers", () => {
  const revision = "abcdef1234567890abcdef1234567890abcdef12";
  const absoluteReads = new Map([
    ["C:/release/.git", "gitdir: C:/source/.git/worktrees/release-abc\n"],
    ["C:/source/.git/worktrees/release-abc/HEAD", `${revision}\n`],
  ]);
  const relativeReads = new Map([
    ["C:/release/.git", "gitdir: ../source/.git/worktrees/release-abc\n"],
    ["C:/source/.git/worktrees/release-abc/HEAD", `${revision}\n`],
  ]);
  const options = (reads, isAbsolutePath, resolvePath) => ({
    env: {},
    repoRoot: "C:/release",
    readFileSync: (filePath) => {
      if (!reads.has(filePath)) throw new Error(`Missing fixture path: ${filePath}`);
      return reads.get(filePath);
    },
    joinPath: (...parts) => parts.join("/"),
    isAbsolutePath,
    resolvePath,
  });

  assert.equal(currentAppBuildId(options(absoluteReads, (value) => value.startsWith("C:/"), (root, value) => `${root}/${value}`)), "abcdef123456");
  assert.equal(currentAppBuildId(options(relativeReads, () => false, () => "C:/source/.git/worktrees/release-abc")), "abcdef123456");
});
```

- [ ] **Step 2: Run the focused test and verify the production symptom is caught**

Run:

```sh
node --experimental-strip-types --test apps/bitcraft-local/test/server-app-release.test.mjs
```

Expected: FAIL because the resolver attempts `<release>/.git/HEAD` and returns an empty build ID for pointer-file worktrees.

- [ ] **Step 3: Implement the minimal Git-directory resolution**

Add injectable path helpers and resolve the `.git` pointer before the existing `HEAD` logic:

```js
export function currentAppBuildId({
  env = process.env,
  repoRoot = "",
  readFileSync = defaultReadFileSync,
  joinPath = path.join,
  isAbsolutePath = path.isAbsolute,
  resolvePath = path.resolve,
} = {}) {
  const envRevision = String(env.SOURCE_VERSION ?? env.RENDER_GIT_COMMIT ?? env.GITHUB_SHA ?? "").trim();
  if (envRevision) return envRevision.slice(0, 12);
  try {
    let gitDir = joinPath(repoRoot, ".git");
    try {
      const pointer = readFileSync(gitDir, "utf8").trim();
      if (/^gitdir:/i.test(pointer)) {
        const target = pointer.slice(pointer.indexOf(":") + 1).trim();
        if (!target) return "";
        gitDir = isAbsolutePath(target) ? target : resolvePath(repoRoot, target);
      }
    } catch {
      // A normal checkout has a .git directory rather than a pointer file.
    }
    const head = readFileSync(joinPath(gitDir, "HEAD"), "utf8").trim();
    if (head.startsWith("ref:")) {
      const refPath = head.slice(5).trim();
      const full = readFileSync(joinPath(gitDir, refPath), "utf8").trim();
      return /^[a-f0-9]{40}$/i.test(full) ? full.slice(0, 12) : "";
    }
    if (/^[a-f0-9]{40}$/i.test(head)) return head.slice(0, 12);
  } catch {}
  return "";
}
```

- [ ] **Step 4: Run the focused release tests and real-worktree reproduction**

Run:

```sh
node --experimental-strip-types --test apps/bitcraft-local/test/server-app-release.test.mjs
node --input-type=module -e "import { currentAppBuildId } from './apps/bitcraft-local/src/server/appRelease.mjs'; const buildId = currentAppBuildId({ env: {}, repoRoot: process.cwd() }); console.log(buildId); if (!/^[a-f0-9]{12}$/.test(buildId)) process.exit(1);"
```

Expected: all focused tests pass and the current linked worktree prints a 12-character revision.

- [ ] **Step 5: Run production verification**

Run:

```sh
corepack pnpm --filter @workspace/bitcraft-local run build
corepack pnpm --filter @workspace/bitcraft-local test
```

Expected: production build exits zero and the complete app test suite reports zero failures.

- [ ] **Step 6: Commit the fix**

```sh
git add apps/bitcraft-local/src/server/appRelease.mjs apps/bitcraft-local/test/server-app-release.test.mjs
git commit -m "fix: resolve staged release build ids"
```
