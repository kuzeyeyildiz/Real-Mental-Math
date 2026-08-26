import type { ReactNode } from 'react';
import { Logo } from '../Logo/Logo';
import { useAuth } from '../../auth/AuthProvider';
import s from './AppShell.module.css';

export interface NavItem {
  key: string;
  label: string;
  /**
   * A typographic mark from the app's own vocabulary — × ≡ ▲ ◎ — not an emoji.
   * Emoji stay where the data model actually stores them, on badges and
   * notifications; navigation is chrome and reads better in the display face.
   */
  glyph: string;
  /** Right-aligned and quiet: a roster size, a number of assignments. */
  count?: string;
  /** Right-aligned and loud: something unread or overdue. */
  badge?: string;
  /** Heading drawn above this item when it differs from the previous one's. */
  group?: string;
}

export interface NavModel {
  /** Names the landmark, e.g. "Sections". */
  label: string;
  items: readonly NavItem[];
  active: string;
  onSelect: (key: string) => void;
}

/** The two numbers a student should never have to open a tab to see. */
export interface ShellStatus {
  streak?: number;
  xp?: number;
}

interface AppShellProps {
  /**
   * The app's primary destinations. AppShell owns where they are drawn — a rail
   * down the side on a wide screen, a bar along the bottom on a narrow one — so
   * no page has to know about either.
   */
  nav?: NavModel;
  /** Names the screen, top left of the bar. */
  title?: string;
  /** A quiet qualifier beside the title — which class, whose profile. */
  subtitle?: string;
  /** Second-level tabs, drawn as a segmented control beside the title. */
  subnav?: ReactNode;
  /** Page-level buttons, right of the bar and left of the bell. */
  actions?: ReactNode;
  /** Streak and XP chips. Passed in rather than read from context, so the shell
   *  stays ignorant of what a progress row is. */
  status?: ShellStatus;
  /** Sits between the logo and the nav — the teacher's classroom card. */
  railTop?: ReactNode;
  /** Pushed to the bottom of the rail — the student's placement block. */
  railFooter?: ReactNode;
  /** Sits beside the account block — currently the notifications bell. */
  headerExtra?: ReactNode;
  children: ReactNode;
}

/**
 * Second-level navigation, drawn as a segmented control in the top bar. Shared
 * from here rather than from a page, because the bar is what it sits in.
 */
export function Segmented<T extends string>({
  label,
  tabs,
  active,
  onSelect,
}: {
  label: string;
  tabs: readonly { key: T; label: string }[];
  active: T;
  onSelect: (key: T) => void;
}) {
  return (
    <nav className={s.segmented} aria-label={label}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          className={`${s.segment} ${active === tab.key ? s.segmentOn : ''}`}
          onClick={() => onSelect(tab.key)}
          aria-pressed={active === tab.key}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

export function AppShell({
  nav,
  title,
  subtitle,
  subnav,
  actions,
  status,
  railTop,
  railFooter,
  headerExtra,
  children,
}: AppShellProps) {
  const { profile, signOut } = useAuth();

  const initials = (profile?.full_name || '?')
    .split(' ')
    .map((word) => word[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className={s.shell}>
      {/* A plain div, not an aside: below 900px it becomes `display: contents`
          so the nav inside can dock to the bottom of the screen, and a landmark
          that dissolves under a media query is worse than no landmark. */}
      <div className={s.rail}>
        <div className={s.brand}>
          <Logo size={32} showWordmark />
        </div>

        {railTop && <div className={s.railTop}>{railTop}</div>}

        {nav && (
          <nav className={s.nav} aria-label={nav.label}>
            {nav.items.map((item, i) => {
              const on = nav.active === item.key;
              const heading =
                item.group && item.group !== nav.items[i - 1]?.group ? item.group : null;
              return (
                <div key={item.key} className={s.navSlot}>
                  {heading && <span className={s.navGroup}>{heading}</span>}
                  <button
                    type="button"
                    onClick={() => nav.onSelect(item.key)}
                    // `aria-current` rather than `aria-pressed`: these are places
                    // to go, not switches that stay pushed in.
                    aria-current={on ? 'page' : undefined}
                    className={`${s.navItem} ${on ? s.navItemActive : ''}`}
                  >
                    <span className={s.navTile} aria-hidden="true">{item.glyph}</span>
                    <span className={s.navLabel}>{item.label}</span>
                    {item.count && <span className={s.navCount}>{item.count}</span>}
                    {item.badge && <span className={s.navBadge}>{item.badge}</span>}
                  </button>
                </div>
              );
            })}
          </nav>
        )}

        {railFooter && <div className={s.railFooter}>{railFooter}</div>}
      </div>

      <div className={s.column}>
        <header className={s.topBar}>
          {title && <span className={s.title}>{title}</span>}
          {subtitle && <span className={s.subtitle}>{subtitle}</span>}
          {subnav}

          <div className={s.account}>
            {status?.streak != null && status.streak > 0 && (
              <span className={s.streakChip}>
                <span className={s.streakDot} aria-hidden="true" />
                {status.streak}-day streak
              </span>
            )}
            {status?.xp != null && (
              <span className={s.xpChip}>{status.xp.toLocaleString()} XP</span>
            )}
            {actions}
            {headerExtra}
            <span className={s.avatar} title={profile?.full_name ?? undefined} aria-hidden="true">
              {initials}
            </span>
            <span className={s.srOnly}>
              Signed in as {profile?.full_name}, {profile?.role}
            </span>
            <button type="button" className={s.signOut} onClick={signOut}>
              Sign out
            </button>
          </div>
        </header>

        <main className={nav ? `${s.main} ${s.mainWithBar}` : s.main}>{children}</main>
      </div>
    </div>
  );
}

export default AppShell;
