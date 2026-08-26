import { supabase } from './supabase';
import { fetched, pgError, written, type Fetched, type Written } from './result';
import {
  COHORT_SIZE,
  LEAGUE_TIERS,
  activeTierCount,
  tierForRank,
  tierShares,
  weekStart,
  type LeagueTier,
  type StandingInput,
} from '../engine/leagues';

export interface LeagueContext {
  totalUsers: number;
  myRank: number;
  myXp: number;
  myWeeklyXp: number;
}

export interface LeaderboardRow extends StandingInput {
  xp: number;
}

/** Shapes an RPC row into the standings input the engine ranks. */
function toRow(row: {
  student_id: string;
  display_name: string;
  xp: number;
  weekly_xp: number;
}): LeaderboardRow {
  return {
    studentId: row.student_id,
    name: row.display_name,
    xp: row.xp,
    weeklyXp: row.weekly_xp,
  };
}

/**
 * Record this week's starting XP if it hasn't been recorded yet, then read the
 * caller's standing. The baseline write is idempotent server-side, so calling
 * this on every load is safe.
 */
export function getLeagueContext(week = weekStart()): Promise<Fetched<LeagueContext>> {
  return fetched(async () => {
    const baseline = await supabase.rpc('numo_ensure_week_baseline', { week });
    if (baseline.error) throw baseline.error;

    const { data, error } = await supabase.rpc('numo_league_context', { week });
    if (error) throw error;
    const row = (data ?? [])[0];
    return {
      totalUsers: row?.total_users ?? 0,
      myRank: row?.my_rank ?? 0,
      myXp: row?.my_xp ?? 0,
      myWeeklyXp: row?.my_weekly_xp ?? 0,
    };
  });
}

/**
 * The rank window covering a tier. Mirrors `tierForRank`'s pyramid so the
 * cohort we ask the server for is exactly the band the student was placed in.
 */
export function tierRankRange(tier: LeagueTier, totalUsers: number): { from: number; to: number } {
  const activeTiers = activeTierCount(totalUsers);
  const shares = tierShares(activeTiers);
  const index = LEAGUE_TIERS.indexOf(tier);

  let ceiling = 0;
  for (let i = activeTiers - 1; i > index; i--) {
    ceiling += Math.max(1, Math.round(totalUsers * shares[i]));
  }
  // The bottom tier absorbs whatever is left, so its floor is the population.
  const size = index === 0 ? totalUsers - ceiling : Math.max(1, Math.round(totalUsers * shares[index]));
  return { from: ceiling + 1, to: Math.max(ceiling + 1, ceiling + size) };
}

/**
 * The slice of the tier the student competes in this week. A tier wider than
 * one cohort is cut into consecutive blocks, and the student gets their own.
 */
export function cohortWindow(
  myRank: number,
  tier: LeagueTier,
  totalUsers: number
): { from: number; to: number } {
  const { from, to } = tierRankRange(tier, totalUsers);
  const offset = Math.max(0, myRank - from);
  const block = Math.floor(offset / COHORT_SIZE);
  const start = from + block * COHORT_SIZE;
  return { from: start, to: Math.min(to, start + COHORT_SIZE - 1) };
}

export function getLeagueCohort(
  context: LeagueContext,
  week = weekStart()
): Promise<Fetched<{ tier: LeagueTier; activeTiers: number; rows: LeaderboardRow[] }>> {
  return fetched(async () => {
    const tier = tierForRank(context.myRank, context.totalUsers);
    const activeTiers = activeTierCount(context.totalUsers);
    if (context.myRank <= 0) return { tier, activeTiers, rows: [] };

    const window = cohortWindow(context.myRank, tier, context.totalUsers);
    const { data, error } = await supabase.rpc('numo_league_cohort', {
      week,
      rank_from: window.from,
      rank_to: window.to,
    });
    if (error) throw error;
    return { tier, activeTiers, rows: (data ?? []).map(toRow) };
  });
}

/**
 * This week's XP for the caller alone. Reuses the league baseline rather than
 * keeping a second counter, so the friends board and the league can never
 * disagree about what a student earned this week.
 */
export function getMyWeeklyXp(currentXp: number, week = weekStart()): Promise<Fetched<number>> {
  return fetched(async () => {
    const { data, error } = await supabase.rpc('numo_ensure_week_baseline', { week });
    if (error) throw error;
    return Math.max(0, currentXp - Number(data ?? currentXp));
  });
}

export function getRegionLeaderboard(week = weekStart()): Promise<Fetched<LeaderboardRow[]>> {
  return fetched(async () => {
    const { data, error } = await supabase.rpc('numo_region_leaderboard', { week, limit_n: 30 });
    if (error) throw error;
    return (data ?? []).map(toRow);
  });
}

export function getClassLeaderboard(
  classroomId: string,
  week = weekStart()
): Promise<Fetched<LeaderboardRow[]>> {
  return fetched(async () => {
    const { data, error } = await supabase.rpc('numo_class_leaderboard', {
      room: classroomId,
      week,
    });
    if (error) throw error;
    return (data ?? []).map(toRow);
  });
}

// ── Region consent ───────────────────────────────────────────────────────────

export function getMyRegion(userId: string): Promise<Fetched<string | null>> {
  return fetched(async () => {
    const { data, error } = await supabase
      .from('numo_profiles')
      .select('region')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    return data?.region ?? null;
  });
}

/**
 * Save or clear the student's region. Passing null is the withdrawal path — it
 * must stay as easy as granting, so consent can actually be taken back.
 */
export function setMyRegion(userId: string, region: string | null): Promise<Written> {
  return written(async () => {
    const { error } = await supabase
      .from('numo_profiles')
      .update({ region, region_set_at: region ? new Date().toISOString() : null })
      .eq('id', userId);
    return pgError(error);
  });
}

// ── Teacher switches ─────────────────────────────────────────────────────────

export function setClassroomLeaderboards(
  classroomId: string,
  patch: { leaderboard_enabled?: boolean; global_leaderboard_enabled?: boolean }
): Promise<Written> {
  return written(async () => {
    const { error } = await supabase
      .from('numo_classrooms')
      .update(patch)
      .eq('id', classroomId);
    return pgError(error);
  });
}
