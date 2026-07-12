import { readFile, writeFile } from "node:fs/promises";
import { buildSearchReport } from "./report.mjs";
import { searchGitHubRepositories } from "./github.mjs";

const args = process.argv.slice(2);

function option(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderHtml(report) {
  const cards = report.repositories.map((repo) => {
    const delta = repo.rankDelta > 0 ? `up ${repo.rankDelta}` : repo.rankDelta < 0 ? `down ${Math.abs(repo.rankDelta)}` : "unchanged";
    const evidence = repo.evidence
      .map((item) => `<li class="${item.impact < 0 ? "warn" : "good"}">${escapeHtml(item.label)}: ${escapeHtml(item.detail)}</li>`)
      .join("");
    return `<article><header><span>#${repo.evidenceRank}</span><strong>${escapeHtml(repo.full_name)}</strong><b>${escapeHtml(delta)}</b></header><p>${escapeHtml(repo.description ?? "No description")}</p><div>${repo.stargazers_count.toLocaleString()} stars · ${repo.forks_count.toLocaleString()} forks · GitHub rank #${repo.originalRank}</div><ul>${evidence}</ul></article>`;
  }).join("\n");

  return `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>GitHub for Humans report</title>
<style>
body{font:15px/1.45 ui-sans-serif,system-ui;max-width:980px;margin:40px auto;padding:0 20px;background:#f6f8fa;color:#1f2328}h1{margin-bottom:4px}.note{color:#59636e;margin-bottom:28px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px}article{background:white;border:1px solid #d0d7de;border-radius:10px;padding:16px;box-shadow:0 1px 0 #1f23280a}header{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center}header span{color:#59636e}header b{background:#ddf4ff;color:#0969da;border-radius:999px;padding:2px 8px}ul{padding-left:18px}.good{color:#116329}.warn{color:#9a6700}</style>
<h1>Find projects by evidence, not star count</h1>
<p class="note">${escapeHtml(report.query || "Local fixture")} · ${report.summary.outputCount}/${report.summary.inputCount} shown. Signals explain ranking; they are not verdicts.</p>
<main>${cards}</main></html>`;
}

async function main() {
  if (args.includes("--help") || args.length === 0) {
    console.log("Usage:\n  node src/cli.mjs <github-search.json> [options]\n  node src/cli.mjs --query \"pdf editor stars:>100\" [options]\n\nOptions:\n  --exclude-ai\n  --exclude-topics ai,crypto\n  --limit 30\n  --as-of 2026-07-12T00:00:00Z\n  --html report.html");
    return;
  }

  const liveQuery = option("--query");
  const inputPath = args[0]?.startsWith("--") ? null : args[0];
  if (!liveQuery && !inputPath) throw new Error("Provide a JSON file or --query.");

  const excludeTerms = (option("--exclude-topics") ?? "").split(",").filter(Boolean);
  const asOf = option("--as-of") ? new Date(option("--as-of")) : new Date();
  if (Number.isNaN(asOf.getTime())) throw new Error("--as-of must be a valid date.");

  let repositories;
  let query = "";
  if (liveQuery) {
    const search = await searchGitHubRepositories(liveQuery, {
      perPage: option("--limit") ?? 30,
      token: process.env.GITHUB_TOKEN
    });
    repositories = search.items;
    query = search.query;
  } else {
    const raw = JSON.parse(await readFile(inputPath, "utf8"));
    repositories = raw.items ?? raw;
    query = raw.query ?? "";
  }

  const report = buildSearchReport(repositories, {
    query,
    excludeAi: args.includes("--exclude-ai"),
    excludeTerms,
    now: asOf
  });
  const outputPath = option("--html");
  if (outputPath) {
    await writeFile(outputPath, renderHtml(report));
    console.log(`Wrote ${outputPath}: ${report.summary.outputCount}/${report.summary.inputCount} repositories shown`);
    return;
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
