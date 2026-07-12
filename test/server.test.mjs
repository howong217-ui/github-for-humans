import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createAppServer } from "../src/server.mjs";

const fixture = JSON.parse(await readFile(new URL("../fixtures/recent-repositories.json", import.meta.url)));

async function withServer(fetchImpl, callback) {
  const server = createAppServer({ fetchImpl });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("server exposes health, static UI, and ranked JSON search", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({
    total_count: fixture.items.length,
    incomplete_results: false,
    items: fixture.items
  }), {
    status: 200,
    headers: { "content-type": "application/json", "x-ratelimit-remaining": "8" }
  });

  await withServer(fetchImpl, async (baseUrl) => {
    const health = await (await fetch(`${baseUrl}/api/health`)).json();
    assert.equal(health.ok, true);

    const page = await fetch(`${baseUrl}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Find maintained projects/);

    const response = await fetch(`${baseUrl}/api/search?q=developer+tools&exclude_ai=1&per_page=20`);
    const report = await response.json();
    assert.equal(response.status, 200);
    assert.equal(report.summary.inputCount, 8);
    assert.equal(report.summary.outputCount, 5);
    assert.equal(report.github.rateLimit.remaining, 8);
  });
});

test("server returns a useful validation error", async () => {
  await withServer(async () => { throw new Error("should not fetch"); }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/search?q=x`);
    const payload = await response.json();
    assert.equal(response.status, 400);
    assert.match(payload.error, /at least two/);
  });
});
