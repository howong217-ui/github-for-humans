const MAX_RESULTS = 50;

export class GitHubSearchError extends Error {
  constructor(message, { status = 500, rateLimitRemaining = null } = {}) {
    super(message);
    this.name = "GitHubSearchError";
    this.status = status;
    this.rateLimitRemaining = rateLimitRemaining;
  }
}

function parseRateLimit(headers) {
  const value = headers.get("x-ratelimit-remaining");
  return value === null ? null : Number(value);
}

export async function searchGitHubRepositories(
  query,
  { perPage = 30, token, fetchImpl = fetch } = {}
) {
  const normalizedQuery = String(query ?? "").trim();
  if (normalizedQuery.length < 2) {
    throw new GitHubSearchError("Search query must contain at least two characters.", { status: 400 });
  }
  if (normalizedQuery.length > 256) {
    throw new GitHubSearchError("Search query must be 256 characters or fewer.", { status: 400 });
  }

  const limit = Math.min(MAX_RESULTS, Math.max(1, Number(perPage) || 30));
  const url = new URL("https://api.github.com/search/repositories");
  url.searchParams.set("q", normalizedQuery);
  url.searchParams.set("sort", "stars");
  url.searchParams.set("order", "desc");
  url.searchParams.set("per_page", String(limit));

  const headers = {
    accept: "application/vnd.github+json",
    "user-agent": "github-for-humans-local"
  };
  if (token) headers.authorization = `Bearer ${token}`;

  const response = await fetchImpl(url, { headers });
  const rateLimitRemaining = parseRateLimit(response.headers);
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new GitHubSearchError("GitHub returned an unreadable response.", {
      status: response.status,
      rateLimitRemaining
    });
  }

  if (!response.ok) {
    const fallback = response.status === 403
      ? "GitHub rate limit reached. Wait for reset or provide GITHUB_TOKEN locally."
      : "GitHub search failed.";
    throw new GitHubSearchError(payload.message || fallback, {
      status: response.status,
      rateLimitRemaining
    });
  }

  return {
    query: normalizedQuery,
    totalCount: payload.total_count ?? 0,
    incompleteResults: Boolean(payload.incomplete_results),
    items: payload.items ?? [],
    rateLimit: {
      limit: Number(response.headers.get("x-ratelimit-limit")) || null,
      remaining: rateLimitRemaining,
      reset: Number(response.headers.get("x-ratelimit-reset")) || null
    }
  };
}
