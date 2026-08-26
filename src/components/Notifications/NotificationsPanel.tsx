import { PanelError, PanelLoading } from '../panels/PanelState';
import { groupByDay, resolveNotification, timeAgo } from '../../engine/notifications';
import type { useNotifications } from '../../lib/useNotifications';
import p from '../panels/panels.module.css';
import s from './notifications.module.css';

interface NotificationsPanelProps {
  /** The live inbox from `useNotifications`, shared with the bell in the header. */
  inbox: ReturnType<typeof useNotifications>;
  /** What lands here differs by role, so the empty state says so. */
  emptyHint?: string;
}

const STUDENT_EMPTY =
  'Nothing yet. Homework, messages from your teacher, badges and friend invitations all turn up here.';

export function NotificationsPanel({ inbox, emptyHint = STUDENT_EMPTY }: NotificationsPanelProps) {
  const { state, items, unread, reload, markAllRead, dismiss, dismissAll } = inbox;

  // Background polls are quiet, so this is only ever the first read.
  if (state.status === 'loading') {
    return <PanelLoading label="Loading your notifications…" />;
  }
  if (state.status === 'error') {
    return (
      <PanelError
        title="Couldn’t load your notifications"
        message={state.message}
        onRetry={() => void reload()}
      />
    );
  }

  const groups = groupByDay(items);

  return (
    <div className={p.panel}>
      <div className={p.panelHead}>
        <div>
          <h2 className={p.panelTitle}>Notifications</h2>
          <p className={p.panelSub}>
            {unread > 0
              ? `${unread} new since you last looked.`
              : 'Everything here has been read.'}
          </p>
        </div>
        <div className={s.headActions}>
          <button
            type="button"
            className={p.btnQuiet}
            onClick={() => void markAllRead()}
            disabled={unread === 0}
          >
            Mark all read
          </button>
          <button
            type="button"
            className={p.btnQuiet}
            onClick={() => void dismissAll()}
            disabled={items.length === 0}
          >
            Clear all
          </button>
        </div>
      </div>

      {items.length === 0 && (
        <div className={p.empty}>{emptyHint}</div>
      )}

      {groups.map((group) => (
        <section key={group.bucket}>
          <h3 className={s.dayHeading}>{group.label}</h3>
          <ul className={s.list}>
            {group.items.map((item) => {
              const { icon, title, body } = resolveNotification(item);
              return (
                <li
                  key={item.id}
                  className={`${s.item} ${item.readAt ? '' : s.itemUnread}`}
                >
                  <span className={s.icon} aria-hidden="true">{icon}</span>
                  <div className={s.itemText}>
                    <span className={s.itemTitle}>
                      {title}
                      {!item.readAt && <span className={s.dot} aria-label="Unread" />}
                    </span>
                    {body && <span className={s.itemBody}>{body}</span>}
                    <span className={s.itemTime}>{timeAgo(item.createdAt)}</span>
                  </div>
                  <button
                    type="button"
                    className={p.btnQuiet}
                    onClick={() => void dismiss(item.id)}
                    aria-label={`Dismiss: ${title}`}
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default NotificationsPanel;
