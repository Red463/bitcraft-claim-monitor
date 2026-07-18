import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const empiresPage = readFileSync(new URL("../src/pages/EmpiresPage.tsx", import.meta.url), "utf8");
const empiresCss = readFileSync(new URL("../src/styles/empires.css", import.meta.url), "utf8");

test("Empires owns its tabs, summary layout, table panel, and filter spacing", () => {
  assert.doesNotMatch(empiresPage, /leaderboard-tabs/);
  assert.match(empiresPage, /className="empires-tabs"/);
  assert.match(empiresCss, /\.empires-tabs\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*wrap;[^}]*gap:\s*8px;/s);
  assert.match(empiresCss, /\.empires-tabs button\s*\{/);
  assert.match(empiresCss, /\.empires-tabs button:hover,\s*\.empires-tabs button:focus-visible\s*\{/);
  assert.match(empiresCss, /\.empires-tabs button\.active\s*\{[^}]*color:\s*var\(--active-color\)/s);
  assert.match(empiresCss, /\.empires-page \.stats-grid\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\);[^}]*gap:\s*12px;/s);
  assert.match(empiresCss, /\.empires-page \.table-panel\s*\{[^}]*border:[^;}]+;[^}]*background:[^;}]+;[^}]*padding:[^;}]+;[^}]*display:\s*grid;[^}]*gap:\s*12px;/s);
  assert.match(empiresCss, /@media\s*\(max-width:\s*1250px\)\s*\{[^}]*\.empires-page \.stats-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(empiresCss, /@media\s*\(max-width:\s*560px\)\s*\{[^}]*\.empires-page \.stats-grid\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(empiresCss, /\.watchtower-filter-bar\s*\{[^}]*margin:\s*12px\s+0\s+10px;/s);
});

test("Empires renders a restricted state when every view is denied", () => {
  assert.match(empiresPage, /resolveAllowedView\(tab, empireTabs\.map\(\(entry\) => entry\.id\)\)/);
  assert.match(empiresPage, /No empire views are available for your account\./);
});

test("Empires contains wide tables on phones and names their keyboard scrollers", () => {
  const dataTable = readFileSync(new URL("../src/components/main/DataTable.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/styles/empires.css", import.meta.url), "utf8");

  assert.match(css, /\.empires-page\s*\{[^}]*min-width:\s*0/s);
  assert.match(css, /\.empires-page\s*>\s*\*\s*\{[^}]*min-width:\s*0/s);
  assert.match(css, /\.empires-page \.table-wrap\s*\{[^}]*max-width:\s*100%/s);
  assert.match(empiresPage, /scrollLabel="Regional empires table"/);
  assert.match(empiresPage, /scrollLabel="Watchtowers table"/);
  assert.match(dataTable, /scrollLabel:\s*string/);
  assert.match(dataTable, /tabIndex=\{0\}/);
  assert.match(dataTable, /aria-label=\{scrollLabel\}/);
});

test("watchtower dialog stays viewport bounded and renders all empire members", () => {
  const page = readFileSync(new URL("../src/pages/EmpiresPage.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/styles/empires.css", import.meta.url), "utf8");

  assert.match(page, /import \{ Dialog \} from "\.\.\/components\/main\/Dialog";/);
  assert.match(page, /<Dialog[\s\S]*tower-access-dialog[\s\S]*empires-watchtower-overlay/);
  assert.match(page, /rankFilters/);
  assert.match(page, /visibleMembers/);
  assert.match(page, /tower-rank-filter/);
  assert.match(page, /aria-label="Show all ranks"/);
  assert.match(page, /rankTitle \?\? "Citizen"/);
  assert.match(page, /const members:[\s\S]*tower\.members/);
  assert.match(page, /const openTowerDetails[\s\S]*setSelectedTower\([\s\S]*members:/);
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
  assert.match(page, /View tower details/);
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
