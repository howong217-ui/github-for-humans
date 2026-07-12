import { rankRepositories } from "./rank.mjs";

export function buildSearchReport(
  repositories,
  { excludeAi = false, excludeTerms = [], now = new Date(), query = "" } = {}
) {
  const withOriginalRank = repositories.map((repo, index) => ({
    ...repo,
    originalRank: index + 1
  }));
  const ranked = rankRepositories(withOriginalRank, { excludeAi, excludeTerms, now })
    .map((repo, index) => {
      const evidenceRank = index + 1;
      return {
        ...repo,
        evidenceRank,
        rankDelta: repo.originalRank - evidenceRank
      };
    });

  return {
    schemaVersion: 1,
    notice: "Evidence signals are review aids, not fraud, authorship, security, or quality verdicts.",
    query,
    asOf: now.toISOString(),
    filters: {
      excludeAi,
      excludeTerms: excludeTerms.map((term) => term.trim()).filter(Boolean)
    },
    summary: {
      inputCount: repositories.length,
      outputCount: ranked.length,
      filteredCount: repositories.length - ranked.length,
      movedUp: ranked.filter((repo) => repo.rankDelta > 0).length,
      movedDown: ranked.filter((repo) => repo.rankDelta < 0).length
    },
    repositories: ranked
  };
}
