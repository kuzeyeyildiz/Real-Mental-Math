import s from './notifications.module.css';

interface NotificationBellProps {
  unread: number;
  active: boolean;
  onOpen: () => void;
}

/** Anything past this is "lots", and a three-digit badge stops being a badge. */
const MAX_SHOWN = 9;

export function NotificationBell({ unread, active, onOpen }: NotificationBellProps) {
  const label =
    unread === 0
      ? 'Notifications'
      : `Notifications, ${unread} unread`;

  return (
    <button
      type="button"
      className={`${s.bell} ${active ? s.bellActive : ''}`}
      onClick={onOpen}
      aria-pressed={active}
      aria-label={label}
    >
      <span aria-hidden="true" className={s.bellIcon}>🔔</span>
      {unread > 0 && (
        // aria-hidden: the count is already in the button's label, and a screen
        // reader announcing "9+" on its own says nothing useful.
        <span aria-hidden="true" className={s.bellCount}>
          {unread > MAX_SHOWN ? `${MAX_SHOWN}+` : unread}
        </span>
      )}
    </button>
  );
}

export default NotificationBell;
