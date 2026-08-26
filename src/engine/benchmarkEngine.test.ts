import { describe, it, expect } from 'vitest';
import {
  BENCHMARK_QUESTIONS,
  BENCHMARK_TIME_BUDGET_S,
  MAX_BENCHMARK_SCORE,
  TIER_COUNTS,
  TIER_ORDER,
  AREA_ORDER,
} from '../data/benchmarkTest';
import { scoreBenchmark, placeLevel, type BenchmarkAnswers } from './benchmarkEngine';

const digits = (n: number) => String(Math.abs(n)).length;

describe('benchmark question bank', () => {
  it('has exactly 60 questions', () => {
    expect(BENCHMARK_QUESTIONS).toHaveLength(60);
  });

  it('has 15 questions per area, split 4/4/4/3 across the tiers', () => {
    for (const area of AREA_ORDER) {
      const inArea = BENCHMARK_QUESTIONS.filter((q) => q.area === area);
      expect(inArea).toHaveLength(15);
      for (const tier of TIER_ORDER) {
        expect(inArea.filter((q) => q.tier === tier)).toHaveLength(TIER_COUNTS[tier]);
      }
    }
  });

  it('computes answers correctly and division is always clean', () => {
    for (const q of BENCHMARK_QUESTIONS) {
      if (q.area === 'add') expect(q.answer).toBe(q.a + q.b);
      if (q.area === 'sub') expect(q.answer).toBe(q.a - q.b);
      if (q.area === 'mul') expect(q.answer).toBe(q.a * q.b);
      if (q.area === 'div') {
        expect(q.a % q.b).toBe(0);
        expect(q.answer).toBe(q.a / q.b);
      }
    }
  });

  it('subtraction never goes negative', () => {
    for (const q of BENCHMARK_QUESTIONS.filter((q) => q.area === 'sub')) {
      expect(q.answer).toBeGreaterThan(0);
    }
  });

  // Digit sizes are the spec, so they are asserted rather than eyeballed.
  it('sizes addition and subtraction operands at 1/2/3/4 digits by tier', () => {
    const expected: Record<string, number> = { easy: 1, mediocre: 2, hard: 3, extreme: 4 };
    for (const q of BENCHMARK_QUESTIONS.filter((q) => q.area === 'add' || q.area === 'sub')) {
      expect(digits(q.a)).toBe(expected[q.tier]);
      expect(digits(q.b)).toBe(expected[q.tier]);
    }
  });

  it('sizes multiplication as 1×1, 1×2, 2×2, then advanced', () => {
    const byTier = (tier: string) =>
      BENCHMARK_QUESTIONS.filter((q) => q.area === 'mul' && q.tier === tier);

    for (const q of byTier('easy')) {
      expect([digits(q.a), digits(q.b)]).toEqual([1, 1]);
    }
    for (const q of byTier('mediocre')) {
      expect([digits(q.a), digits(q.b)].sort()).toEqual([1, 2]);
    }
    for (const q of byTier('hard')) {
      expect([digits(q.a), digits(q.b)]).toEqual([2, 2]);
    }
    // Extreme is either an advanced 2-digit pair or a 1-digit × 3-digit.
    for (const q of byTier('extreme')) {
      const pair = [digits(q.a), digits(q.b)].sort().join('');
      expect(['22', '13']).toContain(pair);
    }
  });

  it('mirrors each multiplication tier with an equivalent division tier', () => {
    for (const tier of TIER_ORDER) {
      const muls = BENCHMARK_QUESTIONS.filter((q) => q.area === 'mul' && q.tier === tier);
      const divs = BENCHMARK_QUESTIONS.filter((q) => q.area === 'div' && q.tier === tier);
      expect(divs).toHaveLength(muls.length);
      // A division question is the inverse of a product of the same shape:
      // dividend = divisor × quotient, both of the multiplication tier's sizes.
      for (const q of divs) {
        const shape = [digits(q.b), digits(q.answer)].sort().join('');
        const mulShapes = muls.map((m) => [digits(m.a), digits(m.b)].sort().join(''));
        expect(mulShapes).toContain(shape);
      }
    }
  });

  it('reports on a 130-point scale', () => {
    expect(MAX_BENCHMARK_SCORE).toBe(130);
  });

  it('fits inside a ~19 minute time budget', () => {
    expect(BENCHMARK_TIME_BUDGET_S).toBe(1124);
    expect(BENCHMARK_TIME_BUDGET_S).toBeLessThan(20 * 60);
  });
});

describe('scoreBenchmark', () => {
  it('a perfect test scores exactly 130 → master', () => {
    const answers: BenchmarkAnswers = {};
    for (const q of BENCHMARK_QUESTIONS) answers[q.id] = String(q.answer);
    const result = scoreBenchmark(answers);
    expect(result.score).toBe(130);
    expect(result.level).toBe('master');
  });

  it('an empty test scores 0 → beginner', () => {
    const result = scoreBenchmark({});
    expect(result.score).toBe(0);
    expect(result.level).toBe('beginner');
  });

  it('ignores wrong and unanswered questions', () => {
    const answers: BenchmarkAnswers = {};
    // The 4 easy addition questions carry 1 raw point each → 4/96 of 130.
    for (const q of BENCHMARK_QUESTIONS.filter((q) => q.area === 'add' && q.tier === 'easy')) {
      answers[q.id] = String(q.answer);
    }
    answers[BENCHMARK_QUESTIONS[10].id] = '999999';
    const result = scoreBenchmark(answers);
    expect(result.score).toBeCloseTo(5.4, 1);
    expect(result.breakdown.add.correct).toBe(4);
    expect(result.breakdown.add.total).toBe(15);
  });

  it('weights multiplication and division above addition and subtraction', () => {
    const perfectIn = (area: 'add' | 'mul') => {
      const answers: BenchmarkAnswers = {};
      for (const q of BENCHMARK_QUESTIONS.filter((q) => q.area === area)) {
        answers[q.id] = String(q.answer);
      }
      return scoreBenchmark(answers).score;
    };
    expect(perfectIn('mul')).toBeGreaterThan(perfectIn('add'));
  });

  it('builds a per-area breakdown with totals of 15 each', () => {
    const result = scoreBenchmark({});
    for (const area of AREA_ORDER) {
      expect(result.breakdown[area].total).toBe(15);
    }
  });
});

describe('placeLevel', () => {
  it('maps scores to the correct bands', () => {
    expect(placeLevel(0)).toBe('beginner');
    expect(placeLevel(44.9)).toBe('beginner');
    expect(placeLevel(45)).toBe('intermediate');
    expect(placeLevel(72)).toBe('intermediate');
    expect(placeLevel(79.9)).toBe('intermediate');
    expect(placeLevel(80)).toBe('expert');
    expect(placeLevel(104.9)).toBe('expert');
    expect(placeLevel(105)).toBe('master');
    expect(placeLevel(130)).toBe('master');
  });
});
