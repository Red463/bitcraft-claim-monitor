import assert from "node:assert/strict";
import test from "node:test";

import { parseMemberPermissions } from "../shared/member-permissions.mjs";

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
