import type { Area } from '../types';

export type Tier = 'easy' | 'mediocre' | 'hard' | 'extreme';

export interface BenchmarkQuestion {
  id: number; // 1..60
  area: Area;
  tier: Tier;
  a: number;
  b: number;
  answer: number;
  seconds: number; // per-question time limit
  points: number; // raw weight, normalised to the 130-point scale at scoring time
}

export const AREA_SYMBOL: Record<Area, string> = {
  add: '+',
  sub: '−',
  mul: '×',
  div: '÷',
};

export const TIER_LABEL: Record<Tier, string> = {
  easy: 'Easy',
  mediocre: 'Mediocre',
  hard: 'Hard',
  extreme: 'Extreme',
};

/** Questions per tier — 4 + 4 + 4 + 3 = 15 per skill, 60 overall. */
export const TIER_COUNTS: Record<Tier, number> = {
  easy: 4,
  mediocre: 4,
  hard: 4,
  extreme: 3,
};

/**
 * Time limits are per area *and* tier: a 2×2-digit product is meaningfully
 * slower to hold in the head than a 3-digit sum, so multiplication and
 * division get a longer allowance at the top two tiers.
 */
const SECONDS: Record<Area, Record<Tier, number>> = {
  add: { easy: 8, mediocre: 12, hard: 20, extreme: 30 },
  sub: { easy: 8, mediocre: 12, hard: 20, extreme: 30 },
  mul: { easy: 8, mediocre: 15, hard: 25, extreme: 40 },
  div: { easy: 8, mediocre: 15, hard: 25, extreme: 40 },
};

// Per-question raw weight = (part multiplier) × (tier multiplier).
// add/sub part ×1; mul/div part ×1.5. Tiers: easy 1, mediocre 1.2, hard 1.4, extreme 1.6.
const POINTS: Record<Area, Record<Tier, number>> = {
  add: { easy: 1, mediocre: 1.2, hard: 1.4, extreme: 1.6 },
  sub: { easy: 1, mediocre: 1.2, hard: 1.4, extreme: 1.6 },
  mul: { easy: 1.5, mediocre: 1.8, hard: 2.1, extreme: 2.4 },
  div: { easy: 1.5, mediocre: 1.8, hard: 2.1, extreme: 2.4 },
};

/**
 * Operands are fixed rather than generated so every student sits the same
 * assessment and a placement can be re-derived from the stored answers.
 *
 * Digit sizes follow the spec:
 *   add/sub  — 1, 2, 3, 4 digits by tier.
 *   mul      — 1×1, 1×2, 2×2, then advanced 2-digit and 1×3-digit.
 *   div      — the exact inverse of the multiplication tiers, so a student who
 *              knows the product tier can invert it at the same difficulty.
 */
const OPERANDS: Record<Area, Record<Tier, [number, number][]>> = {
  add: {
    easy: [[7, 5], [9, 6], [8, 4], [6, 7]],
    mediocre: [[23, 15], [47, 26], [58, 17], [64, 29]],
    hard: [[347, 256], [489, 372], [568, 247], [736, 158]],
    extreme: [[2389, 1764], [3475, 1268], [5894, 2765]],
  },
  sub: {
    easy: [[9, 4], [8, 5], [7, 3], [9, 6]],
    mediocre: [[45, 23], [63, 28], [94, 37], [82, 49]],
    hard: [[764, 328], [589, 246], [812, 457], [936, 284]],
    extreme: [[2847, 1695], [4573, 2684], [5892, 3476]],
  },
  mul: {
    easy: [[6, 7], [8, 4], [9, 5], [7, 6]],
    mediocre: [[6, 14], [7, 18], [9, 12], [8, 16]],
    hard: [[12, 13], [15, 14], [16, 17], [19, 15]],
    extreme: [[24, 16], [35, 14], [6, 125]],
  },
  div: {
    easy: [[42, 6], [32, 4], [45, 9], [56, 7]],
    mediocre: [[84, 6], [126, 7], [108, 9], [128, 8]],
    hard: [[156, 12], [210, 15], [272, 16], [285, 19]],
    extreme: [[384, 24], [490, 35], [750, 6]],
  },
};

function compute(area: Area, a: number, b: number): number {
  switch (area) {
    case 'add': return a + b;
    case 'sub': return a - b;
    case 'mul': return a * b;
    case 'div': return a / b;
  }
}

export const AREA_ORDER: Area[] = ['add', 'sub', 'mul', 'div'];
export const TIER_ORDER: Tier[] = ['easy', 'mediocre', 'hard', 'extreme'];

// Build the ordered 60-question bank (Part I→IV, easy→extreme within each).
export const BENCHMARK_QUESTIONS: BenchmarkQuestion[] = (() => {
  const list: BenchmarkQuestion[] = [];
  let id = 1;
  for (const area of AREA_ORDER) {
    for (const tier of TIER_ORDER) {
      for (const [a, b] of OPERANDS[area][tier]) {
        list.push({
          id: id++,
          area,
          tier,
          a,
          b,
          answer: compute(area, a, b),
          seconds: SECONDS[area][tier],
          points: POINTS[area][tier],
        });
      }
    }
  }
  return list;
})();

/** Sum of the raw weights (96). Normalised to 130 when a test is scored. */
export const RAW_MAX_POINTS =
  Math.round(BENCHMARK_QUESTIONS.reduce((sum, q) => sum + q.points, 0) * 10) / 10;

/**
 * The reported scale stays at 130 even though the test shrank from 80 to 60
 * questions, so placements, level bands and previously stored results all
 * remain directly comparable.
 */
export const MAX_BENCHMARK_SCORE = 130;

/** Total time budget if every question runs to its limit (~19 minutes). */
export const BENCHMARK_TIME_BUDGET_S = BENCHMARK_QUESTIONS.reduce((sum, q) => sum + q.seconds, 0);

export const PART_LABELS: Record<Area, string> = {
  add: 'Addition',
  sub: 'Subtraction',
  mul: 'Multiplication',
  div: 'Division',
};
