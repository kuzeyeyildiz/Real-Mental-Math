import type { Area, Assignment, AssignmentSubmission } from '../types';

/**
 * The order questions are served in for one assignment run.
 *
 * Straight round-robin (add, sub, add, sub…) is predictable enough that a
 * student starts pre-loading the next operation instead of reading the problem,
 * so each pass through the chosen areas is shuffled. Every area still appears
 * an equal number of times, give or take the remainder.
 */
export function assignmentSequence(
  areas: Area[],
  count: number,
  random: () => number = Math.random
): Area[] {
  if (areas.length === 0 || count <= 0) return [];
  const out: Area[] = [];
  while (out.length < count) {
    const cycle = [...areas];
    // Fisher-Yates, so every ordering of a cycle is equally likely.
    for (let i = cycle.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [cycle[i], cycle[j]] = [cycle[j], cycle[i]];
    }
    out.push(...cycle.slice(0, count - out.length));
  }
  return out;
}

export type AssignmentStatus = 'done' | 'overdue' | 'due-soon' | 'open';

const DUE_SOON_MS = 48 * 60 * 60 * 1000;

/**
 * Submitted work is never "overdue" — once it is handed in the deadline stops
 * being something to nag a student about.
 */
export function assignmentStatus(
  assignment: Pick<Assignment, 'due_at'>,
  submission: Pick<AssignmentSubmission, 'submitted_at'> | null | undefined,
  now = Date.now()
): AssignmentStatus {
  if (submission) return 'done';
  if (!assignment.due_at) return 'open';
  const due = new Date(assignment.due_at).getTime();
  if (!Number.isFinite(due)) return 'open';
  if (due < now) return 'overdue';
  if (due - now <= DUE_SOON_MS) return 'due-soon';
  return 'open';
}

export const STATUS_LABEL: Record<AssignmentStatus, string> = {
  done: 'Handed in',
  overdue: 'Overdue',
  'due-soon': 'Due soon',
  open: 'To do',
};

/** Percentage correct, rounded. Zero questions scores 0 rather than NaN. */
export function accuracy(correct: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((correct / total) * 100);
}

export interface AssignmentProgress {
  /** Students the assignment was actually set for. */
  assigned: number;
  handedIn: number;
  /** Mean accuracy across submissions only — unsubmitted work is not a zero. */
  averageAccuracy: number;
}

export function summariseSubmissions(
  assigned: number,
  submissions: Pick<AssignmentSubmission, 'correct' | 'total'>[]
): AssignmentProgress {
  const handedIn = submissions.length;
  if (handedIn === 0) return { assigned, handedIn: 0, averageAccuracy: 0 };
  const mean =
    submissions.reduce((sum, s) => sum + accuracy(s.correct, s.total), 0) / handedIn;
  return { assigned, handedIn, averageAccuracy: Math.round(mean) };
}

// ── Formatting ───────────────────────────────────────────────────────────────

export function formatDue(due: string | null, now = Date.now()): string {
  if (!due) return 'No deadline';
  const at = new Date(due).getTime();
  if (!Number.isFinite(at)) return 'No deadline';
  const dayMs = 24 * 60 * 60 * 1000;
  const diff = at - now;
  const days = Math.round(diff / dayMs);
  if (diff < 0) {
    const late = Math.abs(days);
    if (late === 0) return 'Due today';
    return `${late} day${late === 1 ? '' : 's'} overdue`;
  }
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days <= 14) return `Due in ${days} days`;
  return `Due ${new Date(at).toLocaleDateString()}`;
}

/** "3 minutes ago" style, for feeds and roster rows. */
export function formatAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return 'never';
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return 'never';
  const secs = Math.max(0, Math.round((now - at) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(at).toLocaleDateString();
}

export function formatBytes(bytes: number | null): string {
  if (bytes == null || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}
