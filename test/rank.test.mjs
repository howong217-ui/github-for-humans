import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mentionsAi, rankRepositories, scoreRepository } from "../src/rank.mjs";

const fixture = JSON.parse(await readFile(new URL("../fixtures/recent-repositories.json", import.meta.url)));
const now = new Date("2026-07-12T00:00:00Z");

test("AI-topic filtering leaves concrete non-AI tools", () => {
  const ranked = rankRepositories(fixture.items, { excludeAi: true, now });
  assert.deepEqual(ranked.map((repo) => repo.full_name), [
    "emdash-cms/emdash",
    "t8y2/dbx",
    "EpicGames/lore",
    "darrylmorley/whatcable",
    "AprilNEA/OpenLogi"
  ]);
});

test("ranking exposes evidence instead of a fraud verdict", () => {
  const scored = scoreRepository(fixture.items[0], now);
  assert.equal(typeof scored.evidenceScore, "number");
  assert.ok(scored.evidence.some((item) => item.label === "velocity"));
  assert.equal("isFake" in scored, false);
});

test("hyphenated AI product names are recognized", () => {
  assert.equal(mentionsAi({ full_name: "anthropics/claude-for-legal" }), true);
  assert.equal(mentionsAi({ full_name: "freestylefly/CodexGuide" }), true);
  assert.equal(mentionsAi({ full_name: "ideogram-oss/ideogram4", description: "Open image model" }), true);
  assert.equal(mentionsAi({ full_name: "perplexityai/bumblebee", description: "Package scanner" }), false);
});

test("account type does not influence evidence ranking", () => {
  const base = {
    full_name: "example/tool",
    created_at: "2025-01-01T00:00:00Z",
    pushed_at: "2026-07-10T00:00:00Z",
    stargazers_count: 100,
    forks_count: 10
  };
  const organization = scoreRepository({ ...base, owner: { type: "Organization" } }, now);
  const user = scoreRepository({ ...base, owner: { type: "User" } }, now);
  assert.equal(organization.evidenceScore, user.evidenceScore);
  assert.equal(organization.evidence.some((item) => item.label === "owner"), false);
});

test("custom topic filters are independent from the AI preset", () => {
  const ranked = rankRepositories(fixture.items, { excludeTerms: ["database"], now });
  assert.equal(ranked.some((repo) => repo.full_name === "t8y2/dbx"), false);
  assert.equal(ranked.some((repo) => repo.full_name === "JuliusBrussee/caveman"), true);
});
