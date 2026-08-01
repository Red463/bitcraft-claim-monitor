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

test("Empires exposes live provider-neutral Hexite deposits without treating unknown rows as active", () => {
  const depositsPanel = readFileSync(new URL("../src/pages/empires/DepositsPanel.tsx", import.meta.url), "utf8");
  const appShell = readFileSync(new URL("../src/AppShell.tsx", import.meta.url), "utf8");

  assert.match(empiresPage, /id: "deposits" as const, label: "Hexite Deposits"/);
  assert.match(empiresPage, /<DepositsPanel data=\{providerData\} loading=\{providerLoading\} error=\{providerError\} monitoredRegionId=\{monitoredRegionId\}/);
  assert.match(appShell, /providerData=\{data\.raw\}/);
  assert.doesNotMatch(depositsPanel, /fetch\(|loadGameData/);
  assert.doesNotMatch(depositsPanel, /\/api\/bitjita|relay\.bitcraftsync\.app/i);
  assert.match(depositsPanel, /Unknown does not mean active or harvestable/);
  assert.match(depositsPanel, /scrollLabel="Hexite deposits table"/);
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

test("Empire overview presents one combined Hexite Reserves column", () => {
  assert.match(empiresPage, /\["Hexite Reserves",/);
  assert.doesNotMatch(empiresPage, /\["Hexite Energy",/);
  assert.doesNotMatch(empiresPage, /\["Capsules",/);
  assert.doesNotMatch(empiresPage, /\["Watchtower Energy",/);
  assert.match(empiresPage, /presentHexiteReserveSummary\(row\.hexiteReserves\)\.sortValue/);
  assert.match(empiresPage, /<details className="hexite-reserve-details">/);
  assert.match(empiresPage, /<summary>Details<\/summary>/);
  assert.match(empiresPage, /Live known minimum includes the Empire treasury, completed Foundry Capsules, and bounded configured-region player and claim inventories; incomplete regional coverage remains explicit\./);
  assert.match(empiresCss, /\.hexite-reserve-cell\s*\{[^}]*min-width:\s*230px/s);
  assert.match(empiresPage, /className=\{`hexite-reserve-cell \$\{presentation\.tone\}`\}/);
  assert.match(empiresCss, /\.hexite-reserve-cell\.danger\s*>\s*strong/);
  assert.match(empiresCss, /\.hexite-reserve-details summary:focus-visible/);
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

test("watchtower siege and empire names open semantic detail dialogs without triggering the row", () => {
  const page = readFileSync(new URL("../src/pages/EmpiresPage.tsx", import.meta.url), "utf8");

  assert.match(page, /className="status-pill danger siege-status-trigger"/);
  assert.match(page, /aria-label=\{[`"]View siege details/);
  assert.match(page, /event\.stopPropagation\(\);[\s\S]*setSelectedSiegeTower\(row\)/);
  assert.match(page, /className="empire-details-trigger"/);
  assert.match(page, /setSelectedEmpireId/);
  assert.match(page, /<SiegeDetailsDialog/);
  assert.match(page, /<EmpireDetailsDialog/);
  assert.match(page, /onBack=/);
  assert.doesNotMatch(page, /<span className="status-pill danger">Under Siege<\/span>/);
  assert.doesNotMatch(page, /formatNumber\(row\.siegeCount\)\} siege/);
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

test("siege and empire details use shared accessible dialogs with complete drilldown states", () => {
  const siegeDialog = readFileSync(new URL("../src/pages/empires/SiegeDetailsDialog.tsx", import.meta.url), "utf8");
  const empireDialog = readFileSync(new URL("../src/pages/empires/EmpireDetailsDialog.tsx", import.meta.url), "utf8");

  assert.match(siegeDialog, /<Dialog[\s\S]*open[\s\S]*title="Siege Details"/);
  assert.match(siegeDialog, /groupSiegeParticipants/);
  assert.match(siegeDialog, /Siege Duration/);
  assert.match(siegeDialog, /Siege Started/);
  assert.match(siegeDialog, /Attacking Empire/);
  assert.match(siegeDialog, /Defending Empire/);
  assert.match(siegeDialog, /onViewEmpire/);
  assert.match(siegeDialog, /Cancelled or removed sieges are unavailable from Relay/);
  assert.match(
    readFileSync(new URL("../src/pages/EmpiresPage.tsx", import.meta.url), "utf8"),
    /Recent Siege Outcomes/,
  );
  assert.match(
    readFileSync(new URL("../src/pages/EmpiresPage.tsx", import.meta.url), "utf8"),
    /attacker_won/,
  );
  assert.match(empiresCss, /\.siege-outcomes-panel/);
  assert.match(empiresCss, /\.siege-outcome-list/);

  assert.match(empireDialog, /\/empires\/details\?/);
  assert.match(empireDialog, /AbortController/);
  assert.match(empireDialog, /empireDetailsCache/);
  assert.match(empireDialog, /role="tablist"/);
  assert.match(empireDialog, /aria-selected=/);
  assert.match(empireDialog, /label: "Overview"/);
  assert.match(empireDialog, /label: "Members"/);
  assert.match(empireDialog, /label: "Claims"/);
  assert.match(empireDialog, /label: "Towers"/);
  assert.match(empireDialog, />Retry</);
  assert.match(empireDialog, /Back to Siege Details/);
  assert.match(empiresCss, /\.siege-status-trigger\s*\{[^}]*cursor:\s*pointer/s);
  assert.match(empiresCss, /\.empire-details-trigger:focus-visible/);
  assert.match(empiresCss, /\.siege-details-dialog,[\s\S]*\.empire-details-dialog[\s\S]*max-height:\s*calc\(100vh - 40px\)/);
  assert.match(empiresCss, /@media\s*\(max-width:\s*560px\)[\s\S]*\.siege-details-dialog,[\s\S]*\.empire-details-dialog\s*\{[^}]*width:\s*100%/s);
  assert.match(empiresCss, /\.empire-detail-tabs/);
  assert.match(empiresCss, /\.siege-participant-card\.attacker/);
  assert.match(empiresCss, /\.siege-participant-card\.defender/);
  assert.match(empiresCss, /@media\s*\(max-width:\s*900px\)[\s\S]*\.empire-detail-summary/s);
  assert.match(empiresCss, /@media\s*\(max-width:\s*560px\)[\s\S]*\.empire-detail-summary/s);
});
