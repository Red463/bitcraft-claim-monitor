import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const productionPage = readFileSync(new URL("../src/pages/ProductionPage.tsx", import.meta.url), "utf8");

function jsxPresentationCopy(source) {
  const normalized = source.replaceAll("\r\n", "\n");
  const copy = [];
  for (const match of normalized.matchAll(/\breturn\s*\(\s*\n(?=\s*<)/g)) {
    const end = normalized.indexOf("\n  );\n}", match.index);
    assert.notEqual(end, -1, "JSX return boundary must be complete");
    const jsx = normalized.slice(match.index, end)
      .replace(/\b(?:className|key|data-[\w-]+|aria-[\w-]+)=\{?(?:"[^"]*"|`[^`]*`)\}?/g, "");
    for (const text of jsx.matchAll(/>([^<>{}]+)</g)) copy.push(text[1]);
    for (const literal of jsx.matchAll(/"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|`((?:\\.|[^`\\])*)`/g)) {
      copy.push(literal[1] ?? literal[2] ?? literal[3]);
    }
  }
  return copy.join(" ");
}

const technicalConcepts = [
  ["Relay", /\bRelay\b/i, "Current craft details supplied by Relay"],
  ["data joins", /\bdata[-\s]+join\b|\b(?:data|details?|members?|structures?|names?)\b.{0,40}\bjoin(?:ed|ing)\b|\bjoin(?:ed|ing)\b.{0,40}\b(?:data|details?|members?|structures?|names?)\b/i, "Member names joined from related data"],
  ["provider data", /\bprovider(?:'s)?\b.{0,40}\b(?:data|details?|records?|crafts?|members?|markers?)\b|\b(?:data|details?|records?|crafts?|members?|markers?)\b.{0,40}\bprovider\b/i, "Craft records returned by the provider"],
  ["provider markers", /\b(?:public[-\s]?crafts?|visibility|provider)\b.{0,30}\bmarker\b|\bmarker\b.{0,30}\b(?:public[-\s]?crafts?|visibility|provider)\b/i, "Waiting for the visibility marker"],
  ["member-scoped data", /\bmember[-\s]?scoped\b/i, "Member scoped craft data"],
  ["observation windows", /\bobservation[-\s]+window\b|\b(?:contributor|contribution)(?:\s+activity)?\b.{0,40}\bobserv(?:e|ed|ation)\b|\bobserved since\b|\btracking became available\b/i, "Contribution activity observed since the observation window opened"],
];

test("Craft Monitor uses operational contributor copy while retaining attribution evidence", () => {
  const presentationCopy = jsxPresentationCopy(productionPage);

  assert.match(presentationCopy, /No contribution activity recorded\./);
  assert.match(presentationCopy, /Matched action/);
  assert.match(presentationCopy, /Craft owner/);

  for (const [concept, pattern, example] of technicalConcepts) {
    assert.match(example, pattern, `${concept} boundary must detect representative technical copy`);
    assert.doesNotMatch(presentationCopy, pattern, `normal-user Craft Monitor copy must not expose ${concept}`);
  }
});

test("Craft Monitor copy boundary ignores diagnostics and ordinary operational language", () => {
  const source = `const diagnostic = "Relay provider marker observation window";
export function Example() {
  return (
    <div title="Join the current crafting group">Place a map marker for members.</div>
  );
}`;
  const presentationCopy = jsxPresentationCopy(source);

  assert.match(presentationCopy, /Join the current crafting group/);
  assert.match(presentationCopy, /map marker/);
  for (const [concept, pattern] of technicalConcepts) {
    assert.doesNotMatch(presentationCopy, pattern, `boundary must not reject ordinary ${concept} wording`);
  }
});
