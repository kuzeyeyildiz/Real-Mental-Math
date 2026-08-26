import { useCallback, useEffect, useRef, useState } from 'react';
import { AppShell, Segmented, type NavItem } from '../../components/AppShell/AppShell';
import { PracticePanel, type ProgressSnapshot } from '../../components/PracticePanel/PracticePanel';
import { StudioPage } from '../StudioPage/StudioPage';
import { StatusScreen } from '../../components/StatusScreen/StatusScreen';
import { ErrorBoundary } from '../../components/ErrorBoundary/ErrorBoundary';
import { ChallengePanel } from '../../components/ChallengePanel/ChallengePanel';
import { AchievementsPanel } from '../../components/AchievementsPanel/AchievementsPanel';
import { LeaguePanel } from '../../components/LeaguePanel/LeaguePanel';
import { NotificationBell } from '../../components/Notifications/NotificationBell';
import { NotificationsPanel } from '../../components/Notifications/NotificationsPanel';
import { BadgeUnlockStack, type Unlock } from '../../components/BadgeUnlock/BadgeUnlock';
import { HomeworkPanel } from './panels/HomeworkPanel';
import { ClassPanel } from './panels/ClassPanel';
import { PlacementCard } from '../../components/PlacementCard/PlacementCard';
import { useAuth } from '../../auth/AuthProvider';
import { getStudentAssignments, type StudentAssignment } from '../../lib/classroomApi';
import { useFetched } from '../../lib/useFetched';
import {
  getProgress,
  getStudentClassrooms,
  rollPracticeDay,
  saveProgress,
  today,
  type ProgressRow,
} from '../../lib/api';
import {
  awardBadges,
  getBadgeStats,
  getEarnedBadges,
  mergeProgressIntoStats,
  type EarnedBadge,
} from '../../lib/gamificationApi';
import { useNotifications } from '../../lib/useNotifications';
import { EMPTY_BADGE_STATS, badgesByIds, newlyEarned, type BadgeStats } from '../../engine/badges';
import type { Classroom, Level } from '../../types';
import c from './StudentApp.module.css';

const DEFAULT_PROGRESS: ProgressRow = {
  xp: 0,
  streak: 0,
  solved: 0,
  counts: { add: 0, sub: 0, mul: 0, div: 0 },
  skillXp: { add: 0, sub: 0, mul: 0, div: 0 },
  bestStreak: 0,
  lightningSolves: 0,
  daysPractised: 0,
  lastPracticeDay: null,
};

/**
 * Four destinations, not eight. The old flat row ranked "Badges" the same as
 * "Studio" and ran off the side of a tablet; these group the eight things a
 * student can actually do into the four reasons they came.
 */
type Section = 'practise' | 'homework' | 'progress' | 'class';

/** Reached from the bell in the header, so it is deliberately not a destination. */
type View = Section | 'notifications';

/**
 * Typographic marks from the app's own vocabulary, not emoji. Emoji stay on
 * badges and notifications, where the data model actually stores them.
 */
const SECTIONS = [
  { key: 'practise', label: 'Practise', glyph: '\u00d7', group: 'Learn' },
  { key: 'homework', label: 'Homework', glyph: '\u2261', group: 'Learn' },
  { key: 'progress', label: 'Progress', glyph: '\u25b2', group: 'Learn' },
  { key: 'class', label: 'Class', glyph: '\u25ce', group: 'Learn' },
] as const;

/* The title names the destination. The segmented control beside it names the
   mode within that destination, so repeating "Studio" in both would say the
   same thing twice. */
const VIEW_TITLE: Record<View, string> = {
  practise: 'Practise',
  homework: 'Homework',
  progress: 'Progress',
  class: 'Class',
  notifications: 'Notifications',
};

/**
 * Homework only exists inside a class \u2014 assignments are set per classroom, so a
 * student practising on their own has no source of any. Showing them an empty
 * Homework tab forever tells them something is missing when nothing is.
 */
const CLASS_ONLY_SECTIONS: readonly Section[] = ['homework'];

type PractiseTab = 'studio' | 'focus' | 'challenge';
type ProgressTab = 'badges' | 'league';

const PRACTISE_TABS: readonly { key: PractiseTab; label: string }[] = [
  { key: 'studio', label: 'Studio' },
  { key: 'focus', label: 'Focus' },
  { key: 'challenge', label: 'Challenge' },
];

const PROGRESS_TABS: readonly { key: ProgressTab; label: string }[] = [
  { key: 'badges', label: 'Badges' },
  { key: 'league', label: 'League' },
];

const SAVE_DEBOUNCE_MS = 600;

type LoadState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; message: string };

interface StudentAppProps {
  userId: string;
  /** Null when the student has not taken the placement assessment. */
  placement: { level: Level; score: number } | null;
}

export function StudentApp({ userId, placement }: StudentAppProps) {
  const { profile } = useAuth();
  const inbox = useNotifications(userId);

  const [selected, setSelected] = useState<View>('practise');
  const [practiseTab, setPractiseTab] = useState<PractiseTab>('studio');
  const [progressTab, setProgressTab] = useState<ProgressTab>('badges');
  const [progress, setProgress] = useState<ProgressRow>(DEFAULT_PROGRESS);
  const [classes, setClasses] = useState<Classroom[]>([]);
  const [badgeStats, setBadgeStats] = useState<BadgeStats>(EMPTY_BADGE_STATS);
  const [earnedBadges, setEarnedBadges] = useState<EarnedBadge[]>([]);
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [saveFailed, setSaveFailed] = useState(false);
  /** Currently celebrating on screen. */
  const [unlocks, setUnlocks] = useState<Unlock[]>([]);
  /** Won since the app opened — the Achievements grid marks these out. */
  const [sessionBadges, setSessionBadges] = useState<string[]>([]);

  /**
   * Homework is read here rather than inside HomeworkPanel because the rail
   * needs the outstanding count for its badge. One read feeds both — fetching
   * the same list twice on a classroom network is worse than passing it down.
   */
  const loadHomework = useCallback(() => getStudentAssignments(userId), [userId]);
  const homework = useFetched<StudentAssignment[]>(loadHomework, userId);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<ProgressRow | null>(null);
  /**
   * The newest row, written synchronously by whoever changes it.
   *
   * This exists because the progress that gets *saved* must not be computed
   * inside a `setState` updater. Doing that made queueing the save a side effect
   * of rendering, and React is free to run an updater speculatively or to reuse a
   * memoised one — which it now does, so the run scored correctly on screen while
   * every save posted the values the panel opened with.
   */
  const latest = useRef<ProgressRow>(DEFAULT_PROGRESS);
  /** Badge ids already sent for writing, so a re-render can't award them twice. */
  const claimed = useRef<Set<string>>(new Set());
  /**
   * Badge ids already celebrated. Tracked apart from `claimed` because that set
   * is filled *before* the write goes out, so by the time the badge is confirmed
   * it can no longer tell us what was new.
   */
  const celebrated = useRef<Set<string>>(new Set());
  const unlockKey = useRef(0);

  const fetchAll = useCallback(async () => {
    setLoad({ status: 'loading' });
    const [progressRes, classRes, badgeRes] = await Promise.all([
      getProgress(userId),
      getStudentClassrooms(userId),
      getEarnedBadges(userId),
    ]);
    if (!progressRes.ok) {
      setLoad({ status: 'error', message: progressRes.error });
      return;
    }
    const loaded = progressRes.data ?? DEFAULT_PROGRESS;
    latest.current = loaded;
    setProgress(loaded);
    // A failed classroom read is not fatal: it only affects whether the
    // placement is shown, and hidden is the safe default.
    if (classRes.ok) setClasses(classRes.data);
    if (badgeRes.ok) {
      setEarnedBadges(badgeRes.data);
      claimed.current = new Set(badgeRes.data.map((b) => b.badgeId));
    }

    // Badges are a read-only garnish: if their aggregates fail to load, the
    // student still practises, they just don't unlock anything this session.
    const statsRes = await getBadgeStats(userId, progressRes.data);
    if (statsRes.ok) setBadgeStats(statsRes.data);

    setLoad({ status: 'ready' });
  }, [userId]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const flush = useCallback(async () => {
    const snapshot = pending.current;
    if (!snapshot) return;
    pending.current = null;
    const { error } = await saveProgress(userId, snapshot);
    if (error) pending.current = snapshot;
    setSaveFailed(Boolean(error));
  }, [userId]);

  const queueSave = useCallback(
    (next: ProgressRow) => {
      pending.current = next;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
    },
    [flush]
  );

  const handleProgress = useCallback(
    (snap: ProgressSnapshot) => {
      const day = today();
      // Merged from the ref rather than inside the updater, so the row that is
      // rendered and the row that is queued are computed once, here, together.
      const current = latest.current;
      const next: ProgressRow = { ...current, ...snap, ...rollPracticeDay(current, day) };
      latest.current = next;
      setProgress(next);
      queueSave(next);
    },
    [queueSave]
  );

  /** The challenge hands back a whole row, XP already applied. */
  const handleChallengeProgress = useCallback(
    (next: ProgressRow) => {
      const day = today();
      const rolled = { ...next, ...rollPracticeDay(next, day) };
      latest.current = rolled;
      setProgress(rolled);
      queueSave(rolled);
    },
    [queueSave]
  );

  const handleBadgesEarned = useCallback((badgeIds: string[], opts?: { silent?: boolean }) => {
    const at = new Date().toISOString();
    setEarnedBadges((current) => {
      const have = new Set(current.map((b) => b.badgeId));
      const added = badgeIds.filter((id) => !have.has(id)).map((badgeId) => ({ badgeId, earnedAt: at }));
      return added.length > 0 ? [...added, ...current] : current;
    });
    for (const id of badgeIds) claimed.current.add(id);

    const fresh = badgeIds.filter((id) => !celebrated.current.has(id));
    if (fresh.length === 0) return;
    for (const id of fresh) celebrated.current.add(id);
    setSessionBadges((current) => [...current, ...fresh]);
    if (opts?.silent) return;
    // Keys are handed out here rather than inside the updater: React may run an
    // updater speculatively, and a counter advanced in one would leave gaps or
    // collide. Same reason the progress row is merged outside its own.
    const cards = badgesByIds(fresh).map((badge) => ({ key: (unlockKey.current += 1), badge }));
    setUnlocks((current) => [...current, ...cards]);
  }, []);

  const dismissUnlock = useCallback((key: number) => {
    setUnlocks((current) => current.filter((u) => u.key !== key));
  }, []);

  // Practice can unlock badges too, not just the challenge. Evaluated against
  // the row the app already holds, so no round trip per answer.
  useEffect(() => {
    if (load.status !== 'ready') return;
    const stats = mergeProgressIntoStats(badgeStats, progress);
    const fresh = newlyEarned(stats, claimed.current).map((b) => b.id);
    if (fresh.length === 0) return;
    // Claim before the write so a re-render mid-flight can't queue them again.
    for (const id of fresh) claimed.current.add(id);
    void (async () => {
      const { error } = await awardBadges(userId, fresh);
      if (error) {
        // Let a later change retry rather than silently swallowing the badge.
        for (const id of fresh) claimed.current.delete(id);
        return;
      }
      handleBadgesEarned(fresh);
    })();
  }, [load.status, progress, badgeStats, userId, handleBadgesEarned]);

  // A student closing the tab mid-debounce would otherwise lose the XP they
  // just earned.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      void flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      void flush();
    };
  }, [flush]);

  const hasClass = classes.length > 0;

  /**
   * Withholding the placement is a teacher's call, so with no teacher there is
   * nobody to withhold it: a student learning on their own sees their own score.
   * Inside a class it stays hidden until a teacher turns it on.
   */
  const showPlacement = !hasClass || classes.some((c) => c.reveal_benchmark);

  const sections = hasClass
    ? SECTIONS
    : SECTIONS.filter((s) => !CLASS_ONLY_SECTIONS.includes(s.key));

  /**
   * Derived rather than corrected in an effect: leaving a class removes a
   * destination, and the view has to fall back the same render it disappears in,
   * not one render later with nothing highlighted in between.
   */
  const view: View =
    selected === 'notifications' || sections.some((s) => s.key === selected)
      ? selected
      : 'practise';

  const bell = (
    <NotificationBell
      unread={inbox.unread}
      active={view === 'notifications'}
      onOpen={() => setSelected('notifications')}
    />
  );

  /** Set but not handed in. Undefined while the list is still loading. */
  const outstanding =
    homework.state.status === 'ready'
      ? homework.state.data.filter((a) => !a.submission).length
      : 0;

  const items: NavItem[] = sections.map((section) => ({
    ...section,
    badge:
      section.key === 'homework' && outstanding > 0 ? String(outstanding) : undefined,
  }));

  const nav = {
    label: 'Sections',
    items,
    // The bell opens a view that is not one of the four, so nothing is
    // highlighted while it is open — which is the honest answer.
    active: view,
    onSelect: (key: string) => setSelected(key as Section),
  };

  const subnav =
    view === 'practise' ? (
      <Segmented
        label="Practice mode"
        tabs={PRACTISE_TABS}
        active={practiseTab}
        onSelect={setPractiseTab}
      />
    ) : view === 'progress' ? (
      // Badges and the league share one screen once there is room for both, so
      // this switch only earns its place while there isn't.
      <span className="numo-narrow-only">
        <Segmented
          label="Progress view"
          tabs={PROGRESS_TABS}
          active={progressTab}
          onSelect={setProgressTab}
        />
      </span>
    ) : undefined;

  const railFooter = (
    <PlacementCard
      placement={placement}
      showPlacement={showPlacement}
      hasClass={hasClass}
    />
  );

  const shell = {
    nav,
    title: VIEW_TITLE[view],
    subnav,
    headerExtra: bell,
    railFooter,
    status: { streak: progress.streak, xp: progress.xp },
  };

  /* Remounts on every change of what is on screen, sub-tabs included, so a
     crashed panel is cleared by navigating rather than by reloading. */
  const viewKey = `${view}-${practiseTab}-${progressTab}`;

  if (load.status === 'loading') {
    return (
      <AppShell {...shell}>
        <StatusScreen title="Loading your progress…" />
      </AppShell>
    );
  }

  if (load.status === 'error') {
    return (
      <AppShell {...shell}>
        <StatusScreen
          tone="error"
          title="Couldn't load your progress"
          detail={load.message}
          onRetry={() => void fetchAll()}
        />
      </AppShell>
    );
  }

  return (
    <AppShell {...shell}>
      {/* Outside the keyed boundary below, so a badge won earned on the last
          question of a run still finishes celebrating after the student has
          moved on to another tab. */}
      <BadgeUnlockStack unlocks={unlocks} onDone={dismissUnlock} />

      {saveFailed && (
        <div role="alert" className="numo-save-banner">
          <span>Your latest progress hasn’t been saved yet.</span>
          <button type="button" onClick={() => void flush()}>Retry now</button>
        </div>
      )}

      {/* Practice is the part with real state; a crash here must not take the
          whole shell down or lose the student's place. Keying by view also
          clears a crashed panel when they navigate away from it. */}
      <ErrorBoundary key={viewKey}>
        {view === 'practise' && (
          <>
            {practiseTab === 'studio' && (
              <StudioPage
                studentId={userId}
                progress={progress}
                classes={classes}
                stats={mergeProgressIntoStats(badgeStats, progress)}
                earnedIds={earnedBadges.map((b) => b.badgeId)}
                onProgress={handleProgress}
              />
            )}

            {practiseTab === 'focus' && (
              <div className="numo-focus-stage">
                <PracticePanel
                  variant="focus"
                  initialArea="add"
                  initialSeed={progress}
                  onProgress={handleProgress}
                />
              </div>
            )}

            {practiseTab === 'challenge' && (
              <div className="numo-section">
                <ChallengePanel
                  studentId={userId}
                  progress={progress}
                  badgeStats={mergeProgressIntoStats(badgeStats, progress)}
                  earnedBadgeIds={earnedBadges.map((b) => b.badgeId)}
                  onProgress={handleChallengeProgress}
                  onBadgesEarned={handleBadgesEarned}
                />
              </div>
            )}
          </>
        )}

        {view === 'homework' && (
          <div className="numo-section">
            <HomeworkPanel
              studentId={userId}
              seed={progress}
              onProgress={handleProgress}
              state={homework.state}
              onReload={homework.reload}
            />
          </div>
        )}

        {/* Two panels, one grid. Wide enough and the league sits beside the
            badges instead of behind a tab; the segmented control above only
            appears once the screen is too narrow to hold both. */}
        {view === 'progress' && (
          <div className={`numo-section ${c.progress}`} data-tab={progressTab}>
            <div className={c.progressMain}>
              <AchievementsPanel
                stats={mergeProgressIntoStats(badgeStats, progress)}
                earned={earnedBadges}
                highlightIds={sessionBadges}
              />
            </div>
            <div className={c.progressSide}>
              <LeaguePanel studentId={userId} classes={classes} />
            </div>
          </div>
        )}

        {view === 'class' && (
          <div className="numo-section">
            <ClassPanel
              studentId={userId}
              studentName={profile?.full_name ?? 'You'}
              xp={progress.xp}
              classes={classes}
              onSocialChange={() => void inbox.reload(true)}
              onClassesChanged={() => void fetchAll()}
            />
          </div>
        )}

        {view === 'notifications' && (
          <div className="numo-section">
            <NotificationsPanel inbox={inbox} />
          </div>
        )}
      </ErrorBoundary>
    </AppShell>
  );
}

export default StudentApp;
