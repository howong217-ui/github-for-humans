import test from "node:test";
import assert from "node:assert/strict";
import { GitHubSearchError, searchGitHubRepositories } from "../src/github.mjs";

test("GitHub search builds a bounded star-sorted request", async () => {
  let requestedUrl;
  const fetchImpl = async (url, options) => {
    requestedUrl = url;
    assert.equal(options.headers.accept, "application/vnd.github+json");
    return new Response(JSON.stringify({ total_count: 1, incomplete_results: false, items: [{ full_name: "example/tool" }] }), {
      status: 200,
      headers: { "content-type": "application/json", "x-ratelimit-limit": "10", "x-ratelimit-remaining": "9" }
    });
  };

  const result = await searchGitHubRepositories("pdf editor", { perPage: 500, fetchImpl });
  assert.equal(requestedUrl.searchParams.get("q"), "pdf editor");
  assert.equal(requestedUrl.searchParams.get("sort"), "stars");
  assert.equal(requestedUrl.searchParams.get("per_page"), "50");
  assert.equal(result.rateLimit.remaining, 9);
});

test("GitHub search rejects empty input before making a request", async () => {
  let called = false;
  await assert.rejects(
    searchGitHubRepositories(" ", { fetchImpl: async () => { called = true; } }),
    (error) => error instanceof GitHubSearchError && error.status === 400
  );
  assert.equal(called, false);
});

test("GitHub API errors preserve status and rate-limit context", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
    status: 403,
    headers: { "content-type": "application/json", "x-ratelimit-remaining": "0" }
  });
  await assert.rejects(
    searchGitHubRepositories("database client", { fetchImpl }),
    (error) => error.status === 403 && error.rateLimitRemaining === 0
  );
});
