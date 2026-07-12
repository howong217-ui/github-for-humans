const AI_TERMS = new Set([
  "agent",
  "agents",
  "agentic",
  "ai",
  "anthropic",
  "chatgpt",
  "claude",
  "copilot",
  "codex",
  "cursor",
  "deepseek",
  "gemini",
  "gpt",
  "llm",
  "mcp",
  "openai",
  "prompt",
  "qwen",
  "rag",
  "skill",
  "skills"
]);

const AI_PHRASES = [
  "foundation model",
  "generative ai",
  "image model",
  "inference engine",
  "language model",
  "machine learning",
  "text to image"
];

function repositoryText(repo) {
  const repositoryName = repo.name ?? repo.full_name?.split("/").pop();
  return [repositoryName, repo.description, ...(repo.topics ?? [])]
    .filter(Boolean)
    .join(" ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();
}

function repositoryTokens(repo) {
  return repositoryText(repo)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function daysBetween(from, to) {
  return Math.max(1, (new Date(to) - new Date(from)) / 86_400_000);
}

export function mentionsAi(repo) {
  const text = repositoryText(repo);
  return repositoryTokens(repo).some((term) => AI_TERMS.has(term))
    || AI_PHRASES.some((phrase) => text.includes(phrase));
}

export function mentionsAny(repo, terms) {
  const excluded = new Set(terms.map((term) => term.trim().toLowerCase()).filter(Boolean));
  return repositoryTokens(repo).some((term) => excluded.has(term));
}

export function scoreRepository(repo, now = new Date()) {
  const ageDays = daysBetween(repo.created_at, now);
  const idleDays = daysBetween(repo.pushed_at ?? repo.updated_at ?? repo.created_at, now);
  const stars = repo.stargazers_count ?? 0;
  const forks = repo.forks_count ?? 0;
  const forkRatio = stars > 0 ? forks / stars : 0;
  const starsPerDay = stars / ageDays;
  const evidence = [];
  let score = 0;

  if (ageDays >= 180) {
    score += 2;
    evidence.push({ impact: 2, label: "history", detail: `${Math.floor(ageDays)} days old` });
  } else if (ageDays >= 30) {
    score += 1;
    evidence.push({ impact: 1, label: "history", detail: `${Math.floor(ageDays)} days old` });
  } else if (ageDays < 14) {
    score -= 2;
    evidence.push({ impact: -2, label: "history", detail: "less than two weeks old" });
  }

  if (idleDays <= 30) {
    score += 1;
    evidence.push({ impact: 1, label: "activity", detail: "pushed in the last 30 days" });
  } else if (idleDays > 180) {
    score -= 1;
    evidence.push({ impact: -1, label: "activity", detail: "no push in over 180 days" });
  }

  if (forkRatio >= 0.08) {
    score += 2;
    evidence.push({ impact: 2, label: "reuse", detail: `${(forkRatio * 100).toFixed(1)} forks per 100 stars` });
  } else if (forkRatio >= 0.03) {
    score += 1;
    evidence.push({ impact: 1, label: "reuse", detail: `${(forkRatio * 100).toFixed(1)} forks per 100 stars` });
  } else if (stars >= 1_000 && forkRatio < 0.005) {
    score -= 2;
    evidence.push({ impact: -2, label: "reuse", detail: "very low fork-to-star ratio" });
  }

  if (starsPerDay > 200) {
    score -= 3;
    evidence.push({ impact: -3, label: "velocity", detail: `${Math.round(starsPerDay)} stars/day needs context` });
  } else if (starsPerDay > 50) {
    score -= 2;
    evidence.push({ impact: -2, label: "velocity", detail: `${Math.round(starsPerDay)} stars/day needs context` });
  } else if (starsPerDay > 10) {
    score -= 1;
    evidence.push({ impact: -1, label: "velocity", detail: `${Math.round(starsPerDay)} stars/day needs context` });
  }

  return {
    ...repo,
    evidenceScore: score,
    signals: {
      ageDays: Math.floor(ageDays),
      idleDays: Math.floor(idleDays),
      forkRatio,
      starsPerDay,
      mentionsAi: mentionsAi(repo)
    },
    evidence
  };
}

export function rankRepositories(
  repositories,
  { excludeAi = false, excludeTerms = [], now = new Date() } = {}
) {
  return repositories
    .map((repo) => scoreRepository(repo, now))
    .filter((repo) => !excludeAi || !repo.signals.mentionsAi)
    .filter((repo) => !mentionsAny(repo, excludeTerms))
    .sort((a, b) =>
      b.evidenceScore - a.evidenceScore
      || b.stargazers_count - a.stargazers_count
      || a.full_name.localeCompare(b.full_name)
    );
}
