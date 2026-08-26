import { supabase } from './supabase';
import { toUserMessage } from './errors';
import { fetched, written, type Fetched } from './result';
import { AREAS, seedSkillXp } from '../engine/skillLadder';
import type { Area, BenchmarkResult, Classroom, Level, Profile, SkillXp } from '../types';

export type { Fetched };

// ── Benchmark ────────────────────────────────────────────────────────────────

export type LatestBenchmark = (BenchmarkResult & { taken_at: string }) | null;

export function getLatestBenchmark(studentId: string): Promise<Fetched<LatestBenchmark>> {
  return fetched(async () => {
    const { data, error } = await supabase
      .from('numo_benchmark_results')
      .select('score, level, breakdown, taken_at')
      .eq('student_id', studentId)
      .order('taken_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      score: Number(data.score),
      level: data.level as Level,
      breakdown: data.breakdown as BenchmarkResult['breakdown'],
      taken_at: data.taken_at,
    };
  });
}

/**
 * Saving a placement also opens the per-skill ladders, so a student who aced
 * multiplication does not start it back at level 1. The seed is written only
 * where the ladder is still untouched — a retake must never wipe XP the student
 * has since earned by practising.
 */
export function saveBenchmark(
  studentId: string,
  result: BenchmarkResult
): Promise<{ error: string | null }> {
  return written(async () => {
    const { error } = await supabase.from('numo_benchmark_results').insert({
      student_id: studentId,
      score: result.score,
      level: result.level,
      breakdown: result.breakdown,
    });
    if (error) return { error: toUserMessage(error) };

    const seed = seedSkillXp(result.breakdown);
    const { data: existing, error: readError } = await supabase
      .from('numo_practice_progress')
      .select('skill_xp')
      .eq('student_id', studentId)
      .maybeSingle();
    if (readError) return { error: toUserMessage(readError) };

    const current = normaliseSkillXp(existing?.skill_xp);
    const merged: SkillXp = { ...current };
    for (const area of AREAS) {
      if (current[area] === 0) merged[area] = seed[area];
    }

    const { error: seedError } = await supabase
      .from('numo_practice_progress')
      .upsert({ student_id: studentId, skill_xp: toJson(merged), updated_at: new Date().toISOString() });
    if (seedError) return { error: toUserMessage(seedError) };

    // A student who skipped and later took it has plainly stopped declining.
    // Kept here rather than at the call site so the two can never disagree.
    return setPlacementDeclined(studentId, false);
  });
}

/**
 * Record — or withdraw — the student's decision to skip the placement test.
 * Skipping is not permanent: the offer stays available from the profile, and
 * taking the test later clears this.
 */
export function setPlacementDeclined(
  userId: string,
  declined: boolean
): Promise<{ error: string | null }> {
  return written(async () => {
    const { error } = await supabase
      .from('numo_profiles')
      .update({ placement_declined_at: declined ? new Date().toISOString() : null })
      .eq('id', userId);
    return { error: error ? toUserMessage(error) : null };
  });
}

// ── Practice progress ────────────────────────────────────────────────────────

export interface ProgressRow {
  xp: number;
  streak: number;
  solved: number;
  counts: Record<Area, number>;
  skillXp: SkillXp;
  bestStreak: number;
  lightningSolves: number;
  /** Distinct days with any practice — a consistency measure, not a streak. */
  daysPractised: number;
  /** ISO date (yyyy-mm-dd) of the last day counted, so a day counts once. */
  lastPracticeDay: string | null;
}

/** Local calendar date, because "today" means the student's day, not UTC's. */
export function today(now = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/**
 * Advance the practice-day counter, once per calendar day. Kept pure and
 * separate so the rule is testable without a database.
 *
 * It returns *only* the two day fields, never the row it was handed. Callers
 * spread the result last:
 *
 *     { ...current, ...snapshot, ...rollPracticeDay(current, day) }
 *
 * so returning `current` unchanged on a repeat day — which the `Pick<>` return
 * type happily allows, since a wider object still satisfies it — put the whole
 * pre-existing row back on top of the new one. Every save after the first of any
 * given day silently wrote the values the session had started with.
 */
export function rollPracticeDay(
  current: Pick<ProgressRow, 'daysPractised' | 'lastPracticeDay'>,
  day: string
): Pick<ProgressRow, 'daysPractised' | 'lastPracticeDay'> {
  if (current.lastPracticeDay === day) {
    return { daysPractised: current.daysPractised, lastPracticeDay: current.lastPracticeDay };
  }
  return { daysPractised: current.daysPractised + 1, lastPracticeDay: day };
}

/** SkillXp has fixed keys, so it needs widening before Postgres accepts it as jsonb. */
const toJson = (xp: SkillXp): Record<string, number> => ({ ...xp });

/** A jsonb column can hold anything; coerce it before it reaches the ladder maths. */
function normaliseSkillXp(raw: unknown): SkillXp {
  const source = (raw ?? {}) as Record<string, unknown>;
  const out: SkillXp = { add: 0, sub: 0, mul: 0, div: 0 };
  for (const area of AREAS) {
    const value = Number(source[area]);
    out[area] = Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
  }
  return out;
}

export function getProgress(studentId: string): Promise<Fetched<ProgressRow | null>> {
  return fetched(async () => {
    const { data, error } = await supabase
      .from('numo_practice_progress')
      .select(
        'xp, streak, solved, counts, skill_xp, best_streak, lightning_solves, days_practised, last_practice_day'
      )
      .eq('student_id', studentId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      xp: data.xp,
      streak: data.streak,
      solved: data.solved,
      counts: data.counts as Record<Area, number>,
      skillXp: normaliseSkillXp(data.skill_xp),
      bestStreak: data.best_streak,
      lightningSolves: data.lightning_solves,
      daysPractised: data.days_practised,
      lastPracticeDay: data.last_practice_day,
    };
  });
}

export function saveProgress(
  studentId: string,
  progress: ProgressRow
): Promise<{ error: string | null }> {
  return written(async () => {
    const { error } = await supabase.from('numo_practice_progress').upsert({
      student_id: studentId,
      xp: progress.xp,
      streak: progress.streak,
      solved: progress.solved,
      counts: progress.counts,
      skill_xp: toJson(progress.skillXp),
      best_streak: progress.bestStreak,
      lightning_solves: progress.lightningSolves,
      days_practised: progress.daysPractised,
      last_practice_day: progress.lastPracticeDay,
      updated_at: new Date().toISOString(),
    });
    return { error: error ? toUserMessage(error) : null };
  });
}

// ── Classrooms ───────────────────────────────────────────────────────────────

export async function createClassroom(
  name: string
): Promise<{ classroom: Classroom | null; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('numo_create_classroom', { classroom_name: name });
    if (error) return { classroom: null, error: toUserMessage(error) };
    return { classroom: data as unknown as Classroom, error: null };
  } catch (err) {
    return { classroom: null, error: toUserMessage(err) };
  }
}

export async function joinClassroom(
  code: string
): Promise<{ classroom: Classroom | null; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('numo_join_classroom', { code });
    if (error) return { classroom: null, error: toUserMessage(error) };
    return { classroom: data as unknown as Classroom, error: null };
  } catch (err) {
    return { classroom: null, error: toUserMessage(err) };
  }
}

/**
 * Benchmark placement is hidden from students by default; the teacher who owns
 * their classroom decides whether to reveal it.
 */
export function setClassroomReveal(
  classroomId: string,
  reveal: boolean
): Promise<{ error: string | null }> {
  return written(async () => {
    const { error } = await supabase
      .from('numo_classrooms')
      .update({ reveal_benchmark: reveal })
      .eq('id', classroomId);
    return { error: error ? toUserMessage(error) : null };
  });
}

export function getTeacherClassrooms(teacherId: string): Promise<Fetched<Classroom[]>> {
  return fetched(async () => {
    const { data, error } = await supabase
      .from('numo_classrooms')
      .select('*')
      .eq('teacher_id', teacherId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as Classroom[];
  });
}

export function getStudentClassrooms(studentId: string): Promise<Fetched<Classroom[]>> {
  return fetched(async () => {
    const { data, error } = await supabase
      .from('numo_classroom_members')
      .select('numo_classrooms(*)')
      .eq('student_id', studentId);
    if (error) throw error;
    return (data ?? [])
      .map((row) => (row as unknown as { numo_classrooms: Classroom }).numo_classrooms)
      .filter(Boolean);
  });
}

// ── Daily XP history ─────────────────────────────────────────────────────────
/*
 * `numo_practice_progress` holds running totals, so it can say how much a
 * student has earned in all but not how much they earned on Tuesday. A trigger
 * on that table records each save's delta into `numo_daily_xp`, filed under the
 * student's own local day. Nothing here writes: the history is a by-product of
 * saving progress, so it cannot drift from it.
 */

export const DAILY_WINDOW = 7;

/** The last `days` local calendar days, oldest first, ending today. */
export function recentDays(days = DAILY_WINDOW, now = new Date()): string[] {
  const out: string[] = [];
  for (let back = days - 1; back >= 0; back--) {
    const date = new Date(now);
    date.setDate(date.getDate() - back);
    out.push(today(date));
  }
  return out;
}

interface DailyRow {
  student_id?: string;
  day: string;
  xp: number;
}

/** One number per day in the window. A day with no row earned nothing. */
export function toDailySeries(rows: DailyRow[], days: string[]): number[] {
  const byDay = new Map(rows.map((r) => [r.day, r.xp]));
  return days.map((day) => byDay.get(day) ?? 0);
}

export interface DailyXp {
  /** yyyy-mm-dd, oldest first. */
  days: string[];
  /** XP earned on each of those days, same order. */
  xp: number[];
}

export function getDailyXp(studentId: string, days = DAILY_WINDOW): Promise<Fetched<DailyXp>> {
  return fetched(async () => {
    const window = recentDays(days);
    const { data, error } = await supabase
      .from('numo_daily_xp')
      .select('day, xp')
      .eq('student_id', studentId)
      .gte('day', window[0]);
    if (error) throw error;
    return { days: window, xp: toDailySeries((data ?? []) as DailyRow[], window) };
  });
}

export interface RosterEntry {
  profile: Profile;
  level: Level | null;
  score: number | null;
  xp: number;
  solved: number;
  skillXp: SkillXp;
  lastActive: string | null;
  /** XP earned on each of the last seven days, oldest first. */
  dailyXp: number[];
}

export function getClassroomRoster(classroomId: string): Promise<Fetched<RosterEntry[]>> {
  return fetched(async () => {
    const { data: members, error } = await supabase
      .from('numo_classroom_members')
      .select('student_id, numo_profiles(*)')
      .eq('classroom_id', classroomId);
    if (error) throw error;

    const studentIds = (members ?? []).map((m) => (m as { student_id: string }).student_id);
    if (studentIds.length === 0) return [];

    const window = recentDays();
    const [benchRes, progressRes, dailyRes] = await Promise.all([
      supabase
        .from('numo_benchmark_results')
        .select('student_id, score, level, taken_at')
        .in('student_id', studentIds)
        .order('taken_at', { ascending: false }),
      supabase
        .from('numo_practice_progress')
        .select('student_id, xp, solved, skill_xp, updated_at')
        .in('student_id', studentIds),
      supabase
        .from('numo_daily_xp')
        .select('student_id, day, xp')
        .in('student_id', studentIds)
        .gte('day', window[0]),
    ]);
    if (benchRes.error) throw benchRes.error;
    if (progressRes.error) throw progressRes.error;
    if (dailyRes.error) throw dailyRes.error;

    const dailyByStudent = new Map<string, DailyRow[]>();
    for (const row of (dailyRes.data ?? []) as DailyRow[]) {
      const id = row.student_id ?? '';
      const list = dailyByStudent.get(id) ?? [];
      list.push(row);
      dailyByStudent.set(id, list);
    }

    const latestByStudent = new Map<string, { score: number; level: Level }>();
    for (const b of benchRes.data ?? []) {
      const row = b as { student_id: string; score: number; level: Level };
      if (!latestByStudent.has(row.student_id)) {
        latestByStudent.set(row.student_id, { score: Number(row.score), level: row.level });
      }
    }

    type ProgressPart = Pick<RosterEntry, 'xp' | 'solved' | 'skillXp' | 'lastActive'>;
    const progressByStudent = new Map<string, ProgressPart>();
    for (const p of progressRes.data ?? []) {
      const row = p as {
        student_id: string;
        xp: number;
        solved: number;
        skill_xp: unknown;
        updated_at: string;
      };
      progressByStudent.set(row.student_id, {
        xp: row.xp,
        solved: row.solved,
        skillXp: normaliseSkillXp(row.skill_xp),
        lastActive: row.updated_at,
      });
    }

    return (members ?? []).map((m) => {
      const row = m as unknown as { student_id: string; numo_profiles: Profile };
      const bench = latestByStudent.get(row.student_id);
      const progress = progressByStudent.get(row.student_id);
      return {
        profile: row.numo_profiles,
        level: bench?.level ?? null,
        score: bench?.score ?? null,
        xp: progress?.xp ?? 0,
        solved: progress?.solved ?? 0,
        skillXp: progress?.skillXp ?? { add: 0, sub: 0, mul: 0, div: 0 },
        lastActive: progress?.lastActive ?? null,
        dailyXp: toDailySeries(dailyByStudent.get(row.student_id) ?? [], window),
      };
    });
  });
}
