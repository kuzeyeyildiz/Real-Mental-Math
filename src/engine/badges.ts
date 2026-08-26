import type { Area, SkillXp } from '../types';
import { AREAS, skillLevelFromXp } from './skillLadder';

/**
 * Achievements are defined as *progress*, not as a boolean that flips. A badge
 * a student can see themselves closing in on is worth chasing; one that appears
 * out of nowhere is only a surprise once.
 */
export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'legend';

export type BadgeGroup = 'practice' | 'skill' | 'speed' | 'challenge' | 'class';

/** Everything the catalogue is allowed to look at. */
export interface BadgeStats {
  solved: number;
  xp: number;
  counts: Record<Area, number>;
  skillXp: SkillXp;
  bestStreak: number;
  lightningSolves: number;
  daysPractised: number;
  challengeRuns: number;
  challengeBestScore: number;
  challengeBestCombo: number;
  assignmentsHandedIn: number;
  perfectAssignments: number;
}

export const EMPTY_BADGE_STATS: BadgeStats = {
  solved: 0,
  xp: 0,
  counts: { add: 0, sub: 0, mul: 0, div: 0 },
  skillXp: { add: 0, sub: 0, mul: 0, div: 0 },
  bestStreak: 0,
  lightningSolves: 0,
  daysPractised: 0,
  challengeRuns: 0,
  challengeBestScore: 0,
  challengeBestCombo: 0,
  assignmentsHandedIn: 0,
  perfectAssignments: 0,
};

export interface BadgeDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  tier: BadgeTier;
  group: BadgeGroup;
  /** What the student has, against what the badge asks for. */
  measure: (stats: BadgeStats) => number;
  goal: number;
}

const levelOf = (stats: BadgeStats, area: Area) => skillLevelFromXp(stats.skillXp[area]);

/** Lowest of the four ladders — the one that decides an "all four" badge. */
const weakestLevel = (stats: BadgeStats) => Math.min(...AREAS.map((a) => levelOf(stats, a)));

export const BADGES: BadgeDef[] = [
  // ── Practice volume ────────────────────────────────────────────────────────
  {
    id: 'first-steps',
    name: 'First Steps',
    description: 'Answer 10 questions correctly.',
    icon: '🌱',
    tier: 'bronze',
    group: 'practice',
    measure: (s) => s.solved,
    goal: 10,
  },
  {
    id: 'hundred-club',
    name: 'Hundred Club',
    description: 'Answer 100 questions correctly.',
    icon: '💯',
    tier: 'silver',
    group: 'practice',
    measure: (s) => s.solved,
    goal: 100,
  },
  {
    id: 'thousand-strong',
    name: 'Thousand Strong',
    description: 'Answer 1,000 questions correctly.',
    icon: '🏛️',
    tier: 'gold',
    group: 'practice',
    measure: (s) => s.solved,
    goal: 1000,
  },
  {
    id: 'ten-thousand',
    name: 'Ten Thousand',
    description: 'Answer 10,000 questions correctly.',
    icon: '🗿',
    tier: 'legend',
    group: 'practice',
    measure: (s) => s.solved,
    goal: 10000,
  },
  {
    id: 'five-hundred',
    name: 'Five Hundred',
    description: 'Answer 500 questions correctly.',
    icon: '🎯',
    tier: 'silver',
    group: 'practice',
    measure: (s) => s.solved,
    goal: 500,
  },
  {
    id: 'three-days',
    name: 'Back Again',
    description: 'Practise on 3 different days.',
    icon: '🌤️',
    tier: 'bronze',
    group: 'practice',
    measure: (s) => s.daysPractised,
    goal: 3,
  },
  {
    id: 'regular',
    name: 'Regular',
    description: 'Practise on 7 different days.',
    icon: '📅',
    tier: 'bronze',
    group: 'practice',
    measure: (s) => s.daysPractised,
    goal: 7,
  },
  {
    id: 'devoted',
    name: 'Devoted',
    description: 'Practise on 30 different days.',
    icon: '🗓️',
    tier: 'gold',
    group: 'practice',
    measure: (s) => s.daysPractised,
    goal: 30,
  },
  {
    id: 'hundred-days',
    name: 'Hundred Days',
    description: 'Practise on 100 different days.',
    icon: '📆',
    tier: 'legend',
    group: 'practice',
    measure: (s) => s.daysPractised,
    goal: 100,
  },

  // ── Total XP ───────────────────────────────────────────────────────────────
  // Every other measure counts one kind of work. These count all of it, so the
  // student who spreads their effort around still has something to chase.
  {
    id: 'xp-1k',
    name: 'Thousand XP',
    description: 'Earn 1,000 XP in total.',
    icon: '🔹',
    tier: 'bronze',
    group: 'practice',
    measure: (s) => s.xp,
    goal: 1000,
  },
  {
    id: 'xp-10k',
    name: 'Ten Thousand XP',
    description: 'Earn 10,000 XP in total.',
    icon: '🔷',
    tier: 'silver',
    group: 'practice',
    measure: (s) => s.xp,
    goal: 10000,
  },
  {
    id: 'xp-50k',
    name: 'Fifty Thousand XP',
    description: 'Earn 50,000 XP in total.',
    icon: '💎',
    tier: 'gold',
    group: 'practice',
    measure: (s) => s.xp,
    goal: 50000,
  },
  {
    id: 'xp-100k',
    name: 'Six Figures',
    description: 'Earn 100,000 XP in total.',
    icon: '🏔️',
    tier: 'legend',
    group: 'practice',
    measure: (s) => s.xp,
    goal: 100000,
  },

  // ── Skill ladders ──────────────────────────────────────────────────────────
  {
    id: 'adder',
    name: 'Adder',
    description: 'Reach level 5 in Addition.',
    icon: '➕',
    tier: 'silver',
    group: 'skill',
    measure: (s) => levelOf(s, 'add'),
    goal: 5,
  },
  {
    id: 'subtractor',
    name: 'Subtractor',
    description: 'Reach level 5 in Subtraction.',
    icon: '➖',
    tier: 'silver',
    group: 'skill',
    measure: (s) => levelOf(s, 'sub'),
    goal: 5,
  },
  {
    id: 'multiplier',
    name: 'Multiplier',
    description: 'Reach level 5 in Multiplication.',
    icon: '✖️',
    tier: 'silver',
    group: 'skill',
    measure: (s) => levelOf(s, 'mul'),
    goal: 5,
  },
  {
    id: 'divider',
    name: 'Divider',
    description: 'Reach level 5 in Division.',
    icon: '➗',
    tier: 'silver',
    group: 'skill',
    measure: (s) => levelOf(s, 'div'),
    goal: 5,
  },
  {
    id: 'foundations',
    name: 'Foundations',
    description: 'Reach level 3 in all four skills.',
    icon: '🧱',
    tier: 'bronze',
    group: 'skill',
    measure: weakestLevel,
    goal: 3,
  },
  {
    id: 'all-rounder',
    name: 'All-Rounder',
    description: 'Reach level 5 in all four skills.',
    icon: '🧭',
    tier: 'gold',
    group: 'skill',
    measure: weakestLevel,
    goal: 5,
  },
  {
    id: 'well-balanced',
    name: 'Well Balanced',
    description: 'Reach level 8 in all four skills.',
    icon: '⚖️',
    tier: 'gold',
    group: 'skill',
    measure: weakestLevel,
    goal: 8,
  },
  {
    id: 'no-weak-side',
    name: 'No Weak Side',
    description: 'Reach level 10 in all four skills.',
    icon: '🛡️',
    tier: 'legend',
    group: 'skill',
    measure: weakestLevel,
    goal: 10,
  },
  {
    id: 'specialist',
    name: 'Specialist',
    description: 'Reach level 10 in any one skill.',
    icon: '🎯',
    tier: 'gold',
    group: 'skill',
    measure: (s) => Math.max(...AREAS.map((a) => levelOf(s, a))),
    goal: 10,
  },
  {
    id: 'into-the-extremes',
    name: 'Into the Extremes',
    description: 'Reach level 15 in any one skill.',
    icon: '🌋',
    tier: 'legend',
    group: 'skill',
    measure: (s) => Math.max(...AREAS.map((a) => levelOf(s, a))),
    goal: 15,
  },
  {
    id: 'off-the-chart',
    name: 'Off the Chart',
    description: 'Reach level 20 in any one skill.',
    icon: '☄️',
    tier: 'legend',
    group: 'skill',
    measure: (s) => Math.max(...AREAS.map((a) => levelOf(s, a))),
    goal: 20,
  },
  {
    id: 'four-ways',
    name: 'Four Ways',
    description: 'Answer 100 questions in each of the four skills.',
    icon: '🧮',
    tier: 'gold',
    group: 'skill',
    measure: (s) => Math.min(...AREAS.map((a) => s.counts[a] || 0)),
    goal: 100,
  },

  // ── Speed and streaks ──────────────────────────────────────────────────────
  {
    id: 'quick-draw',
    name: 'Quick Draw',
    description: 'Answer 25 questions at lightning speed.',
    icon: '⚡',
    tier: 'bronze',
    group: 'speed',
    measure: (s) => s.lightningSolves,
    goal: 25,
  },
  {
    id: 'fast-hands',
    name: 'Fast Hands',
    description: 'Answer 100 questions at lightning speed.',
    icon: '💨',
    tier: 'silver',
    group: 'speed',
    measure: (s) => s.lightningSolves,
    goal: 100,
  },
  {
    id: 'lightning-rod',
    name: 'Lightning Rod',
    description: 'Answer 250 questions at lightning speed.',
    icon: '🌩️',
    tier: 'gold',
    group: 'speed',
    measure: (s) => s.lightningSolves,
    goal: 250,
  },
  {
    id: 'thunderstruck',
    name: 'Thunderstruck',
    description: 'Answer 1,000 questions at lightning speed.',
    icon: '⛈️',
    tier: 'legend',
    group: 'speed',
    measure: (s) => s.lightningSolves,
    goal: 1000,
  },
  {
    id: 'first-five',
    name: 'Warmed Up',
    description: 'Get 5 right in a row.',
    icon: '✨',
    tier: 'bronze',
    group: 'speed',
    measure: (s) => s.bestStreak,
    goal: 5,
  },
  {
    id: 'on-a-roll',
    name: 'On a Roll',
    description: 'Get 10 right in a row.',
    icon: '🔥',
    tier: 'bronze',
    group: 'speed',
    measure: (s) => s.bestStreak,
    goal: 10,
  },
  {
    id: 'steady-hand',
    name: 'Steady Hand',
    description: 'Get 25 right in a row.',
    icon: '🎏',
    tier: 'silver',
    group: 'speed',
    measure: (s) => s.bestStreak,
    goal: 25,
  },
  {
    id: 'unbroken',
    name: 'Unbroken',
    description: 'Get 50 right in a row.',
    icon: '💠',
    tier: 'gold',
    group: 'speed',
    measure: (s) => s.bestStreak,
    goal: 50,
  },
  {
    id: 'flawless',
    name: 'Flawless',
    description: 'Get 100 right in a row.',
    icon: '👑',
    tier: 'legend',
    group: 'speed',
    measure: (s) => s.bestStreak,
    goal: 100,
  },

  // ── Mixed challenge ────────────────────────────────────────────────────────
  {
    id: 'challenger',
    name: 'Challenger',
    description: 'Finish your first mixed challenge.',
    icon: '🎲',
    tier: 'bronze',
    group: 'challenge',
    measure: (s) => s.challengeRuns,
    goal: 1,
  },
  {
    id: 'combo-artist',
    name: 'Combo Artist',
    description: 'Reach a combo of 15 in a challenge.',
    icon: '🎰',
    tier: 'silver',
    group: 'challenge',
    measure: (s) => s.challengeBestCombo,
    goal: 15,
  },
  {
    id: 'chain-reaction',
    name: 'Chain Reaction',
    description: 'Reach a combo of 30 in a challenge.',
    icon: '⛓️',
    tier: 'gold',
    group: 'challenge',
    measure: (s) => s.challengeBestCombo,
    goal: 30,
  },
  {
    id: 'unbreakable-chain',
    name: 'Unbreakable',
    description: 'Reach a combo of 50 in a challenge.',
    icon: '🪢',
    tier: 'legend',
    group: 'challenge',
    measure: (s) => s.challengeBestCombo,
    goal: 50,
  },
  {
    id: 'regular-challenger',
    name: 'Regular Challenger',
    description: 'Finish 5 mixed challenges.',
    icon: '🃏',
    tier: 'bronze',
    group: 'challenge',
    measure: (s) => s.challengeRuns,
    goal: 5,
  },
  {
    id: 'high-scorer',
    name: 'High Scorer',
    description: 'Score 300 in a single challenge.',
    icon: '🏆',
    tier: 'silver',
    group: 'challenge',
    measure: (s) => s.challengeBestScore,
    goal: 300,
  },
  {
    id: 'record-breaker',
    name: 'Record Breaker',
    description: 'Score 800 in a single challenge.',
    icon: '🥇',
    tier: 'legend',
    group: 'challenge',
    measure: (s) => s.challengeBestScore,
    goal: 800,
  },
  {
    id: 'veteran',
    name: 'Veteran',
    description: 'Finish 25 mixed challenges.',
    icon: '🎖️',
    tier: 'gold',
    group: 'challenge',
    measure: (s) => s.challengeRuns,
    goal: 25,
  },
  {
    id: 'centurion',
    name: 'Centurion',
    description: 'Finish 100 mixed challenges.',
    icon: '🛡️',
    tier: 'legend',
    group: 'challenge',
    measure: (s) => s.challengeRuns,
    goal: 100,
  },
  {
    id: 'top-score',
    name: 'Top of the Board',
    description: 'Score 500 in a single challenge.',
    icon: '📈',
    tier: 'gold',
    group: 'challenge',
    measure: (s) => s.challengeBestScore,
    goal: 500,
  },

  // ── Classwork ──────────────────────────────────────────────────────────────
  {
    id: 'homework-done',
    name: 'Handed In',
    description: 'Hand in your first assignment.',
    icon: '📘',
    tier: 'bronze',
    group: 'class',
    measure: (s) => s.assignmentsHandedIn,
    goal: 1,
  },
  {
    id: 'diligent',
    name: 'Diligent',
    description: 'Hand in 10 assignments.',
    icon: '📚',
    tier: 'silver',
    group: 'class',
    measure: (s) => s.assignmentsHandedIn,
    goal: 10,
  },
  {
    id: 'full-marks',
    name: 'Full Marks',
    description: 'Get every question right on an assignment.',
    icon: '⭐',
    tier: 'silver',
    group: 'class',
    measure: (s) => s.perfectAssignments,
    goal: 1,
  },
  {
    id: 'straight-a',
    name: 'Straight A',
    description: 'Get full marks on 5 assignments.',
    icon: '🌟',
    tier: 'gold',
    group: 'class',
    measure: (s) => s.perfectAssignments,
    goal: 5,
  },
  {
    id: 'dependable',
    name: 'Dependable',
    description: 'Hand in 25 assignments.',
    icon: '🗂️',
    tier: 'gold',
    group: 'class',
    measure: (s) => s.assignmentsHandedIn,
    goal: 25,
  },
  {
    id: 'never-misses',
    name: 'Never Misses',
    description: 'Hand in 50 assignments.',
    icon: '🎓',
    tier: 'legend',
    group: 'class',
    measure: (s) => s.assignmentsHandedIn,
    goal: 50,
  },
  {
    id: 'immaculate',
    name: 'Immaculate',
    description: 'Get full marks on 15 assignments.',
    icon: '🏵️',
    tier: 'legend',
    group: 'class',
    measure: (s) => s.perfectAssignments,
    goal: 15,
  },
];

export const BADGE_BY_ID = new Map(BADGES.map((b) => [b.id, b]));

export const GROUP_LABEL: Record<BadgeGroup, string> = {
  practice: 'Practice',
  skill: 'Skills',
  speed: 'Speed & streaks',
  challenge: 'Challenges',
  class: 'Classwork',
};

export const TIER_LABEL: Record<BadgeTier, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  legend: 'Legend',
};

/** How much of a moment a tier deserves, low to high. */
export const TIER_RANK: Record<BadgeTier, number> = {
  bronze: 0,
  silver: 1,
  gold: 2,
  legend: 3,
};

/**
 * Stored ids back to their definitions, best tier first.
 *
 * Ids come from the database and the catalogue is code, so a badge retired in a
 * later release leaves its id behind on every student who earned it. Dropping
 * what we no longer recognise keeps that a non-event rather than a blank card.
 * Ordering by tier matters where several unlock at once: a Legend arriving
 * underneath a Bronze buries the one the student actually worked for.
 */
export function badgesByIds(ids: Iterable<string>): BadgeDef[] {
  const wanted = new Set(ids);
  return BADGES.filter((b) => wanted.has(b.id)).sort(
    (a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier]
  );
}

/**
 * What each measure reads for a student who has done nothing at all. Level
 * ladders start at 1, not 0, so without this a brand-new student is shown
 * "level 1 of 5" as a fifth of the way to a badge they have not started.
 */
const FLOOR = new Map(BADGES.map((b) => [b.id, Math.max(0, b.measure(EMPTY_BADGE_STATS))]));

export interface BadgeProgress {
  badge: BadgeDef;
  have: number;
  goal: number;
  earned: boolean;
  /** True once the student has moved off the starting value. */
  started: boolean;
  /** 0–100, clamped, measured from the floor rather than from zero. */
  pct: number;
}

export function badgeProgress(stats: BadgeStats, earnedIds: Iterable<string> = []): BadgeProgress[] {
  const earnedSet = new Set(earnedIds);
  return BADGES.map((badge) => {
    const have = Math.max(0, badge.measure(stats));
    const floor = FLOOR.get(badge.id) ?? 0;
    // A badge already recorded stays earned even if the measure would now read
    // lower — an achievement is a thing that happened, not a current reading.
    const earned = earnedSet.has(badge.id) || have >= badge.goal;
    const span = Math.max(1, badge.goal - floor);
    return {
      badge,
      have,
      goal: badge.goal,
      earned,
      started: have > floor,
      pct: earned ? 100 : Math.max(0, Math.min(100, ((have - floor) / span) * 100)),
    };
  });
}

/**
 * Badges the stats now satisfy that aren't already recorded. This is what gets
 * written to the database and shown as a celebration.
 */
export function newlyEarned(stats: BadgeStats, earnedIds: Iterable<string>): BadgeDef[] {
  const earnedSet = new Set(earnedIds);
  return BADGES.filter((b) => !earnedSet.has(b.id) && b.measure(stats) >= b.goal);
}

/** The next few badges within reach, for a "keep going" nudge on the profile. */
export function nextUp(stats: BadgeStats, earnedIds: Iterable<string>, limit = 3): BadgeProgress[] {
  return badgeProgress(stats, earnedIds)
    .filter((p) => !p.earned && p.started)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, limit);
}
