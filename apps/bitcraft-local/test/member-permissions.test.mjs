import assert from "node:assert/strict";
import test from "node:test";

import { parseMemberPermissions } from "../shared/member-permissions.mjs";
import { readFileSync } from "node:fs";

test("parseMemberPermissions preserves boolean BitJita permission fields", () => {
  assert.deepEqual(parseMemberPermissions({
    coOwnerPermission: true,
    officerPermission: true,
    buildPermission: true,
    inventoryPermission: true,
  }), {
    coOwnerPermission: true,
    officerPermission: true,
    buildPermission: true,
    inventoryPermission: true,
  });
});

test("parseMemberPermissions handles numeric and string permission flags", () => {
  assert.deepEqual(parseMemberPermissions({
    permissions: {
      co_owner_permission: 1,
      officer_permission: "true",
      build_permission: "1",
      storage_permission: true,
    },
  }), {
    coOwnerPermission: true,
    officerPermission: true,
    buildPermission: true,
    inventoryPermission: true,
  });
});

test("parseMemberPermissions handles permission name lists", () => {
  assert.deepEqual(parseMemberPermissions({
    permissionFlags: ["Co Owner", "Build", "Storage"],
  }), {
    coOwnerPermission: true,
    officerPermission: false,
    buildPermission: true,
    inventoryPermission: true,
  });
});

test("Members exposes direct permission indicators without inferred role pills", () => {
  const page = readFileSync(new URL("../src/pages/MembersPage.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(page, /Can manage settlement/);
  assert.doesNotMatch(page, /Standard member/);
  assert.match(page, /Build permission .*granted.*not granted/);
  assert.match(page, /Inventory permission .*granted.*not granted/);
  assert.match(page, /View .* details/);
  assert.match(page, /type="button"/);
});
