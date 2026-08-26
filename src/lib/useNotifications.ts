import { useCallback, useEffect } from 'react';
import {
  dismissAllNotifications,
  dismissNotification,
  getNotifications,
  markNotificationsRead,
} from './socialApi';
import { unreadCount, type NotificationItem } from '../engine/notifications';
import { useFetched } from './useFetched';

/**
 * How often the inbox re-reads itself. Long enough that a class of thirty is
 * not hammering the database, short enough that a student handed homework
 * mid-lesson sees it without reloading the page.
 */
const POLL_MS = 90_000;

const NOTHING: NotificationItem[] = [];

/** The inbox, kept fresh in the background. Shared by the bell and the panel. */
export function useNotifications(userId: string) {
  const { state, reload, patch } = useFetched(getNotifications, userId);

  useEffect(() => {
    const tick = () => {
      // A hidden tab is nobody's inbox. Polling it just costs the database.
      if (document.visibilityState === 'visible') void reload(true);
    };
    const timer = setInterval(tick, POLL_MS);
    // Coming back to the tab is the moment a stale inbox is most obvious.
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', tick);
    };
  }, [reload]);

  const items = state.status === 'ready' ? state.data : NOTHING;

  const markAllRead = useCallback(async () => {
    const at = new Date().toISOString();
    patch((list) => list.map((n) => (n.readAt ? n : { ...n, readAt: at })));
    const { error } = await markNotificationsRead(null);
    // Re-read rather than guessing what stuck; the count on the bell has to be
    // right, and a wrong one is worse than a slow one.
    if (error) void reload(true);
  }, [patch, reload]);

  const dismiss = useCallback(
    async (id: string) => {
      patch((list) => list.filter((n) => n.id !== id));
      const { error } = await dismissNotification(id);
      if (error) void reload(true);
    },
    [patch, reload]
  );

  const dismissAll = useCallback(async () => {
    patch(() => []);
    const { error } = await dismissAllNotifications();
    if (error) void reload(true);
  }, [patch, reload]);

  return {
    state,
    items,
    unread: unreadCount(items),
    reload,
    markAllRead,
    dismiss,
    dismissAll,
  };
}
