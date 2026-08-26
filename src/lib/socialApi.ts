import { supabase } from './supabase';
import { fetched, pgError, written, type Fetched, type Written } from './result';
import { weekStart } from '../engine/leagues';
import type { NotificationItem, NotificationKind } from '../engine/notifications';
import type { Classmate, Friend, FriendRelation } from '../engine/friends';

// ── Notifications (spec 22) ──────────────────────────────────────────────────

/**
 * The inbox is capped: nobody scrolls past fifty, and an unbounded read would
 * grow all year. Dismissing is the only way rows leave.
 */
const INBOX_LIMIT = 50;

function toNotification(row: Record<string, unknown>): NotificationItem {
  return {
    id: String(row.id),
    kind: String(row.kind) as NotificationKind,
    title: String(row.title),
    body: (row.body as string | null) ?? null,
    subjectId: (row.subject_id as string | null) ?? null,
    classroomId: (row.classroom_id as string | null) ?? null,
    createdAt: String(row.created_at),
    readAt: (row.read_at as string | null) ?? null,
  };
}

export function getNotifications(): Promise<Fetched<NotificationItem[]>> {
  return fetched(async () => {
    const { data, error } = await supabase
      .from('numo_notifications')
      .select('id, kind, title, body, subject_id, classroom_id, created_at, read_at')
      .order('created_at', { ascending: false })
      .limit(INBOX_LIMIT);
    if (error) throw error;
    return (data ?? []).map((r) => toNotification(r as Record<string, unknown>));
  });
}

/**
 * Null marks the whole inbox. This is an RPC rather than an update because
 * there is no update policy on the table — what a notification says has to stay
 * what the trigger wrote.
 */
export function markNotificationsRead(ids: string[] | null = null): Promise<Written> {
  return written(async () => {
    const { error } = await supabase.rpc('numo_mark_notifications_read', { ids });
    return pgError(error);
  });
}

export function dismissNotification(id: string): Promise<Written> {
  return written(async () => {
    const { error } = await supabase.from('numo_notifications').delete().eq('id', id);
    return pgError(error);
  });
}

export function dismissAllNotifications(): Promise<Written> {
  return written(async () => {
    const { data: me } = await supabase.auth.getUser();
    const userId = me.user?.id;
    // RLS would already scope this, but a delete with no filter is the kind of
    // line that gets copied somewhere the policy is weaker.
    if (!userId) return { error: 'Sign in first.' };
    const { error } = await supabase.from('numo_notifications').delete().eq('user_id', userId);
    return pgError(error);
  });
}

// ── Friends (spec 23) ────────────────────────────────────────────────────────

export function getClassmates(): Promise<Fetched<Classmate[]>> {
  return fetched(async () => {
    const { data, error } = await supabase.rpc('numo_classmates');
    if (error) throw error;
    return (data ?? []).map((row: Record<string, unknown>) => ({
      id: String(row.id),
      fullName: String(row.full_name),
      grade: (row.grade as string | null) ?? null,
      relation: String(row.relation) as FriendRelation,
      requestId: (row.request_id as string | null) ?? null,
    }));
  });
}

export function getFriends(week = weekStart()): Promise<Fetched<Friend[]>> {
  return fetched(async () => {
    const { data, error } = await supabase.rpc('numo_friends', { week });
    if (error) throw error;
    return (data ?? []).map((row: Record<string, unknown>) => ({
      id: String(row.id),
      fullName: String(row.full_name),
      grade: (row.grade as string | null) ?? null,
      friendsSince: String(row.friends_since),
      xp: Number(row.xp ?? 0),
      weeklyXp: Number(row.weekly_xp ?? 0),
      ranked: Boolean(row.ranked),
    }));
  });
}

/**
 * The classmate rule, the "already asked" rule and the cooldown after a decline
 * all live in the function, not here — the UI hides the buttons, but the server
 * is what actually enforces who a child can reach.
 */
export function sendFriendRequest(otherId: string): Promise<Written> {
  return written(async () => {
    const { error } = await supabase.rpc('numo_send_friend_request', { other: otherId });
    return pgError(error);
  });
}

export function respondFriendRequest(requestId: string, accept: boolean): Promise<Written> {
  return written(async () => {
    const { error } = await supabase.rpc('numo_respond_friend_request', {
      request: requestId,
      accept,
    });
    return pgError(error);
  });
}

/** Taking back an invitation you sent, before it is answered. */
export function cancelFriendRequest(requestId: string): Promise<Written> {
  return written(async () => {
    const { error } = await supabase.from('numo_friend_requests').delete().eq('id', requestId);
    return pgError(error);
  });
}

export function removeFriend(myId: string, otherId: string): Promise<Written> {
  return written(async () => {
    // The row is stored with the ids in a fixed order, so a friendship is one
    // row however you approach it.
    const [a, b] = myId < otherId ? [myId, otherId] : [otherId, myId];
    const { error } = await supabase
      .from('numo_friendships')
      .delete()
      .eq('user_a', a)
      .eq('user_b', b);
    return pgError(error);
  });
}
