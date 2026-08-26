import { describe, it, expect } from 'vitest';
import {
  dayBucket,
  groupByDay,
  resolveNotification,
  timeAgo,
  unreadCount,
  type NotificationItem,
} from './notifications';
import {
  filterClassmates,
  foldName,
  friendBoard,
  matchesQuery,
  sortClassmates,
  type Classmate,
  type Friend,
} from './friends';
import { BADGES } from './badges';

const at = (iso: string, over: Partial<NotificationItem> = {}): NotificationItem => ({
  id: iso,
  kind: 'post',
  title: 'Something happened',
  body: null,
  subjectId: null,
  classroomId: null,
  createdAt: iso,
  readAt: null,
  ...over,
});

describe('notification wording', () => {
  const now = new Date('2026-07-26T12:00:00Z');

  it('reads coarsely, the way a child would say it', () => {
    expect(timeAgo('2026-07-26T11:59:30Z', now)).toBe('just now');
    expect(timeAgo('2026-07-26T11:40:00Z', now)).toBe('20 min ago');
    expect(timeAgo('2026-07-26T11:00:00Z', now)).toBe('1 hour ago');
    expect(timeAgo('2026-07-26T04:00:00Z', now)).toBe('8 hours ago');
    expect(timeAgo('2026-07-25T09:00:00Z', now)).toBe('yesterday');
    expect(timeAgo('2026-07-23T09:00:00Z', now)).toBe('3 days ago');
  });

  it('never says a row arrived in the future when the clocks disagree', () => {
    // The server stamps created_at; a browser a few seconds behind would
    // otherwise render "in -4 seconds".
    expect(timeAgo('2026-07-26T12:00:04Z', now)).toBe('just now');
  });

  it('survives a timestamp it cannot parse instead of rendering NaN', () => {
    expect(timeAgo('not a date', now)).toBe('');
    expect(dayBucket('not a date', now)).toBe('earlier');
  });
});

describe('badge notifications', () => {
  it('resolves the slug against the catalogue, so the name lives in one place', () => {
    const badge = BADGES[0];
    const resolved = resolveNotification(
      at('2026-07-26T10:00:00Z', { kind: 'badge', title: 'Badge unlocked', subjectId: badge.id })
    );
    expect(resolved.title).toBe(`Badge unlocked: ${badge.name}`);
    expect(resolved.icon).toBe(badge.icon);
    expect(resolved.body).toBe(badge.description);
  });

  it('falls back to the stored title when a slug is no longer in the catalogue', () => {
    const resolved = resolveNotification(
      at('2026-07-26T10:00:00Z', { kind: 'badge', title: 'Badge unlocked', subjectId: 'retired-badge' })
    );
    expect(resolved.title).toBe('Badge unlocked');
    expect(resolved.icon).not.toBe('');
  });
});

describe('grouping the inbox', () => {
  // Local midnight, because "today" is the reader's day.
  const now = new Date(2026, 6, 26, 12, 0, 0);
  const localIso = (day: number, hour: number) => new Date(2026, 6, day, hour).toISOString();

  it('buckets by calendar day, not by a rolling 24 hours', () => {
    // 20 hours earlier, but still yesterday on the calendar.
    expect(dayBucket(localIso(25, 16), now)).toBe('yesterday');
    expect(dayBucket(localIso(26, 1), now)).toBe('today');
    expect(dayBucket(localIso(20, 12), now)).toBe('earlier');
  });

  it('drops empty buckets and orders newest first inside each', () => {
    const groups = groupByDay(
      [at(localIso(26, 9)), at(localIso(26, 11)), at(localIso(20, 9))],
      now
    );
    expect(groups.map((g) => g.bucket)).toEqual(['today', 'earlier']);
    expect(groups[0].items.map((i) => i.createdAt)).toEqual([localIso(26, 11), localIso(26, 9)]);
  });

  it('counts only what has not been read', () => {
    expect(
      unreadCount([
        at(localIso(26, 9)),
        at(localIso(26, 10), { readAt: localIso(26, 11) }),
        at(localIso(26, 11)),
      ])
    ).toBe(2);
  });
});

describe('finding a classmate by name', () => {
  it('matches Turkish names as they are actually typed', () => {
    expect(foldName('Aylin Yılmaz')).toBe('aylin yilmaz');
    expect(matchesQuery('Aylin Yılmaz', 'yilmaz')).toBe(true);
    expect(matchesQuery('Şule Çetin', 'sule')).toBe(true);
    expect(matchesQuery('Şule Çetin', 'cetin')).toBe(true);
    expect(matchesQuery('İpek Öz', 'ipek')).toBe(true);
    expect(matchesQuery('Ahmet Demir', 'zzz')).toBe(false);
  });

  it('treats an empty box as no filter at all', () => {
    expect(matchesQuery('Anyone', '   ')).toBe(true);
  });
});

describe('ordering the classmate list', () => {
  const mate = (fullName: string, relation: Classmate['relation']): Classmate => ({
    id: fullName,
    fullName,
    grade: null,
    relation,
    requestId: null,
  });

  it('puts what needs answering first and settled friendships last', () => {
    const sorted = sortClassmates([
      mate('Deniz', 'friend'),
      mate('Bora', 'outgoing'),
      mate('Ali', 'none'),
      mate('Ceren', 'incoming'),
    ]);
    expect(sorted.map((c) => c.fullName)).toEqual(['Ceren', 'Ali', 'Bora', 'Deniz']);
  });

  it('keeps that order while filtering', () => {
    const list = [mate('Ali Yılmaz', 'none'), mate('Ceren Yılmaz', 'incoming')];
    expect(filterClassmates(list, 'yilmaz').map((c) => c.fullName)).toEqual([
      'Ceren Yılmaz',
      'Ali Yılmaz',
    ]);
  });
});

describe('the friends board', () => {
  const friend = (id: string, weeklyXp: number, ranked = true): Friend => ({
    id,
    fullName: id,
    grade: null,
    friendsSince: '2026-07-01T00:00:00Z',
    xp: weeklyXp * 10,
    weeklyXp,
    ranked,
  });

  const me = { id: 'me', name: 'Me', xp: 500, weeklyXp: 50 };

  it('includes the student, because a ranking without you is odd to read', () => {
    const rows = friendBoard([friend('a', 90)], me);
    expect(rows.map((r) => r.id)).toEqual(['a', 'me']);
    expect(rows.find((r) => r.isMe)?.position).toBe(2);
  });

  it('leaves out a friend whose teacher has rankings switched off', () => {
    // Being friends must not become a way around the class leaderboard switch.
    const rows = friendBoard([friend('hidden', 999, false), friend('shown', 10)], me);
    expect(rows.map((r) => r.id)).toEqual(['me', 'shown']);
  });

  it('gives tied students the same position', () => {
    const rows = friendBoard([friend('a', 50), friend('b', 50)], me);
    expect(rows.map((r) => r.position)).toEqual([1, 1, 1]);
  });

  it('ranks on the week, using lifetime XP only to break a tie', () => {
    const rows = friendBoard(
      [{ ...friend('veteran', 50), xp: 9000 }, { ...friend('rookie', 50), xp: 10 }],
      { ...me, weeklyXp: 10 }
    );
    expect(rows.map((r) => r.id)).toEqual(['veteran', 'rookie', 'me']);
  });
});
