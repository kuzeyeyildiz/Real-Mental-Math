import type { Area, SkillXp } from '../types';
import { AREAS, skillLevelFromXp } from './skillLadder';

/**
 * Structural, not the api layer's RosterEntry: analytics is pure maths over
 * numbers and must stay testable without a database row shape.
 */
export interface AnalyticsStudent {
  id: string;
  name: string;
  xp: number;
  solved: number;
  skillXp: SkillXp;
  lastActive: string | null;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface AreaStat {
  area: Area;
  averageLevel: number;
  /** Lowest and highest level in the class, for spotting a split cohort. */
  minLevel: number;
  maxLevel: number;
}

export interface ClassAnalytics {
  students: number;
  totalSolved: number;
  averageXp: number;
  activeThisWeek: number;
  areas: AreaStat[];
  /**
   * Weakest areas across the class — where a lesson would help most. Empty when
   * every skill sits at the same average, because then there isn't one, and it
   * lists all of them on a tie rather than picking whichever came first.
   */
  weakestAreas: Area[];
  /**
   * Students who have not practised in a week, or who have never started.
   * Named for what a teacher does with it, not for a threshold.
   */
  needsAttention: AnalyticsStudent[];
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function analyseClass(
  students: AnalyticsStudent[],
  now = Date.now()
): ClassAnalytics {
  if (students.length === 0) {
    return {
      students: 0,
      totalSolved: 0,
      averageXp: 0,
      activeThisWeek: 0,
      areas: AREAS.map((area) => ({ area, averageLevel: 0, minLevel: 0, maxLevel: 0 })),
      weakestAreas: [],
      needsAttention: [],
    };
  }

  const areas: AreaStat[] = AREAS.map((area) => {
    const levels = students.map((s) => skillLevelFromXp(s.skillXp[area]));
    return {
      area,
      averageLevel: Math.round(mean(levels) * 10) / 10,
      minLevel: Math.min(...levels),
      maxLevel: Math.max(...levels),
    };
  });

  const isActive = (s: AnalyticsStudent) => {
    if (!s.lastActive) return false;
    const at = new Date(s.lastActive).getTime();
    return Number.isFinite(at) && now - at <= WEEK_MS;
  };

  // With no spread there is no weakest skill, and naming one anyway would just
  // be reporting array order as if it were a finding.
  const lowest = Math.min(...areas.map((a) => a.averageLevel));
  const highest = Math.max(...areas.map((a) => a.averageLevel));
  const weakestAreas =
    lowest < highest ? areas.filter((a) => a.averageLevel === lowest).map((a) => a.area) : [];

  return {
    students: students.length,
    totalSolved: students.reduce((sum, s) => sum + s.solved, 0),
    averageXp: Math.round(mean(students.map((s) => s.xp))),
    activeThisWeek: students.filter(isActive).length,
    areas,
    weakestAreas,
    // A student with no practice at all is the most urgent case, so sort the
    // never-started to the front rather than mixing them in by date.
    needsAttention: students
      .filter((s) => !isActive(s))
      .sort((a, b) => {
        if (!a.lastActive && b.lastActive) return -1;
        if (a.lastActive && !b.lastActive) return 1;
        return (a.solved ?? 0) - (b.solved ?? 0);
      }),
  };
}
