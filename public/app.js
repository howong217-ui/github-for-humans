const form = document.querySelector("#search-form");
const queryInput = document.querySelector("#query");
const excludeAiInput = document.querySelector("#exclude-ai");
const excludeTopicsInput = document.querySelector("#exclude-topics");
const limitInput = document.querySelector("#result-limit");
const status = document.querySelector("#status");
const section = document.querySelector("#results-section");
const resultTitle = document.querySelector("#result-title");
const summary = document.querySelector("#summary");
const results = document.querySelector("#results");
const jsonLink = document.querySelector("#json-link");
const copyLink = document.querySelector("#copy-link");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatNumber(value) {
  return new Intl.NumberFormat("en", { notation: value >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value ?? 0);
}

function relativePush(days) {
  if (days <= 1) return "pushed today";
  if (days < 30) return `pushed ${days} days ago`;
  if (days < 365) return `pushed ${Math.floor(days / 30)} months ago`;
  return `pushed ${Math.floor(days / 365)} years ago`;
}

function deltaMarkup(delta) {
  if (delta > 0) return `<span class="delta up">↑ ${delta}</span>`;
  if (delta < 0) return `<span class="delta down">↓ ${Math.abs(delta)}</span>`;
  return '<span class="delta same">same</span>';
}

function evidenceMarkup(repo) {
  if (!repo.evidence.length) return "<li>No ranking adjustment from current rules.</li>";
  return repo.evidence.map((item) => `<li class="${item.impact < 0 ? "warn" : "good"}">${escapeHtml(item.detail)}</li>`).join("");
}

function renderReport(report) {
  section.hidden = false;
  resultTitle.textContent = report.query;
  summary.innerHTML = `
    <div class="summary-card"><strong>${formatNumber(report.github.totalCount)}</strong><span>matching on GitHub</span></div>
    <div class="summary-card"><strong>${report.summary.outputCount}</strong><span>shown after filters</span></div>
    <div class="summary-card"><strong>${report.summary.movedUp}</strong><span>moved up on evidence</span></div>
    <div class="summary-card"><strong>${report.github.rateLimit.remaining ?? "–"}</strong><span>API searches remaining</span></div>`;

  if (!report.repositories.length) {
    results.innerHTML = '<div class="empty">No repositories remain. Remove a filter or broaden the search.</div>';
    return;
  }

  results.innerHTML = report.repositories.map((repo) => `
    <article class="repo-card">
      <div class="rank-box">
        <strong>#${repo.evidenceRank}</strong>
        <span>GitHub #${repo.originalRank}</span>
        ${deltaMarkup(repo.rankDelta)}
      </div>
      <div class="repo-main">
        <h3><a href="${escapeHtml(repo.html_url)}" target="_blank" rel="noreferrer">${escapeHtml(repo.full_name)}</a></h3>
        <p>${escapeHtml(repo.description || "No repository description.")}</p>
        <div class="metrics">
          <span>★ ${formatNumber(repo.stargazers_count)}</span>
          <span>⑂ ${formatNumber(repo.forks_count)} forks</span>
          <span>${repo.signals.ageDays} days old</span>
          <span>${relativePush(repo.signals.idleDays)}</span>
          <span>${escapeHtml(repo.language || "No language")}</span>
        </div>
      </div>
      <aside class="evidence">
        <h4>Why this position</h4>
        <ul>${evidenceMarkup(repo)}</ul>
        <div class="evidence-score">Evidence balance ${repo.evidenceScore > 0 ? "+" : ""}${repo.evidenceScore}</div>
      </aside>
    </article>`).join("");
}

function buildApiUrl() {
  const params = new URLSearchParams({
    q: queryInput.value.trim(),
    per_page: limitInput.value
  });
  if (excludeAiInput.checked) params.set("exclude_ai", "1");
  if (excludeTopicsInput.value.trim()) params.set("exclude_topics", excludeTopicsInput.value.trim());
  return `/api/search?${params}`;
}

function syncPageUrl() {
  const params = new URLSearchParams();
  params.set("q", queryInput.value.trim());
  if (excludeAiInput.checked) params.set("noai", "1");
  if (excludeTopicsInput.value.trim()) params.set("exclude", excludeTopicsInput.value.trim());
  params.set("limit", limitInput.value);
  history.replaceState(null, "", `?${params}`);
}

async function search() {
  const apiUrl = buildApiUrl();
  syncPageUrl();
  status.className = "status loading";
  status.textContent = "Searching GitHub and applying evidence rules…";
  section.hidden = true;
  try {
    const response = await fetch(apiUrl);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Search failed.");
    renderReport(payload);
    jsonLink.href = apiUrl;
    status.className = "status";
    status.textContent = `Showing ${payload.summary.outputCount} of ${payload.summary.inputCount} fetched results. Rankings are based only on visible public metadata.`;
  } catch (error) {
    status.className = "status error";
    status.textContent = error.message;
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  search();
});

document.querySelectorAll("[data-query]").forEach((button) => {
  button.addEventListener("click", () => {
    queryInput.value = button.dataset.query;
    search();
  });
});

copyLink.addEventListener("click", async () => {
  await navigator.clipboard.writeText(location.href);
  copyLink.textContent = "Copied";
  setTimeout(() => { copyLink.textContent = "Copy search link"; }, 1200);
});

const initial = new URLSearchParams(location.search);
if (initial.has("q")) queryInput.value = initial.get("q");
excludeAiInput.checked = initial.get("noai") === "1";
if (initial.has("exclude")) excludeTopicsInput.value = initial.get("exclude");
if (["20", "30", "50"].includes(initial.get("limit"))) limitInput.value = initial.get("limit");
if (initial.has("q")) search();
