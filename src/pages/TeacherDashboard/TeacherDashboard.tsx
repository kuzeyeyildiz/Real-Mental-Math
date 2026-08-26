import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { AppShell, type NavItem } from '../../components/AppShell/AppShell';
import { ErrorBoundary } from '../../components/ErrorBoundary/ErrorBoundary';
import { StatusScreen } from '../../components/StatusScreen/StatusScreen';
import { useAuth } from '../../auth/AuthProvider';
import {
  createClassroom,
  getTeacherClassrooms,
  getClassroomRoster,
  setClassroomReveal,
  type RosterEntry,
} from '../../lib/api';
import { useCopy } from '../../lib/useCopy';
import { RosterPanel } from './panels/RosterPanel';
import { OverviewPanel } from './panels/OverviewPanel';
import { AssignmentsPanel } from './panels/AssignmentsPanel';
import { AnalyticsPanel } from './panels/AnalyticsPanel';
import { MaterialsPanel } from '../../components/MaterialsPanel/MaterialsPanel';
import { StudySessionsPanel } from '../../components/StudySessionsPanel/StudySessionsPanel';
import { ClassFeedPanel } from '../../components/ClassFeedPanel/ClassFeedPanel';
import { NotificationBell } from '../../components/Notifications/NotificationBell';
import { NotificationsPanel } from '../../components/Notifications/NotificationsPanel';
import { useNotifications } from '../../lib/useNotifications';
import { setClassroomLeaderboards } from '../../lib/leagueApi';
import type { Classroom } from '../../types';
import s from './TeacherDashboard.module.css';

type Tab = 'overview' | 'roster' | 'feed' | 'assignments' | 'materials' | 'sessions' | 'analytics';

/**
 * Glyphs from the app's own vocabulary rather than emoji — see the student rail.
 * Grouped, because "who is in this class" and "what I am setting them" are two
 * different jobs and the old flat row of six ranked them the same.
 */
const TABS: { key: Tab; label: string; glyph: string; group: string }[] = [
  { key: 'overview', label: 'Overview', glyph: '◫', group: 'Class' },
  { key: 'roster', label: 'Roster', glyph: '◎', group: 'Class' },
  { key: 'feed', label: 'Feed', glyph: '≋', group: 'Class' },
  { key: 'assignments', label: 'Assignments', glyph: '≡', group: 'Teaching' },
  { key: 'materials', label: 'Material', glyph: '▤', group: 'Teaching' },
  { key: 'sessions', label: 'Sessions', glyph: '◷', group: 'Teaching' },
  { key: 'analytics', label: 'Analytics', glyph: '▲', group: 'Teaching' },
];

const TAB_LABEL = new Map(TABS.map((t) => [t.key, t.label]));

/** Classroom settings that are a plain on/off the teacher owns. */
type ClassroomSwitch = 'reveal_benchmark' | 'leaderboard_enabled' | 'global_leaderboard_enabled';

const SETTINGS: {
  field: ClassroomSwitch;
  label: string;
  on: string;
  off: string;
}[] = [
  {
    field: 'reveal_benchmark',
    label: 'Show placement scores to students',
    on: 'Students in this class can see their own assessment result.',
    off: 'Off — students see only their skill levels, not the assessment score.',
  },
  {
    field: 'leaderboard_enabled',
    label: 'Class leaderboard',
    on: 'Students can see a table of their classmates ranked by this week’s XP.',
    off: 'Off — students cannot see how they compare with their classmates.',
  },
  {
    field: 'global_leaderboard_enabled',
    label: 'Leagues and region leaderboards',
    on: 'Students may share a region and appear in tables beyond this class, under a first name and last initial.',
    off: 'Off — these students appear in no table outside this class, and cannot share a location at all.',
  },
];

export function TeacherDashboard() {
  const { session } = useAuth();
  const teacherId = session!.user.id;
  const inbox = useNotifications(teacherId);
  const [showInbox, setShowInbox] = useState(false);

  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [rosters, setRosters] = useState<Record<string, RosterEntry[]>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { copied, copy } = useCopy();
  const [revealBusy, setRevealBusy] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    const rooms = await getTeacherClassrooms(teacherId);
    // Showing an empty dashboard on a failed read would read as "my classes are
    // gone" rather than "the data didn't load".
    if (!rooms.ok) {
      setLoadError(rooms.error);
      setLoading(false);
      return;
    }
    setClassrooms(rooms.data);
    setActiveId((current) =>
      current && rooms.data.some((r) => r.id === current) ? current : rooms.data[0]?.id ?? null
    );
    const entries = await Promise.all(
      rooms.data.map(async (r) => {
        const roster = await getClassroomRoster(r.id);
        return [r.id, roster.ok ? roster.data : []] as const;
      })
    );
    setRosters(Object.fromEntries(entries));
    setLoading(false);
  }, [teacherId]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true);
    setError(null);
    const { error: err } = await createClassroom(newName.trim());
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setNewName('');
    setCreating(false);
    void loadAll();
  }

  async function copyCode(code: string) {
    if (await copy(code)) return;
    setError(`Couldn’t copy automatically — the code is ${code}.`);
  }

  async function toggleSetting(room: Classroom, field: ClassroomSwitch) {
    const next = !room[field];
    setRevealBusy(room.id);
    setError(null);
    // Optimistic: the switch should respond immediately, but roll back on error
    // so the teacher is never shown a setting that didn't actually save.
    const apply = (value: boolean) =>
      setClassrooms((rooms) => rooms.map((r) => (r.id === room.id ? { ...r, [field]: value } : r)));
    apply(next);

    const { error: err } =
      field === 'reveal_benchmark'
        ? await setClassroomReveal(room.id, next)
        : await setClassroomLeaderboards(room.id, { [field]: next });

    setRevealBusy(null);
    if (err) {
      apply(!next);
      setError(err);
    }
  }

  const active = classrooms.find((r) => r.id === activeId) ?? null;
  const roster = useMemo(() => (active ? rosters[active.id] ?? [] : []), [active, rosters]);

  const bell = (
    <NotificationBell
      unread={inbox.unread}
      active={showInbox}
      onOpen={() => setShowInbox((open) => !open)}
    />
  );

  const items: NavItem[] = TABS.map((t) => ({
    key: t.key,
    label: t.label,
    glyph: t.glyph,
    group: t.group,
    count: t.key === 'roster' && roster.length > 0 ? String(roster.length) : undefined,
  }));

  const nav = {
    label: 'Classroom sections',
    items,
    // Nothing is highlighted while the inbox is open, which is the honest
    // answer — it is reached from the bell, not from the rail.
    active: showInbox ? '' : tab,
    onSelect: (key: string) => {
      setShowInbox(false);
      setTab(key as Tab);
    },
  };

  const railTop = active ? (
    <ClassroomCard
      classrooms={classrooms}
      active={active}
      rosters={rosters}
      copied={copied}
      onSelect={setActiveId}
      onCopy={(code) => void copyCode(code)}
    />
  ) : undefined;

  const actions = (
    <>
      {active && (
        <button
          type="button"
          className={s.barBtnGhost}
          onClick={() => setSettingsOpen(true)}
        >
          Class settings
        </button>
      )}
      <button type="button" className={s.barBtn} onClick={() => setCreating((v) => !v)}>
        {creating ? 'Cancel' : 'New class'}
      </button>
    </>
  );

  const shell = {
    nav,
    railTop,
    actions,
    headerExtra: bell,
    title: showInbox ? 'Notifications' : TAB_LABEL.get(tab) ?? 'Class',
    subtitle: showInbox ? undefined : active?.name,
  };

  const banner = (
    <>
      {error && <div className={s.error} role="alert">{error}</div>}

      {loadError && (
        <div className={s.error} role="alert">
          {loadError}{' '}
          <button type="button" className={s.errorRetry} onClick={() => void loadAll()}>
            Retry
          </button>
        </div>
      )}

      {creating && (
        <form className={s.createCard} onSubmit={handleCreate}>
          <div className={s.createRow}>
            <input
              className={s.createInput}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New classroom name (e.g. 6-B Math)"
              aria-label="Classroom name"
              autoFocus
            />
            <button type="submit" className={s.createBtn} disabled={busy}>
              {busy ? 'Creating…' : 'Create class'}
            </button>
          </div>
        </form>
      )}
    </>
  );

  if (showInbox) {
    return (
      <AppShell {...shell}>
        <div className="numo-section">
          <button type="button" className={s.backLink} onClick={() => setShowInbox(false)}>
            ← Back to your classrooms
          </button>
          {/* Same rule as every other panel: a crash in the inbox must not take
              the dashboard down with it. */}
          <ErrorBoundary>
            <div className={s.inboxBody}>
              <NotificationsPanel
                inbox={inbox}
                emptyHint="Nothing yet. Students joining your classes and handing in homework will show up here."
              />
            </div>
          </ErrorBoundary>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell {...shell}>
      <div className="numo-section">
        {banner}

        {loading && <StatusScreen compact title="Loading your classrooms…" />}

        {!loading && classrooms.length === 0 && !loadError && (
          <div className={s.emptyState}>
            You don’t have a class yet. Create one, then share its join code with your students.
          </div>
        )}

        {active && (
          /* Each panel does its own reads and writes, so a crash in one must
             not take the dashboard — or the other panels — down with it. */
          <ErrorBoundary key={`${active.id}-${tab}`}>
            {tab === 'overview' && (
              <OverviewPanel
                roster={roster}
                classroom={active}
                onOpenRoster={() => setTab('roster')}
              />
            )}
            {tab === 'roster' && (
              <RosterPanel
                roster={roster}
                className={active.name}
                classroomId={active.id}
                teacherId={teacherId}
                joinCode={active.join_code}
              />
            )}
            {tab === 'assignments' && (
              <AssignmentsPanel classroomId={active.id} roster={roster} />
            )}
            {tab === 'materials' && (
              <MaterialsPanel classroomId={active.id} teacherId={teacherId} canManage />
            )}
            {tab === 'sessions' && (
              <StudySessionsPanel classroomId={active.id} userId={teacherId} canModerate />
            )}
            {tab === 'analytics' && (
              <AnalyticsPanel classroomId={active.id} roster={roster} teacherId={teacherId} />
            )}
            {tab === 'feed' && (
              <ClassFeedPanel classroomId={active.id} userId={teacherId} canPost />
            )}
          </ErrorBoundary>
        )}
      </div>

      {settingsOpen && active && (
        <SettingsDialog
          room={active}
          busy={revealBusy === active.id}
          onToggle={(field) => void toggleSetting(active, field)}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </AppShell>
  );
}

/** The rail's classroom block: which class, its join code, and how big it is. */
function ClassroomCard({
  classrooms,
  active,
  rosters,
  copied,
  onSelect,
  onCopy,
}: {
  classrooms: Classroom[];
  active: Classroom;
  rosters: Record<string, RosterEntry[]>;
  copied: string | null;
  onSelect: (id: string) => void;
  onCopy: (code: string) => void;
}) {
  const size = (rosters[active.id] ?? []).length;
  const others = classrooms.length - 1;

  return (
    <div className={s.classroomCard}>
      <div className={s.classroomLabel}>Classroom</div>

      {classrooms.length > 1 ? (
        <select
          className={s.classroomSelect}
          value={active.id}
          onChange={(e) => onSelect(e.target.value)}
          aria-label="Choose a classroom"
        >
          {classrooms.map((room) => (
            <option key={room.id} value={room.id}>
              {room.name}
            </option>
          ))}
        </select>
      ) : (
        <div className={s.classroomName}>{active.name}</div>
      )}

      <div className={s.codeChip}>
        <span className={s.codeValue}>{active.join_code}</span>
        <button
          type="button"
          className={s.copyBtn}
          onClick={() => onCopy(active.join_code)}
          aria-label={`Copy the join code for ${active.name}`}
        >
          {copied === active.join_code ? 'Copied!' : 'Copy'}
        </button>
      </div>

      <div className={s.classroomMeta}>
        {size} {size === 1 ? 'student' : 'students'}
        {others > 0 && ` · ${others} other ${others === 1 ? 'class' : 'classes'}`}
      </div>
    </div>
  );
}

/**
 * The three privacy switches, moved out of the page and behind a button. Their
 * labels and hint text are unchanged — that copy tells a teacher exactly what
 * turning each one on exposes about a child.
 */
function SettingsDialog({
  room,
  busy,
  onToggle,
  onClose,
}: {
  room: Classroom;
  busy: boolean;
  onToggle: (field: ClassroomSwitch) => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={s.backdrop} onClick={onClose} role="presentation">
      <div
        className={s.sheet}
        role="dialog"
        aria-modal="true"
        aria-label={`Settings for ${room.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={s.sheetHead}>
          <div>
            <h2 className={s.sheetTitle}>Class settings</h2>
            <p className={s.sheetSub}>{room.name}</p>
          </div>
          <button ref={closeRef} type="button" className={s.sheetClose} onClick={onClose}>
            Close
          </button>
        </header>

        <div className={s.settingRow}>
          {SETTINGS.map(({ field, label, on, off }) => (
            <label key={field} className={s.switchLabel}>
              <input
                type="checkbox"
                className={s.switchInput}
                checked={room[field]}
                disabled={busy}
                onChange={() => onToggle(field)}
              />
              <span className={s.switchTrack} aria-hidden="true">
                <span className={s.switchThumb} />
              </span>
              <span className={s.switchText}>
                {label}
                <span className={s.switchHint}>{room[field] ? on : off}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

export default TeacherDashboard;
