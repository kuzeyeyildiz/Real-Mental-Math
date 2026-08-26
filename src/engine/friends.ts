/**
 * Friend list maths (spec 23). Discovery is limited to classmates in the
 * database, so everything here is presentation: which classmates to show as a
 * student types, and in what order.
 */

export type FriendRelation = 'friend' | 'incoming' | 'outgoing' | 'none';

export interface Classmate {
  id: string;
  fullName: string;
  grade: string | null;
  relation: FriendRelation;
  /** The pending request, when there is one to answer or take back. */
  requestId: string | null;
}

/**
 * Turkish names are full of characters a child will not reach for while
 * searching. `Yılmaz` has to match `yilmaz`, and `Şule` has to match `sule`.
 * NFD strips the combining marks on ş/ğ/ç/ö/ü; dotless ı and dotted İ are
 * separate base letters, so they need naming outright.
 */
export function foldName(value: string): string {
  return value
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/** Matches on any word, so "yilmaz" finds "Aylin Yılmaz" without the first name. */
export function matchesQuery(name: string, query: string): boolean {
  const needle = foldName(query);
  if (needle === '') return true;
  const haystack = foldName(name);
  return haystack.split(/\s+/).some((word) => word.startsWith(needle)) || haystack.includes(needle);
}

const RELATION_ORDER: Record<FriendRelation, number> = {
  incoming: 0,
  none: 1,
  outgoing: 2,
  friend: 3,
};

/**
 * Invitations waiting on the student come first — they are the only rows with
 * something to do — then people they could add, then requests already sent, and
 * finally the friends they already have.
 */
export function sortClassmates(list: Classmate[]): Classmate[] {
  return [...list].sort(
    (a, b) =>
      RELATION_ORDER[a.relation] - RELATION_ORDER[b.relation] ||
      a.fullName.localeCompare(b.fullName)
  );
}

export function filterClassmates(list: Classmate[], query: string): Classmate[] {
  return sortClassmates(list.filter((c) => matchesQuery(c.fullName, query)));
}

export interface Friend {
  id: string;
  fullName: string;
  grade: string | null;
  friendsSince: string;
  xp: number;
  weeklyXp: number;
  /**
   * Whether a classroom the two share has the teacher's leaderboard switch on.
   * False means this friend's XP must not be shown — friendship is not a way
   * around spec 16a.
   */
  ranked: boolean;
}

export interface FriendBoardRow {
  id: string;
  name: string;
  weeklyXp: number;
  xp: number;
  isMe: boolean;
  position: number;
}

/**
 * The friends board, with the student themselves in it — a ranking of your
 * friends that leaves you out would be strange to read. Only friends whose XP
 * the teacher allows are included; ties share a position.
 */
export function friendBoard(
  friends: Friend[],
  me: { id: string; name: string; xp: number; weeklyXp: number }
): FriendBoardRow[] {
  const rows = [
    { id: me.id, name: me.name, weeklyXp: me.weeklyXp, xp: me.xp, isMe: true },
    ...friends
      .filter((f) => f.ranked)
      .map((f) => ({ id: f.id, name: f.fullName, weeklyXp: f.weeklyXp, xp: f.xp, isMe: false })),
  ].sort((a, b) => b.weeklyXp - a.weeklyXp || b.xp - a.xp || a.name.localeCompare(b.name));

  let position = 0;
  let lastWeekly: number | null = null;
  return rows.map((row, index) => {
    if (row.weeklyXp !== lastWeekly) {
      position = index + 1;
      lastWeekly = row.weeklyXp;
    }
    return { ...row, position };
  });
}
