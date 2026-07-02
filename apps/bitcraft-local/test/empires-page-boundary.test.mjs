import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("watchtower dialog stays viewport bounded and renders all empire members", () => {
  const page = readFileSync(new URL("../src/pages/EmpiresPage.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/styles/empires.css", import.meta.url), "utf8");

  assert.match(page, /import \{ createPortal \} from "react-dom";/);
  assert.match(page, /return createPortal\(/);
  assert.match(page, /document\.body/);
  assert.match(page, /rankFilters/);
  assert.match(page, /visibleMembers/);
  assert.match(page, /tower-rank-filter/);
  assert.match(page, /aria-label="Show all ranks"/);
  assert.match(page, /const members:[\s\S]*tower\.members/);
  assert.match(page, /setSelectedTower\(\{ \.\.\.row, members:/);
  assert.doesNotMatch(page, /No storage or hexite-capable members were returned/);
  assert.match(css, /\.empires-watchtower-overlay \{/);
  assert.match(css, /\.tower-rank-filter \{/);
  assert.match(css, /\.tower-rank-filter button\.active/);
  assert.match(css, /position:\s*fixed/);
  assert.match(css, /align-items:\s*center/);
  assert.match(css, /max-height:\s*calc\(100vh - 40px\)/);
});

test("watchtower table exposes empire and risk filters with open-map actions", () => {
  const page = readFileSync(new URL("../src/pages/EmpiresPage.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/styles/empires.css", import.meta.url), "utf8");

  assert.match(page, /empires\.watchtowerEmpire/);
  assert.match(page, /empires\.watchtowerRiskOnly/);
  assert.match(page, /watchtower-empire-filter/);
  assert.match(page, /watchtower-risk-toggle/);
  assert.match(page, /At risk only/);
  assert.match(page, /Open on map/);
  assert.match(page, /\["Map",/);
  assert.doesNotMatch(page, /\["Coordinates"/);
  assert.doesNotMatch(page, /\["Map coords"/);
  assert.doesNotMatch(page, /BitJita exposes map coordinates for claimed towers/);
  assert.doesNotMatch(page, /Unclaimed watchtowers are not exposed/);
  assert.doesNotMatch(page, /Copy map coordinates/);
  assert.match(css, /\.watchtower-filter-bar/);
  assert.match(css, /\.watchtower-empire-filter/);
  assert.match(css, /\.watchtower-risk-toggle/);
  assert.match(css, /\.inactivity-threshold-card/);
});
test("watchtower popup exposes aligned claims and lazy claim member drilldown", () => {
  const page = readFileSync(new URL("../src/pages/EmpiresPage.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/styles/empires.css", import.meta.url), "utf8");

  assert.match(page, /Empire Members/);
  assert.match(page, /Aligned Claims/);
  assert.match(page, /towerDialogTab/);
  assert.match(page, /tower\.claims/);
  assert.match(page, /claimDistanceTiles/);
  assert.match(page, /tiles away/);
  assert.match(page, /selectedClaim/);
  assert.match(page, /empires\/claim-members\?claimId=/);
  assert.match(page, /ClaimMembersDialog/);
  assert.match(page, /Empire rank:/);
  assert.match(page, /Claim role:/);
  assert.match(page, /claimRole/);
  assert.match(page, /empireRankTitle/);
  assert.match(page, /Claim roles/);
  assert.match(css, /\.tower-dialog-tabs/);
  assert.match(css, /\.tower-claims-list/);
  assert.match(css, /\.claim-member-dialog/);
});
