import type { Area, Level, BenchmarkResult } from '../types';
import { BENCHMARK_QUESTIONS, MAX_BENCHMARK_SCORE, RAW_MAX_POINTS } from '../data/benchmarkTest';

// Answers keyed by question id. A missing/null entry = unanswered (timed out or skipped).
export type BenchmarkAnswers = Record<number, string | null>;

export const LEVEL_BANDS: { level: Level; min: number; max: number; label: string }[] = [
  { level: 'beginner', min: 0, max: 45, label: 'Beginner' },
  { level: 'intermediate', min: 45, max: 80, label: 'Intermediate' },
  { level: 'expert', min: 80, max: 105, label: 'Expert' },
  { level: 'master', min: 105, max: 130, label: 'Master' },
];

export const LEVEL_LABEL: Record<Level, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  expert: 'Expert',
  master: 'Master',
};

/**
 * Place a 0–130 score into a level. Bands per spec:
 * Beginner 0–45, Intermediate 45–80, Expert 80–105, Master 105–130.
 * Lower bound is inclusive (a score of exactly 45 → Intermediate).
 */
export function placeLevel(score: number): Level {
  if (score < 45) return 'beginner';
  if (score < 80) return 'intermediate';
  if (score < 105) return 'expert';
  return 'master';
}

function emptyBreakdown(): BenchmarkResult['breakdown'] {
  return {
    add: { correct: 0, total: 0, points: 0 },
    sub: { correct: 0, total: 0, points: 0 },
    mul: { correct: 0, total: 0, points: 0 },
    div: { correct: 0, total: 0, points: 0 },
  };
}

/**
 * The 60-question bank carries 96 raw weight; the reported scale is 130. Keeping
 * the reported scale fixed means level bands, the teacher roster and results
 * stored under the older 80-question test all stay directly comparable.
 */
const SCALE = MAX_BENCHMARK_SCORE / RAW_MAX_POINTS;

function toScale(raw: number): number {
  return Math.round(raw * SCALE * 10) / 10;
}

/**
 * Score a completed benchmark. A question earns its full point value only when
 * the submitted answer matches exactly; unanswered/timed-out = 0.
 */
export function scoreBenchmark(answers: BenchmarkAnswers): BenchmarkResult {
  const breakdown = emptyBreakdown();
  let rawScore = 0;

  for (const q of BENCHMARK_QUESTIONS) {
    breakdown[q.area].total += 1;
    const raw = answers[q.id];
    if (raw == null || raw === '') continue;
    const parsed = parseInt(raw, 10);
    if (!Number.isNaN(parsed) && parsed === q.answer) {
      breakdown[q.area].correct += 1;
      breakdown[q.area].points += q.points;
      rawScore += q.points;
    }
  }

  // A perfect paper must land on exactly 130 — rounding each area separately
  // would otherwise leave the total a tenth short of the maximum.
  const score = rawScore === RAW_MAX_POINTS ? MAX_BENCHMARK_SCORE : toScale(rawScore);
  for (const area of Object.keys(breakdown) as Area[]) {
    breakdown[area].points = toScale(breakdown[area].points);
  }

  return { score, level: placeLevel(score), breakdown };
}

export { MAX_BENCHMARK_SCORE };
