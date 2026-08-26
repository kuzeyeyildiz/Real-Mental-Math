import { supabase } from './supabase';
import { fetched, pgError, written, type Fetched, type Written } from './result';
import { EMPTY_BADGE_STATS, type BadgeStats } from '../engine/badges';
import type { ChallengeSummary } from '../engine/challengeEngine';
import type { ProgressRow } from './api';

// ── Badges ───────────────────────────────────────────────────────────────────

export interface EarnedBadge {
  badgeId: string;
  earnedAt: string;
}

export function getEarnedBadges(studentId: string): Promise<Fetched<EarnedBadge[]>> {
  return fetched(async () => {
    const { data, error } = await supabase
      .from('numo_student_badges')
      .select('badge_id, earned_at')
      .eq('student_id', studentId)
      .order('earned_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => ({ badgeId: row.badge_id, earnedAt: row.earned_at }));
  });
}

/**
 * Record newly earned badges. `ignoreDuplicates` matters: two tabs open at once
 * would otherwise race, and the loser's whole insert would fail on the primary
 * key — losing badges the student really did earn.
 */
export function awardBadges(studentId: string, badgeIds: string[]): Promise<Written> {
  return written(async () => {
    if (badgeIds.length === 0) return { error: null };
    const { error } = await supabase
      .from('numo_student_badges')
      .upsert(
        badgeIds.map((badgeId) => ({ student_id: studentId, badge_id: badgeId })),
        { onConflict: 'student_id,badge_id', ignoreDuplicates: true }
      );
    return pgError(error);
  });
}

// ── Challenge runs ───────────────────────────────────────────────────────────

export interface ChallengeRun {
  id: string;
  score: number;
  correct: number;
  answered: number;
  bestCombo: number;
  xpEarned: number;
  durationMs: number;
  playedAt: string;
}

export function getChallengeRuns(studentId: string, limit = 20): Promise<Fetched<ChallengeRun[]>> {
  return fetched(async () => {
    const { data, error } = await supabase
      .from('numo_challenge_runs')
      .select('id, score, correct, answered, best_combo, xp_earned, duration_ms, played_at')
      .eq('student_id', studentId)
      .order('played_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.id,
      score: row.score,
      correct: row.correct,
      answered: row.answered,
      bestCombo: row.best_combo,
      xpEarned: row.xp_earned,
      durationMs: row.duration_ms,
      playedAt: row.played_at,
    }));
  });
}

export function saveChallengeRun(
  studentId: string,
  summary: ChallengeSummary,
  durationMs: number
): Promise<Written> {
  return written(async () => {
    const { error } = await supabase.from('numo_challenge_runs').insert({
      student_id: studentId,
      score: summary.score,
      correct: summary.correct,
      answered: summary.answered,
      best_combo: summary.bestCombo,
      xp_earned: summary.xpTotal,
      duration_ms: durationMs,
    });
    return pgError(error);
  });
}

// ── Badge stats ──────────────────────────────────────────────────────────────

/** Personal bests across every challenge run, so the badges can read them. */
export interface ChallengeTotals {
  runs: number;
  bestScore: number;
  bestCombo: number;
}

export interface AssignmentTotals {
  handedIn: number;
  perfect: number;
}

/**
 * Everything the badge catalogue reads, gathered in one place. Practice
 * counters ride on the progress row the app already holds; the challenge and
 * assignment totals are aggregated here rather than denormalised onto it, so
 * there is no second copy of the truth to drift.
 */
export function getBadgeStats(
  studentId: string,
  progress: ProgressRow | null
): Promise<Fetched<BadgeStats>> {
  return fetched(async () => {
    const [runsRes, subsRes] = await Promise.all([
      supabase.from('numo_challenge_runs').select('score, best_combo').eq('student_id', studentId),
      supabase
        .from('numo_assignment_submissions')
        .select('correct, total')
        .eq('student_id', studentId),
    ]);
    if (runsRes.error) throw runsRes.error;
    if (subsRes.error) throw subsRes.error;

    const runs = runsRes.data ?? [];
    const subs = subsRes.data ?? [];

    return {
      ...EMPTY_BADGE_STATS,
      solved: progress?.solved ?? 0,
      xp: progress?.xp ?? 0,
      counts: progress?.counts ?? EMPTY_BADGE_STATS.counts,
      skillXp: progress?.skillXp ?? EMPTY_BADGE_STATS.skillXp,
      bestStreak: progress?.bestStreak ?? 0,
      lightningSolves: progress?.lightningSolves ?? 0,
      daysPractised: progress?.daysPractised ?? 0,
      challengeRuns: runs.length,
      challengeBestScore: runs.reduce((best, r) => Math.max(best, r.score), 0),
      challengeBestCombo: runs.reduce((best, r) => Math.max(best, r.best_combo), 0),
      assignmentsHandedIn: subs.length,
      // A zero-question assignment can't be aced, so it doesn't count as full marks.
      perfectAssignments: subs.filter((s) => s.total > 0 && s.correct === s.total).length,
    };
  });
}

/**
 * Refresh the practice half of a stats snapshot from the progress row the app
 * already holds. Avoids a round trip after every answer — only the challenge
 * and assignment totals need the database, and those don't move during practice.
 */
export function mergeProgressIntoStats(stats: BadgeStats, progress: ProgressRow): BadgeStats {
  return {
    ...stats,
    solved: progress.solved,
    xp: progress.xp,
    counts: progress.counts,
    skillXp: progress.skillXp,
    bestStreak: progress.bestStreak,
    lightningSolves: progress.lightningSolves,
    daysPractised: progress.daysPractised,
  };
}

/** Applies the challenge's XP to the student's ladders and totals. */
export function applyChallengeXp(progress: ProgressRow, summary: ChallengeSummary): ProgressRow {
  return {
    ...progress,
    xp: progress.xp + summary.xpTotal,
    skillXp: {
      add: progress.skillXp.add + summary.xpSplit.add,
      sub: progress.skillXp.sub + summary.xpSplit.sub,
      mul: progress.skillXp.mul + summary.xpSplit.mul,
      div: progress.skillXp.div + summary.xpSplit.div,
    },
    solved: progress.solved + summary.correct,
    bestStreak: Math.max(progress.bestStreak, summary.bestCombo),
    lightningSolves: progress.lightningSolves + summary.lightning,
  };
}
