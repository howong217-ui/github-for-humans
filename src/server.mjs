import { createServer as createHttpServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSearchReport } from "./report.mjs";
import { GitHubSearchError, searchGitHubRepositories } from "./github.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PUBLIC = join(ROOT, "public");
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function parseBoolean(value) {
  return value === "1" || value === "true";
}

export function createAppServer({ fetchImpl = fetch, token = process.env.GITHUB_TOKEN } = {}) {
  return createHttpServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");
      if (url.pathname === "/api/health") {
        sendJson(response, 200, { ok: true, service: "github-for-humans" });
        return;
      }

      if (url.pathname === "/api/search") {
        const query = url.searchParams.get("q");
        const excludeTerms = (url.searchParams.get("exclude_topics") ?? "").split(",").filter(Boolean);
        const search = await searchGitHubRepositories(query, {
          perPage: url.searchParams.get("per_page") ?? 30,
          token,
          fetchImpl
        });
        const now = new Date();
        const report = buildSearchReport(search.items, {
          query: search.query,
          excludeAi: parseBoolean(url.searchParams.get("exclude_ai")),
          excludeTerms,
          now
        });
        sendJson(response, 200, {
          ...report,
          github: {
            totalCount: search.totalCount,
            incompleteResults: search.incompleteResults,
            rateLimit: search.rateLimit
          }
        });
        return;
      }

      const requested = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      const safePath = normalize(requested).replace(/^(\.\.[/\\])+/, "");
      const filePath = join(PUBLIC, safePath);
      if (!filePath.startsWith(PUBLIC)) {
        sendJson(response, 404, { error: "Not found" });
        return;
      }
      const body = await readFile(filePath);
      response.writeHead(200, {
        "content-type": MIME_TYPES[extname(filePath)] ?? "application/octet-stream",
        "cache-control": "no-cache"
      });
      response.end(body);
    } catch (error) {
      if (error?.code === "ENOENT") {
        sendJson(response, 404, { error: "Not found" });
        return;
      }
      if (error instanceof GitHubSearchError) {
        sendJson(response, error.status, {
          error: error.message,
          rateLimitRemaining: error.rateLimitRemaining
        });
        return;
      }
      sendJson(response, 500, { error: "Unexpected server error" });
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 4173;
  const server = createAppServer();
  server.listen(port, "127.0.0.1", () => {
    console.log(`GitHub for Humans: http://127.0.0.1:${port}`);
  });
}
