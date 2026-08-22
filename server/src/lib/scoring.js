// Mirrors the scoring logic already validated in the Comercial Coach prototype.
export const DIMENSIONS = [
  { key: "processo", weight: 0.3 },
  { key: "preco", weight: 0.25 },
  { key: "time", weight: 0.25 },
  { key: "pipeline", weight: 0.2 },
];

export const RANGES = [
  { max: 40, label: "Operação no escuro" },
  { max: 65, label: "Estrutura básica, com lacunas" },
  { max: 85, label: "Operação organizada" },
  { max: 101, label: "Referência" },
];

export function rangeFor(score) {
  return RANGES.find((r) => score < r.max) || RANGES[RANGES.length - 1];
}

/**
 * answers: { processo: [0-100, 0-100, ...], preco: [...], time: [...], pipeline: [...] }
 * Each array holds the score (0-100) of every answered question in that dimension.
 */
export function computeScore(answers) {
  const dims = {};
  for (const { key } of DIMENSIONS) {
    const vals = answers[key] || [];
    dims[key] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }
  const final = Math.round(DIMENSIONS.reduce((sum, d) => sum + dims[d.key] * d.weight, 0));
  return { dims, final };
}

