import assert from "node:assert/strict";
import test from "node:test";

import { memberClaimRole, isTrackedCoOwnerName } from "../src/utils/ownership.ts";

const claim = {
  ownerPlayerUsername: "Modular",
  members: [
    { userName: "Modular", coOwnerPermission: true },
    { userName: "Mosswick", coOwnerPermission: true },
    { userName: "Oddfawn", officerPermission: true },
  ],
};

test("memberClaimRole gives monitored settlement owner precedence over co-owner permission", () => {
  assert.equal(memberClaimRole(claim.members[0], claim), "Owner");
  assert.equal(memberClaimRole(claim.members[1], claim), "Co-owner");
  assert.equal(memberClaimRole(claim.members[2], claim), "Officer");
});

test("isTrackedCoOwnerName matches current monitored settlement co-owners but not the owner", () => {
  assert.equal(isTrackedCoOwnerName("Mosswick", claim), true);
  assert.equal(isTrackedCoOwnerName("Modular", claim), false);
  assert.equal(isTrackedCoOwnerName("Rocket", claim), false);
});

