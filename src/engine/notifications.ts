import { BADGE_BY_ID } from './badges';

/**
 * Everything about a notification that does not need the network: what kind of
 * thing it is, how it reads, and where it sits in the list. The database writes
 * the rows; this decides how they look.
 */

export const NOTIFICATION_KINDS = [
  'assignment',
  'feedback',
  'material',
  'session',
  'post',
  'friend_request',
  'friend_accepted',
  'badge',
  'joined_class',
  'submission',
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  /** A uuid for most kinds, a badge slug for `badge`. */
  subjectId: string | null;
  classroomId: string | null;
  createdAt: string;
  readAt: string | null;
}

const ICON: Record<NotificationKind, string> = {
  assignment: '📋',
  feedback: '💬',
  material: '📚',
  session: '🤝',
  post: '📣',
  friend_request: '👋',
  friend_accepted: '🎉',
  badge: '🏅',
  joined_class: '🚪',
  submission: '✅',
};

export interface ResolvedNotification {
  icon: string;
  title: string;
  body: string | null;
}

/**
 * Badge rows carry the catalogue slug rather than a name, so the database never
 * keeps a second copy of what a badge is called and the two cannot drift. An
 * unknown slug — a badge renamed since the row was written — still reads
 * sensibly instead of rendering blank.
 */
export function resolveNotification(item: NotificationItem): ResolvedNotification {
  if (item.kind === 'badge') {
    const badge = item.subjectId ? BADGE_BY_ID.get(item.subjectId) : undefined;
    if (badge) {
      return { icon: badge.icon, title: `Badge unlocked: ${badge.name}`, body: badge.description };
    }
  }
  return { icon: ICON[item.kind] ?? '•', title: item.title, body: item.body };
}

export function unreadCount(items: NotificationItem[]): number {
  return items.reduce((n, item) => (item.readAt === null ? n + 1 : n), 0);
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Deliberately coarse. A child reading "3 hours ago" learns everything they
 * need; a timestamp to the second is noise.
 */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  // Clock skew between the browser and the server can put a fresh row a few
  // seconds in the future. "In -2 seconds" would be nonsense, so clamp.
  const elapsed = Math.max(0, now.getTime() - then);

  if (elapsed < MINUTE) return 'just now';
  if (elapsed < HOUR) {
    const mins = Math.floor(elapsed / MINUTE);
    return `${mins} min ago`;
  }
  if (elapsed < DAY) {
    const hours = Math.floor(elapsed / HOUR);
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  }
  const days = Math.floor(elapsed / DAY);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export type DayBucket = 'today' | 'yesterday' | 'earlier';

export const BUCKET_LABEL: Record<DayBucket, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  earlier: 'Earlier',
};

/** Calendar days in the reader's own time zone, not 24-hour windows. */
export function dayBucket(iso: string, now: Date = new Date()): DayBucket {
  const then = new Date(iso);
  if (!Number.isFinite(then.getTime())) return 'earlier';
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const at = then.getTime();
  if (at >= startOfToday) return 'today';
  if (at >= startOfToday - DAY) return 'yesterday';
  return 'earlier';
}

export interface NotificationGroup {
  bucket: DayBucket;
  label: string;
  items: NotificationItem[];
}

/**
 * Groups newest first and drops empty buckets, so the panel never renders a
 * heading with nothing under it.
 */
export function groupByDay(
  items: NotificationItem[],
  now: Date = new Date()
): NotificationGroup[] {
  const order: DayBucket[] = ['today', 'yesterday', 'earlier'];
  const sorted = [...items].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return order
    .map((bucket) => ({
      bucket,
      label: BUCKET_LABEL[bucket],
      items: sorted.filter((item) => dayBucket(item.createdAt, now) === bucket),
    }))
    .filter((group) => group.items.length > 0);
}
