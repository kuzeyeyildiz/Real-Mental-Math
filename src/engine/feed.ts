import type { Assignment, Material, MaterialCategory, MaterialKind, Post, StudySession } from '../types';
import { timeAgo } from './notifications';

/**
 * The class feed, assembled rather than stored.
 *
 * Everything in it already exists as a first-class row — a post, an assignment, a
 * material, a session — and a duplicate activity table would be one more thing to
 * keep in step with the truth. What this module adds is the *shape*: each entry
 * knows how to describe itself, and entries are grouped into calendar days rather
 * than laid out as one undifferentiated column.
 */

export type FeedKind = 'post' | 'assignment' | 'material' | 'session';

export interface FeedItem {
  kind: FeedKind;
  id: string;
  /** ISO timestamp this entry sorts and groups by. */
  at: string;
  /** One line, big enough to be the entry's heading. */
  title: string;
  /** Longer text, where the entry has any. */
  body: string | null;
  /** Short factual chips: a due date, a category, how many are coming. */
  facts: string[];
  /** The row this came from, for a caller that wants to act on it. */
  source: Post | Assignment | Material | StudySession;
}

export interface FeedDay {
  /** yyyy-mm-dd, so the key is stable across a re-render. */
  bucket: string;
  label: string;
  items: FeedItem[];
}

export const FEED_META: Record<FeedKind, { label: string; icon: string }> = {
  post: { label: 'Announcement', icon: '📣' },
  assignment: { label: 'Homework', icon: '📋' },
  material: { label: 'Material', icon: '📚' },
  session: { label: 'Study session', icon: '🤝' },
};

/** How many entries the feed shows. Older activity is still in its own tab. */
export const FEED_LIMIT = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The local calendar day a timestamp falls in, as yyyy-mm-dd.
 *
 * The inbox has its own three-bucket version, because an inbox only ever needs
 * today / yesterday / earlier. A feed spans weeks, so it needs a real day key —
 * and it has to be the *local* day, since "Tuesday" means the student's Tuesday.
 */
export function feedDayKey(iso: string, now = Date.now()): string {
  const at = new Date(iso);
  if (!Number.isFinite(at.getTime())) return new Date(now).toISOString().slice(0, 10);
  const y = at.getFullYear();
  const m = String(at.getMonth() + 1).padStart(2, '0');
  const d = String(at.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * When something happens, in words. Past and future read differently on purpose:
 * "in 3 days" and "3 days ago" are the two things a student actually needs to
 * tell apart on a deadline.
 */
function whenLabel(iso: string, now = Date.now()): string {
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return '';
  const diff = at - now;
  if (diff < 0) return timeAgo(iso, new Date(now));
  const days = Math.round(diff / DAY_MS);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days <= 14) return `in ${days} days`;
  return new Date(at).toLocaleDateString();
}

/** Whether a timestamp has already passed, so the caller can pick its wording. */
function isPast(iso: string, now = Date.now()): boolean {
  const at = new Date(iso).getTime();
  return Number.isFinite(at) && at < now;
}

/** A calendar-day heading: Today, Yesterday, then the weekday and date. */
export function dayLabel(key: string, now = Date.now()): string {
  if (key === feedDayKey(new Date(now).toISOString(), now)) return 'Today';
  if (key === feedDayKey(new Date(now - DAY_MS).toISOString(), now)) return 'Yesterday';
  // Noon, so a timezone offset can't shift the parsed date onto the day before.
  const at = new Date(`${key}T12:00:00`);
  if (!Number.isFinite(at.getTime())) return key;
  return at.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

const MATERIAL_KIND_WORD: Record<MaterialKind, string> = {
  file: 'A file',
  link: 'A link',
  note: 'A note',
  video: 'A video',
};

/**
 * Turn the four source tables into feed entries.
 *
 * `categoryLabel` is injected rather than imported so this stays free of the UI's
 * label catalogue and can be tested without it.
 */
export function buildFeed(
  posts: Post[],
  assignments: Assignment[],
  materials: Material[],
  sessions: StudySession[],
  options: {
    now?: number;
    categoryLabel?: (category: MaterialCategory) => string;
    sessionMembers?: (sessionId: string) => number;
  } = {}
): FeedItem[] {
  const now = options.now ?? Date.now();
  const categoryLabel = options.categoryLabel ?? ((c: MaterialCategory) => c);

  const items: FeedItem[] = [
    ...posts.map((post): FeedItem => ({
      kind: 'post',
      id: post.id,
      at: post.created_at,
      title: 'Announcement',
      body: post.body,
      facts: [],
      source: post,
    })),

    ...assignments.map((assignment): FeedItem => {
      const facts = [`${assignment.question_count} questions`];
      if (assignment.kind === 'custom') facts.push('written by the teacher');
      else if (assignment.kind === 'mixed') facts.push('mixed exercises');
      if (assignment.due_at) {
        facts.push(
          isPast(assignment.due_at, now)
            ? `was due ${whenLabel(assignment.due_at, now)}`
            : `due ${whenLabel(assignment.due_at, now)}`
        );
      }
      if (assignment.video_url) facts.push('has a video');
      return {
        kind: 'assignment',
        id: assignment.id,
        at: assignment.created_at,
        title: assignment.title,
        body: assignment.instructions,
        facts,
        source: assignment,
      };
    }),

    ...materials.map((material): FeedItem => ({
      kind: 'material',
      id: material.id,
      at: material.created_at,
      title: material.title,
      body: material.description,
      facts: [MATERIAL_KIND_WORD[material.kind], categoryLabel(material.category)],
      source: material,
    })),

    ...sessions.map((session): FeedItem => {
      const going = options.sessionMembers?.(session.id) ?? 0;
      const facts = [
        isPast(session.scheduled_at, now)
          ? `was ${whenLabel(session.scheduled_at, now)}`
          : whenLabel(session.scheduled_at, now),
      ];
      if (going > 0) facts.push(`${going} going`);
      return {
        kind: 'session',
        id: session.id,
        at: session.created_at,
        title: session.title,
        body: session.note,
        facts,
        source: session,
      };
    }),
  ];

  return items
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, FEED_LIMIT);
}

/**
 * Group into calendar days, newest first. Calendar days, not rolling 24-hour
 * windows: something posted at 11pm belongs under yesterday the next morning, not
 * under "1 day ago".
 */
export function groupFeedByDay(items: FeedItem[], now = Date.now()): FeedDay[] {
  const days: FeedDay[] = [];
  for (const item of items) {
    const bucket = feedDayKey(item.at, now);
    const last = days[days.length - 1];
    if (last && last.bucket === bucket) last.items.push(item);
    else days.push({ bucket, label: dayLabel(bucket, now), items: [item] });
  }
  return days;
}

/** Counts per kind, for the filter row. */
export function feedCounts(items: FeedItem[]): Record<FeedKind, number> {
  const counts: Record<FeedKind, number> = { post: 0, assignment: 0, material: 0, session: 0 };
  for (const item of items) counts[item.kind] += 1;
  return counts;
}
