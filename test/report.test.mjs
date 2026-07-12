import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildSearchReport } from "../src/report.mjs";

const fixture = JSON.parse(await readFile(new URL("../fixtures/recent-repositories.json", import.meta.url)));
const now = new Date("2026-07-12T00:00:00Z");

test("report preserves GitHub rank and explains evidence rank movement", () => {
  const report = buildSearchReport(fixture.items, { now, excludeAi: true, query: "developer tools" });
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.query, "developer tools");
  assert.equal(report.summary.inputCount, 8);
  assert.equal(report.summary.outputCount, 5);
  assert.ok(report.repositories.every((repo) => Number.isInteger(repo.originalRank)));
  assert.ok(report.repositories.every((repo) => repo.rankDelta === repo.originalRank - repo.evidenceRank));
});

test("report output is deterministic for a fixed timestamp", () => {
  const options = { now, excludeTerms: ["database"] };
  assert.deepEqual(buildSearchReport(fixture.items, options), buildSearchReport(fixture.items, options));
});
