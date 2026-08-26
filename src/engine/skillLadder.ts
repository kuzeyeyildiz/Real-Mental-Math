import type { Area, SkillXp, SpeedRating } from '../types';

/**
 * Every skill climbs its own open-ended ladder, defined by what **one level
 * costs** rather than by a formula for the running total. Each level costs 16%
 * more than the one before, starting at 100 XP:
 *
 *   1→2 = 100 · 2→3 = 116 · 3→4 = 135 · 5→6 = 181 · 9→10 = 328 · 14→15 = 689
 *
 * so the cumulative totals come out as
 *
 *   L2 = 100 · L3 = 216 · L5 = 507 · L10 = 1,753 · L15 = 4,371 · L20 = 9,871
 *
 * At ~13 XP a solve that is 8 answers for the first level, 14 for the fifth, 25
 * for the tenth and 53 for the fifteenth. Two things this is built to avoid:
 *
 *  - **Level inflation at the bottom.** The old curve handed out level 2 for
 *    four correct answers and level 5 inside a single sitting, which made the
 *    number on the badge mean very little.
 *  - **A wall at the top.** Geometric growth left alone reaches 8,000 XP for a
 *    single level, so the step is capped: past level 20 every level costs the
 *    same 1,500 XP. Still around 115 answers — steady work, not a dead end.
 */
const FIRST_STEP = 100;
const STEP_GROWTH = 1.16;
const STEP_CAP = 1500;

/**
 * Deep enough that nobody will meet it, but bounded: a corrupt XP value must not
 * be able to spin the level search.
 */
export const MAX_SKILL_LEVEL = 200;

export const AREAS: Area[] = ['add', 'sub', 'mul', 'div'];

/** XP to climb from `level` to the next one. */
export function skillXpStep(level: number): number {
  if (level < 1) return 0;
  return Math.min(STEP_CAP, Math.round(FIRST_STEP * STEP_GROWTH ** (level - 1)));
}

/** Running totals, grown on demand and kept — the ladder is read constantly. */
const cumulative: number[] = [0, 0];

/** Cumulative XP required to reach `level`. Level 1 is the floor and costs 0. */
export function skillXpThreshold(level: number): number {
  if (level <= 1) return 0;
  const target = Math.min(level, MAX_SKILL_LEVEL + 1);
  while (cumulative.length <= target) {
    const from = cumulative.length - 1;
    cumulative.push(cumulative[from] + skillXpStep(from));
  }
  return cumulative[target];
}

export function skillLevelFromXp(xp: number): number {
  if (!Number.isFinite(xp) || xp <= 0) return 1;
  let level = 1;
  while (level < MAX_SKILL_LEVEL && skillXpThreshold(level + 1) <= xp) level += 1;
  return level;
}

export interface SkillProgress {
  level: number;
  /** XP earned inside the current level. */
  into: number;
  /** XP the current level spans end to end. */
  span: number;
  /** 0–100 across the current level. */
  pct: number;
  toNext: number;
}

export function skillProgress(xp: number): SkillProgress {
  const level = skillLevelFromXp(xp);
  const floor = skillXpThreshold(level);
  const ceiling = skillXpThreshold(level + 1);
  const span = ceiling - floor;
  const into = Math.max(0, xp - floor);
  return {
    level,
    into,
    span,
    pct: span > 0 ? Math.min(100, (into / span) * 100) : 0,
    toNext: Math.max(0, ceiling - xp),
  };
}

// ── Benchmark → starting XP ──────────────────────────────────────────────────

/**
 * A perfect area on the benchmark is worth this much starting XP — enough to
 * open at level 5, so a strong student is not made to grind through addition
 * they already own.
 */
const PLACEMENT_ENDOWMENT = skillXpThreshold(5); // 507

/**
 * Turn a benchmark breakdown into opening per-skill XP. The benchmark stops
 * being consulted after this: from here the ladders are purely XP-driven.
 */
export function seedSkillXp(
  breakdown: Record<Area, { correct: number; total: number }> | null | undefined
): SkillXp {
  const seed: SkillXp = { add: 0, sub: 0, mul: 0, div: 0 };
  if (!breakdown) return seed;
  for (const area of AREAS) {
    const part = breakdown[area];
    if (!part || !part.total) continue;
    const ratio = Math.max(0, Math.min(1, part.correct / part.total));
    seed[area] = Math.round(ratio * PLACEMENT_ENDOWMENT);
  }
  return seed;
}

// ── Timing and XP ────────────────────────────────────────────────────────────

export const BASE_XP = 10;

/** Seconds a solve is expected to take, widening as operands grow. */
export function targetSeconds(area: Area, level: number): number {
  const base: Record<Area, number> = { add: 6, sub: 7, mul: 9, div: 10 };
  return base[area] + Math.min(level - 1, 24) * 1.2;
}

/**
 * Multipliers are deliberately narrower than they were (a lightning answer used
 * to be worth four slow ones, now three). Pace is moderated by what a level
 * costs, not by shrinking the number a child sees for getting something right.
 */
export const SPEED_META: Record<SpeedRating, { label: string; multiplier: number }> = {
  lightning: { label: 'Lightning', multiplier: 1.8 },
  quick: { label: 'Quick', multiplier: 1.4 },
  onTime: { label: 'On time', multiplier: 1.15 },
  steady: { label: 'Steady', multiplier: 1 },
  slow: { label: 'Took a while', multiplier: 0.6 },
};

/** Where a solve time falls relative to the target for that area and level. */
export function rateSpeed(elapsedMs: number, targetMs: number): SpeedRating {
  if (targetMs <= 0) return 'steady';
  const ratio = elapsedMs / targetMs;
  if (ratio <= 0.4) return 'lightning';
  if (ratio <= 0.7) return 'quick';
  if (ratio <= 1) return 'onTime';
  if (ratio <= 2) return 'steady';
  return 'slow';
}

/** Streak sweetener, capped so a long run can't run away with the scoring. */
export function streakMultiplier(streak: number): number {
  return 1 + Math.min(streak, 10) * 0.05;
}

export interface XpAward {
  xp: number;
  base: number;
  speed: SpeedRating;
  speedMultiplier: number;
  streakMultiplier: number;
  targetMs: number;
}

/**
 * Speed is the main lever on reward: answering inside 40% of the target pays
 * 1.8×, dawdling past twice the target pays 0.6×. Slow-but-correct still earns
 * a decent amount, so a struggling student always moves forward.
 */
export function awardXp(
  area: Area,
  level: number,
  elapsedMs: number,
  streakAfter: number
): XpAward {
  const targetMs = targetSeconds(area, level) * 1000;
  const speed = rateSpeed(elapsedMs, targetMs);
  const speedMultiplier = SPEED_META[speed].multiplier;
  const streakMult = streakMultiplier(streakAfter);
  return {
    xp: Math.max(1, Math.round(BASE_XP * speedMultiplier * streakMult)),
    base: BASE_XP,
    speed,
    speedMultiplier,
    streakMultiplier: streakMult,
    targetMs,
  };
}
