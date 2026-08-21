export type IdentityCandidate<T> = {
  value: T;
  teamName: string;
  managerName: string;
};

export type IdentityMatchResult<T> =
  | { status: "matched"; candidate: T }
  | { status: "not_found" }
  | { status: "ambiguous" };

type ScoredCandidate<T> = {
  candidate: T;
  score: number;
};

export function normalizeIdentity(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toLowerCase();
}

function allowedEditDistance(length: number) {
  if (length < 5) return 0;
  if (length <= 8) return 1;
  if (length <= 20) return 2;
  return 3;
}

// Damerau-Levenshtein treats a nearby character swap such as "Aulta" for
// "Aluta" as one edit, which is a common mobile typing mistake.
export function editDistance(left: string, right: string) {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  const rows = left.length + 1;
  const columns = right.length + 1;
  const matrix = Array.from({ length: rows }, () => Array<number>(columns).fill(0));

  for (let row = 0; row < rows; row += 1) matrix[row][0] = row;
  for (let column = 0; column < columns; column += 1) matrix[0][column] = column;

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + substitutionCost,
      );

      if (
        row > 1 &&
        column > 1 &&
        left[row - 1] === right[column - 2] &&
        left[row - 2] === right[column - 1]
      ) {
        matrix[row][column] = Math.min(
          matrix[row][column],
          matrix[row - 2][column - 2] + substitutionCost,
        );
      }
    }
  }

  return matrix[left.length][right.length];
}

function fieldScore(requested: string, official: string) {
  const requestedKey = normalizeIdentity(requested);
  const officialKey = normalizeIdentity(official);
  if (!requestedKey || !officialKey) return null;

  const longest = Math.max(requestedKey.length, officialKey.length);
  const maximumDistance = allowedEditDistance(longest);
  if (Math.abs(requestedKey.length - officialKey.length) > maximumDistance) return null;

  const distance = editDistance(requestedKey, officialKey);
  if (distance > maximumDistance) return null;

  return 1 - distance / longest;
}

export function matchIdentity<T>(
  requested: { teamName: string; managerName: string },
  candidates: IdentityCandidate<T>[],
): IdentityMatchResult<T> {
  const scored: ScoredCandidate<T>[] = [];

  for (const candidate of candidates) {
    const teamScore = fieldScore(requested.teamName, candidate.teamName);
    const managerScore = fieldScore(requested.managerName, candidate.managerName);
    if (teamScore === null || managerScore === null) continue;

    scored.push({
      candidate: candidate.value,
      score: teamScore * 0.55 + managerScore * 0.45,
    });
  }

  scored.sort((left, right) => right.score - left.score);
  const best = scored[0];
  if (!best) return { status: "not_found" };
  const next = scored[1];

  // An exact normalized match is safe unless the league contains another entry
  // with the same normalized team and manager names.
  if (best.score === 1) {
    return next?.score === 1
      ? { status: "ambiguous" }
      : { status: "matched", candidate: best.candidate };
  }

  if (next && best.score - next.score < 0.03) {
    return { status: "ambiguous" };
  }

  return { status: "matched", candidate: best.candidate };
}
