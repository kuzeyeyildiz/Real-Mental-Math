import { describe, it, expect } from 'vitest';
import { generate, check, beginQuestion, freshState, methodTip, sanitizeInput } from './practiceEngine';
import {
  AREAS,
  awardXp,
  skillLevelFromXp,
  skillProgress,
  skillXpThreshold,
  seedSkillXp,
  targetSeconds,
} from './skillLadder';
import {
  mixedSequence,
  nextChallengeQuestion,
  scoreAnswer,
  splitChallengeXp,
  startChallenge,
  submitChallengeAnswer,
  summariseChallenge,
  advanceChallenge,
} from './challengeEngine';
import { badgeProgress, BADGES, EMPTY_BADGE_STATS, newlyEarned, nextUp } from './badges';
import {
  activeTierCount,
  ordinal,
  rankCohort,
  tierForRank,
  tierShares,
  xpToPromotion,
  zoneForPosition,
  weekStart,
  msUntilWeekEnd,
} from './leagues';
import { analyseClass } from './analytics';
import { buildRun, checkRunAnswer, beginRunQuestion, startRun } from './runner';
import { timeAgo } from './notifications';
import { scoreBenchmark, placeLevel, MAX_BENCHMARK_SCORE } from './benchmarkEngine';
import { BENCHMARK_QUESTIONS } from '../data/benchmarkTest';
import { reduceToRegion } from './regionReduce';
import type { Area, SkillXp, StudentProgress } from '../types';

/**
 * Properties that must hold for *every* input, not just the ones the happy path
 * produces. These are the rules a child would notice being broken: a negative
 * answer, a fractional division, a level that goes backwards, XP that vanishes.
 */

const EMPTY: StudentProgress = {
  xp: 0,
  streak: 0,
  solved: 0,
  counts: { add: 0, sub: 0, mul: 0, div: 0 },
  skillXp: { add: 0, sub: 0, mul: 0, div: 0 },
  bestStreak: 0,
  lightningSolves: 0,
};

/** Levels worth hammering: the floor, the taper boundary, and past the cap. */
const LEVELS = [1, 2, 5, 14, 15, 16, 20, 25, 30, 60];

describe('generated questions are always answerable by a child', () => {
  it('never produces a negative answer, a fraction, or a divide by zero', () => {
    for (const area of AREAS) {
      for (const level of LEVELS) {
        for (let i = 0; i < 60; i++) {
          const q = generate(area, level);
          expect(Number.isFinite(q.answer)).toBe(true);
          expect(Number.isInteger(q.answer)).toBe(true);
          expect(q.answer).toBeGreaterThanOrEqual(0);
          if (area === 'div') {
            expect(q.b).toBeGreaterThan(0);
            expect(q.a % q.b).toBe(0);
          }
          if (area === 'sub') expect(q.a).toBeGreaterThanOrEqual(q.b);
        }
      }
    }
  });

  it('survives nonsense levels rather than producing NaN', () => {
    for (const area of AREAS) {
      for (const level of [0, -1, -100, 0.5, Number.NaN]) {
        const q = generate(area, level);
        expect(Number.isFinite(q.a)).toBe(true);
        expect(Number.isFinite(q.b)).toBe(true);
        expect(Number.isInteger(q.answer)).toBe(true);
      }
    }
  });

  it('always writes a method tip that reaches the stated answer', () => {
    for (const area of AREAS) {
      for (const level of LEVELS) {
        for (let i = 0; i < 20; i++) {
          const q = generate(area, level);
          const tip = methodTip(q);
          expect(tip).not.toMatch(/NaN|Infinity|undefined|-\d/);
          expect(tip).toContain(String(q.answer));
        }
      }
    }
  });

  it('keeps every answer inside what the input box accepts', () => {
    // An answer the student physically cannot type would be unanswerable.
    for (const area of AREAS) {
      for (const level of LEVELS) {
        for (let i = 0; i < 30; i++) {
          const q = generate(area, level);
          expect(sanitizeInput(String(q.answer))).toBe(String(q.answer));
        }
      }
    }
  });
});

describe('XP is never negative, zero, or NaN for a correct answer', () => {
  it('awards at least 1 XP however slow or odd the timing', () => {
    for (const area of AREAS) {
      for (const level of LEVELS) {
        for (const ms of [0, 1, 5_000, 10 ** 9, -50, Number.NaN]) {
          const award = awardXp(area, level, ms, 0);
          expect(Number.isFinite(award.xp)).toBe(true);
          expect(award.xp).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it('gives a harder level at least as much time as an easier one', () => {
    for (const area of AREAS) {
      for (let level = 1; level < 40; level++) {
        expect(targetSeconds(area, level + 1)).toBeGreaterThanOrEqual(targetSeconds(area, level));
      }
    }
  });

  it('never lets a solve reduce a student’s totals', () => {
    let state = beginQuestion(freshState('add', { xp: 500, solved: 20 }), 0);
    for (let i = 0; i < 40; i++) {
      const before = { xp: state.xp, solved: state.solved, skill: state.skillXp.add };
      const result = check(state, String(state.answer), 3_000);
      expect(result.state.xp).toBeGreaterThanOrEqual(before.xp);
      expect(result.state.solved).toBeGreaterThanOrEqual(before.solved);
      expect(result.state.skillXp.add).toBeGreaterThanOrEqual(before.skill);
      state = beginQuestion({ ...result.state, status: 'idle', input: '', startedAt: null }, 0);
    }
  });
});

describe('the skill ladder is a total order', () => {
  it('never goes backwards as XP rises, across the whole range', () => {
    let last = 1;
    for (let xp = 0; xp < 400_000; xp += 613) {
      const level = skillLevelFromXp(xp);
      expect(level).toBeGreaterThanOrEqual(last);
      last = level;
    }
  });

  it('reports progress inside the current level for every value', () => {
    for (let xp = 0; xp < 60_000; xp += 137) {
      const p = skillProgress(xp);
      expect(p.pct).toBeGreaterThanOrEqual(0);
      expect(p.pct).toBeLessThanOrEqual(100);
      expect(p.into).toBeGreaterThanOrEqual(0);
      expect(p.toNext).toBeGreaterThanOrEqual(0);
      expect(p.span).toBeGreaterThan(0);
      // The floor of the level you are on can never be above your XP.
      expect(skillXpThreshold(p.level)).toBeLessThanOrEqual(xp);
    }
  });

  it('handles junk XP without throwing or looping', () => {
    for (const xp of [Number.NaN, Number.POSITIVE_INFINITY, -1e9, 0.5]) {
      const p = skillProgress(xp as number);
      expect(Number.isFinite(p.level)).toBe(true);
      expect(p.level).toBeGreaterThanOrEqual(1);
    }
  });

  it('never seeds a placement above the level it promises', () => {
    const perfect = seedSkillXp({
      add: { correct: 15, total: 15 },
      sub: { correct: 15, total: 15 },
      mul: { correct: 15, total: 15 },
      div: { correct: 15, total: 15 },
    });
    for (const area of AREAS) expect(skillLevelFromXp(perfect[area])).toBe(5);

    // A breakdown with impossible numbers must not produce a runaway seed.
    const nonsense = seedSkillXp({
      add: { correct: 99, total: 1 },
      sub: { correct: -5, total: 10 },
      mul: { correct: 0, total: 0 },
      div: { correct: 3, total: 6 },
    });
    for (const area of AREAS) {
      expect(nonsense[area]).toBeGreaterThanOrEqual(0);
      expect(nonsense[area]).toBeLessThanOrEqual(skillXpThreshold(5));
    }
  });
});

describe('challenge questions stay legal', () => {
  const LEVELS_MAP: Record<Area, number>[] = [
    { add: 1, sub: 1, mul: 1, div: 1 },
    { add: 8, sub: 8, mul: 8, div: 8 },
    { add: 20, sub: 20, mul: 20, div: 20 },
  ];

  it('never goes negative or fractional, at any combo', () => {
    for (const levels of LEVELS_MAP) {
      for (const combo of [0, 3, 7, 20, 99]) {
        for (let i = 0; i < 60; i++) {
          const q = nextChallengeQuestion(levels, combo);
          expect(Number.isInteger(q.answer)).toBe(true);
          expect(q.answer).toBeGreaterThan(0);
          expect(q.prompt).not.toMatch(/NaN|undefined|Infinity|--/);
          expect(q.areas.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('scores every answer to a finite, positive number of points', () => {
    const q = nextChallengeQuestion({ add: 5, sub: 5, mul: 5, div: 5 }, 0);
    for (const ms of [0, 500, 100_000, -10]) {
      for (const combo of [0, 1, 50]) {
        const gain = scoreAnswer(q, ms, combo);
        expect(Number.isFinite(gain.points)).toBe(true);
        expect(gain.points).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('hands out exactly the score it earned when splitting into skill XP', () => {
    for (const hits of [
      { add: 3, sub: 0, mul: 1, div: 0 },
      { add: 1, sub: 1, mul: 1, div: 1 },
      { add: 7, sub: 0, mul: 0, div: 0 },
    ]) {
      for (const score of [0, 1, 37, 998]) {
        const split = splitChallengeXp(score, hits);
        const total = AREAS.reduce((sum, a) => sum + split[a], 0);
        expect(total).toBe(score);
        for (const a of AREAS) expect(split[a]).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('drops the score rather than inventing a skill when nothing was answered', () => {
    const split = splitChallengeXp(500, { add: 0, sub: 0, mul: 0, div: 0 });
    expect(AREAS.reduce((sum, a) => sum + split[a], 0)).toBe(0);
  });

  it('summarises a run that answered nothing without dividing by zero', () => {
    const run = startChallenge({ add: 3, sub: 3, mul: 3, div: 3 }, 0);
    const summary = summariseChallenge(run);
    expect(summary.accuracy).toBe(0);
    expect(summary.xpTotal).toBe(0);
    expect(Number.isFinite(summary.accuracy)).toBe(true);
  });

  it('refuses to score once the clock has run out', () => {
    let run = startChallenge({ add: 3, sub: 3, mul: 3, div: 3 }, 0);
    run = advanceChallenge(run, { add: 3, sub: 3, mul: 3, div: 3 }, 10 ** 9);
    expect(run.finished).toBe(true);
    const after = submitChallengeAnswer(run, String(run.question.answer), 10 ** 9);
    expect(after.correct).toBe(false);
    expect(after.state.score).toBe(run.score);
  });
});

describe('mixed assignment sets', () => {
  it('produce exactly the count asked for, or nothing for a silly count', () => {
    const levels = { add: 6, sub: 6, mul: 6, div: 6 };
    for (const count of [1, 5, 25, 100]) {
      expect(mixedSequence(levels, count)).toHaveLength(count);
    }
    for (const count of [0, -5]) {
      expect(mixedSequence(levels, count)).toHaveLength(0);
    }
  });
});

describe('assignment runs', () => {
  it('never lose or duplicate a teacher’s question', () => {
    const written = Array.from({ length: 12 }, (_, i) => ({
      id: `q${i}`,
      assignment_id: 'a',
      position: i,
      prompt: `Question ${i}`,
      answer: i + 1,
      area: 'add' as Area,
    }));
    const run = buildRun(
      { kind: 'custom', areas: ['add'], question_count: 12, level_override: null },
      EMPTY.skillXp,
      written
    );
    expect(run.map((q) => q.prompt)).toEqual(written.map((w) => w.prompt));
  });

  it('cannot be scored twice for the same question', () => {
    const run = startRun(
      buildRun(
        { kind: 'custom', areas: ['add'], question_count: 1, level_override: null },
        EMPTY.skillXp,
        [{ id: 'q', assignment_id: 'a', position: 0, prompt: '2 + 2', answer: 4, area: 'add' }]
      ),
      EMPTY
    );
    const once = checkRunAnswer(beginRunQuestion(run, 0), '4', 1_000);
    const twice = checkRunAnswer(once, '4', 1_000);
    expect(twice).toBe(once);
    expect(twice.correct).toBe(1);
  });

  it('never award more XP to the run than to the account', () => {
    let state = startRun(
      buildRun(
        { kind: 'generated', areas: ['add', 'mul'], question_count: 10, level_override: null },
        EMPTY.skillXp
      ),
      EMPTY
    );
    for (let i = 0; i < 10; i++) {
      state = beginRunQuestion(state, i * 10_000);
      state = checkRunAnswer(state, String(state.questions[state.index].answer), i * 10_000 + 2_000);
      if (i < 9) state = { ...state, index: state.index + 1, status: 'idle', input: '', startedAt: null };
    }
    expect(state.runXp).toBe(state.xp - EMPTY.xp);
    const skillTotal = AREAS.reduce((sum, a) => sum + state.skillXp[a], 0);
    expect(skillTotal).toBeGreaterThan(0);
  });

  it('handles an empty question list without pretending there is one', () => {
    const run = startRun([], EMPTY);
    expect(checkRunAnswer(beginRunQuestion(run, 0), '1', 1_000)).toBe(run);
  });
});

describe('league standings', () => {
  const cohort = (n: number, xp: (i: number) => number) =>
    Array.from({ length: n }, (_, i) => ({
      studentId: `s${i}`,
      name: `Student ${String(i).padStart(2, '0')}`,
      weeklyXp: xp(i),
    }));

  it('keeps every player exactly once, whatever the ties', () => {
    for (const build of [
      (i: number) => 100 - i,
      () => 0,
      (i: number) => (i % 3) * 10,
    ]) {
      const entries = cohort(30, build);
      const ranked = rankCohort(entries, 's0', 'gold', 4);
      expect(ranked).toHaveLength(entries.length);
      expect(new Set(ranked.map((r) => r.studentId)).size).toBe(entries.length);
    }
  });

  it('gives tied players the same position and never position 0', () => {
    const ranked = rankCohort(cohort(10, () => 50), 's0', 'gold', 4);
    expect(new Set(ranked.map((r) => r.position))).toEqual(new Set([1]));
    for (const r of ranked) expect(r.position).toBeGreaterThan(0);
  });

  it('never marks a player as both promoted and relegated', () => {
    for (const size of [1, 5, 12, 13, 30]) {
      for (const tierIndex of [0, 2, 6]) {
        const tier = (['bronze', 'gold', 'legend'] as const)[[0, 2, 6].indexOf(tierIndex)];
        for (let pos = 1; pos <= size; pos++) {
          const zone = zoneForPosition(pos, size, tier, 7);
          expect(['promotion', 'safe', 'demotion']).toContain(zone);
        }
      }
    }
  });

  it('never promotes out of the top tier or relegates out of the bottom', () => {
    for (let pos = 1; pos <= 30; pos++) {
      expect(zoneForPosition(pos, 30, 'legend', 7)).not.toBe('promotion');
      expect(zoneForPosition(pos, 30, 'bronze', 7)).not.toBe('demotion');
    }
  });

  it('always places a player in a real tier', () => {
    for (const users of [0, 1, 59, 60, 500, 6000, 100_000]) {
      for (const rank of [0, 1, 2, Math.floor(users / 2), users, users + 5]) {
        const tier = tierForRank(rank, users);
        expect(tier).toBeTruthy();
        const shares = tierShares(activeTierCount(users));
        expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
      }
    }
  });

  it('writes ordinals a child would recognise', () => {
    const cases: [number, string][] = [
      [0, 'unranked'], [-3, 'unranked'],
      [1, '1st'], [2, '2nd'], [3, '3rd'], [4, '4th'],
      [11, '11th'], [12, '12th'], [13, '13th'],
      [21, '21st'], [22, '22nd'], [23, '23rd'],
      [101, '101st'], [111, '111th'], [112, '112th'],
    ];
    for (const [n, want] of cases) expect(ordinal(n)).toBe(want);
  });

  it('tells a student the gap to promotion even when the cutoff is a tie', () => {
    // Positions run 1,1,1,1,1,1,1,1 — nobody sits at exactly position 7, and the
    // student below still deserves to be told what the climb costs.
    const entries = [
      ...Array.from({ length: 8 }, (_, i) => ({ studentId: `top${i}`, name: `T${i}`, weeklyXp: 100 })),
      { studentId: 'me', name: 'Me', weeklyXp: 20 },
    ];
    const ranked = rankCohort(entries, 'me', 'gold', 4);
    expect(xpToPromotion(ranked, 'me')).toBe(80);
  });

  it('reports no gap for someone already in the promotion zone', () => {
    const ranked = rankCohort(
      Array.from({ length: 20 }, (_, i) => ({ studentId: `s${i}`, name: `S${i}`, weeklyXp: 100 - i })),
      's0',
      'gold',
      4
    );
    expect(xpToPromotion(ranked, 's0')).toBeNull();
  });

  it('always counts down to a Monday, and never negative', () => {
    for (let day = 0; day < 400; day += 1) {
      const now = new Date(2026, 0, 1 + day, 13, 45);
      const start = weekStart(now);
      expect(new Date(`${start}T00:00:00`).getDay()).toBe(1);
      const left = msUntilWeekEnd(now);
      expect(left).toBeGreaterThanOrEqual(0);
      expect(left).toBeLessThanOrEqual(7 * 86_400_000);
    }
  });
});

describe('badges', () => {
  it('report progress between 0 and 100 for any stats', () => {
    const stats = { ...EMPTY_BADGE_STATS, solved: 5, xp: 900, bestStreak: 3 };
    for (const p of badgeProgress(stats)) {
      expect(p.pct).toBeGreaterThanOrEqual(0);
      expect(p.pct).toBeLessThanOrEqual(100);
      expect(p.have).toBeGreaterThanOrEqual(0);
    }
  });

  it('award nothing at all to a brand-new student', () => {
    expect(newlyEarned(EMPTY_BADGE_STATS, [])).toEqual([]);
    expect(nextUp(EMPTY_BADGE_STATS, [])).toEqual([]);
  });

  it('have unique ids and non-empty descriptions', () => {
    const ids = BADGES.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const b of BADGES) {
      expect(b.name.length).toBeGreaterThan(0);
      expect(b.description.length).toBeGreaterThan(0);
      expect(b.icon.length).toBeGreaterThan(0);
      expect(b.goal).toBeGreaterThan(0);
    }
  });

  it('keep an earned badge earned even if the measure later reads lower', () => {
    const earned = badgeProgress(EMPTY_BADGE_STATS, ['first-steps']).find(
      (p) => p.badge.id === 'first-steps'
    );
    expect(earned?.earned).toBe(true);
    expect(earned?.pct).toBe(100);
  });
});

describe('class analytics', () => {
  const student = (over: Partial<Parameters<typeof analyseClass>[0][number]> = {}) => ({
    id: 's',
    name: 'S',
    xp: 0,
    solved: 0,
    skillXp: { add: 0, sub: 0, mul: 0, div: 0 } as SkillXp,
    lastActive: null,
    ...over,
  });

  it('survives an empty class without NaN', () => {
    const result = analyseClass([]);
    expect(result.averageXp).toBe(0);
    for (const a of result.areas) {
      expect(Number.isFinite(a.averageLevel)).toBe(true);
      expect(Number.isFinite(a.minLevel)).toBe(true);
    }
  });

  it('does not name a weakest skill when the class is level across the board', () => {
    const flat = [student({ id: 'a' }), student({ id: 'b' })];
    expect(analyseClass(flat).weakestAreas).toEqual([]);
  });

  it('ignores an unparseable last-active date rather than counting it active', () => {
    const result = analyseClass([student({ lastActive: 'not a date' })]);
    expect(result.activeThisWeek).toBe(0);
    expect(result.needsAttention).toHaveLength(1);
  });
});

describe('relative time never reads as nonsense', () => {
  it('clamps a timestamp from the future to "just now"', () => {
    const now = new Date('2026-08-03T12:00:00Z');
    const future = new Date('2026-08-03T12:00:30Z').toISOString();
    expect(timeAgo(future, now)).toBe('just now');
  });

  it('returns an empty string for junk rather than "NaN ago"', () => {
    expect(timeAgo('not a date', new Date())).toBe('');
  });
});

describe('the benchmark question bank', () => {
  it('states the right answer for every one of its fixed questions', () => {
    // The operands are hand-written so every student sits the same paper. A
    // single wrong answer here silently mis-places whoever gets it right.
    const evaluate = (q: { a: number; b: number; area: Area }) => {
      switch (q.area) {
        case 'add': return q.a + q.b;
        case 'sub': return q.a - q.b;
        case 'mul': return q.a * q.b;
        case 'div': return q.a / q.b;
      }
    };
    for (const q of BENCHMARK_QUESTIONS) {
      expect({ id: q.id, answer: q.answer }).toEqual({ id: q.id, answer: evaluate(q) });
    }
  });

  it('never asks a child for a negative or fractional answer', () => {
    for (const q of BENCHMARK_QUESTIONS) {
      expect(Number.isInteger(q.answer)).toBe(true);
      expect(q.answer).toBeGreaterThanOrEqual(0);
      if (q.area === 'div') expect(q.a % q.b).toBe(0);
    }
  });

  it('has unique ids, a positive clock and a positive weight throughout', () => {
    const ids = BENCHMARK_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const q of BENCHMARK_QUESTIONS) {
      expect(q.seconds).toBeGreaterThan(0);
      expect(q.points).toBeGreaterThan(0);
    }
  });

  it('scores a perfect paper to exactly the advertised maximum', () => {
    const perfect: Record<number, string> = {};
    for (const q of BENCHMARK_QUESTIONS) perfect[q.id] = String(q.answer);
    const result = scoreBenchmark(perfect);
    expect(result.score).toBe(MAX_BENCHMARK_SCORE);
    expect(result.level).toBe('master');
    for (const area of AREAS) {
      expect(result.breakdown[area].correct).toBe(result.breakdown[area].total);
    }
  });

  it('scores an empty paper to zero without crashing', () => {
    const result = scoreBenchmark({});
    expect(result.score).toBe(0);
    expect(result.level).toBe('beginner');
    for (const area of AREAS) expect(result.breakdown[area].correct).toBe(0);
  });

  it('never lets a partial paper outscore a perfect one', () => {
    const perfect: Record<number, string> = {};
    for (const q of BENCHMARK_QUESTIONS) perfect[q.id] = String(q.answer);
    const half: Record<number, string> = {};
    BENCHMARK_QUESTIONS.slice(0, 30).forEach((q) => (half[q.id] = String(q.answer)));
    expect(scoreBenchmark(half).score).toBeLessThan(scoreBenchmark(perfect).score);
  });

  it('places every reachable score in exactly one band', () => {
    for (let s = 0; s <= MAX_BENCHMARK_SCORE; s += 0.5) {
      expect(['beginner', 'intermediate', 'expert', 'master']).toContain(placeLevel(s));
    }
  });
});

describe('reducing a coordinate to a region', () => {
  it('never returns a coordinate, only a name', () => {
    for (const [lat, lon] of [[39.93, 32.86], [41.01, 28.98], [37.0, 35.32]] as [number, number][]) {
      const region = reduceToRegion(lat, lon, 'Europe/Istanbul');
      expect(region).toBeTruthy();
      expect(region).not.toMatch(/\d/);
    }
  });

  it('maps a coordinate to its actual province', () => {
    expect(reduceToRegion(39.93, 32.86, 'Europe/Istanbul')).toBe('Ankara');
    expect(reduceToRegion(38.42, 27.14, 'Europe/Istanbul')).toBe('İzmir');
  });

  it('refuses to guess from junk rather than inventing a place', () => {
    expect(reduceToRegion(Number.NaN, 10, 'Europe/Istanbul')).toBeNull();
    expect(reduceToRegion(10, Number.POSITIVE_INFINITY, 'Europe/Istanbul')).toBeNull();
    // Outside the bundled table with a useless zone: store nothing.
    expect(reduceToRegion(0, 0, 'UTC')).toBeNull();
    expect(reduceToRegion(0, 0, undefined)).toBeNull();
  });

  it('falls back to a coarse zone name outside the bundled table', () => {
    expect(reduceToRegion(40.71, -74.0, 'America/New_York')).toBe('New York');
  });
});
