import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const panel = readFileSync(new URL("../src/components/admin/AdminPanel.tsx", import.meta.url), "utf8");
const componentUrl = new URL("../src/components/admin/AdminEmpireMembershipSection.tsx", import.meta.url);
const stylesUrl = new URL("../src/styles/admin-empire-membership.css", import.meta.url);

test("AdminPanel exposes a focused Empire Membership Insights tab", () => {
  assert.equal(existsSync(componentUrl), true);
  assert.match(panel, /type AdminTab = [^;]*"empire-membership"/);
  assert.match(panel, /key: "empire-membership", label: "Empire Membership"/);
  assert.match(panel, /<AdminEmpireMembershipSection\b/);
});

test("membership page uses clear observed-history copy and bounded controls", () => {
  const component = readFileSync(componentUrl, "utf8");
  assert.match(component, /Present when tracking began/);
  assert.match(component, /Joined in last 30 days/);
  assert.match(component, /All current members/);
  assert.match(component, /Departed in last 30 days/);
  assert.match(component, /All retained departures/);
  assert.match(component, /Rejoined/);
  assert.doesNotMatch(component, /claim.*createdAt/i);
});

test("membership admin layout is responsive and does not require horizontal page scrolling", () => {
  const styles = readFileSync(stylesUrl, "utf8");
  assert.match(styles, /\.empire-membership-grid\s*\{[^}]*grid-template-columns/s);
  assert.match(styles, /minmax\(0,\s*1fr\)/);
  assert.match(styles, /@media\s*\(max-width:/);
  assert.match(styles, /overflow-wrap:\s*anywhere/);
});
