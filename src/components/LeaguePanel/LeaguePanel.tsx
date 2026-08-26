import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LEAGUE_TIERS,
  PROMOTE_COUNT,
  TIER_META,
  ZONE_LABEL,
  formatCountdown,
  msUntilWeekEnd,
  ordinal,
  rankCohort,
  weekStart,
  xpToPromotion,
  type LeagueTier,
  type Standing,
} from '../../engine/leagues';
import {
  getClassLeaderboard,
  getLeagueCohort,
  getLeagueContext,
  getMyRegion,
  getRegionLeaderboard,
  setMyRegion,
  type LeaderboardRow,
  type LeagueContext,
} from '../../lib/leagueApi';
import { REGION_ERROR, detectRegion } from '../../lib/geolocation';
import { TR_PROVINCES } from '../../data/regions';
import { useFetched, type Load } from '../../lib/useFetched';
import type { Fetched } from '../../lib/result';
import { PanelError, PanelLoading } from '../panels/PanelState';
import type { Classroom } from '../../types';
import p from '../panels/panels.module.css';
import s from './LeaguePanel.module.css';

type Board = 'league' | 'class' | 'region';

const MEDALS = ['🥇', '🥈', '🥉'];

interface LeaguePanelProps {
  studentId: string;
  classes: Classroom[];
}

interface LeagueData {
  context: LeagueContext;
  tier: LeagueTier;
  activeTiers: number;
  cohort: LeaderboardRow[];
}

/** An already-resolved empty result, for a board that has nothing to ask for. */
const emptyRows: Fetched<LeaderboardRow[]> = { ok: true, data: [] };

export function LeaguePanel({ studentId, classes }: LeaguePanelProps) {
  const [board, setBoard] = useState<Board>('league');
  const [regionBusy, setRegionBusy] = useState(false);
  const [regionError, setRegionError] = useState<string | null>(null);
  const [picked, setPicked] = useState('');
  const [now, setNow] = useState(() => Date.now());

  const week = useMemo(() => weekStart(), []);

  // The class leaderboard is the teacher's to allow; with several classes, any
  // one that permits it is enough to show a table.
  const boardClass = classes.find((c) => c.leaderboard_enabled) ?? null;
  // Vacuously true with no classes, which is the right answer: nobody's teacher
  // has restricted a student who has no teacher.
  const globalAllowed = classes.every((c) => c.global_leaderboard_enabled);

  /** No class means no class table to offer, so the tab isn't there to click. */
  const boards: [Board, string][] = [
    ['league', 'My league'],
    ...(classes.length > 0 ? ([['class', 'My class']] as [Board, string][]) : []),
    ['region', 'My region'],
  ];
  const activeBoard: Board = boards.some(([key]) => key === board) ? board : 'league';

  // The standing and the cohort are one read as far as the panel is concerned:
  // a cohort without the context it was derived from would be meaningless.
  const loadLeague = useCallback(async (): Promise<Fetched<LeagueData>> => {
    const contextRes = await getLeagueContext(week);
    if (!contextRes.ok) return contextRes;
    const cohortRes = await getLeagueCohort(contextRes.data, week);
    if (!cohortRes.ok) return cohortRes;
    return {
      ok: true,
      data: {
        context: contextRes.data,
        tier: cohortRes.data.tier,
        activeTiers: cohortRes.data.activeTiers,
        cohort: cohortRes.data.rows,
      },
    };
  }, [week]);

  const loadClass = useCallback(
    () => (boardClass ? getClassLeaderboard(boardClass.id, week) : Promise.resolve(emptyRows)),
    [boardClass, week]
  );

  const myRegion = useFetched(() => getMyRegion(studentId), studentId);
  const region = myRegion.state.status === 'ready' ? myRegion.state.data : null;

  const loadRegionRows = useCallback(
    () => (region ? getRegionLeaderboard(week) : Promise.resolve(emptyRows)),
    [region, week]
  );

  const league = useFetched(loadLeague, week);
  const classBoard = useFetched(loadClass, boardClass?.id ?? 'none');
  const regionBoard = useFetched(loadRegionRows, region ?? 'none');

  // The countdown only needs to be right to the minute.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  /** The one write path, shared by the picker and the geolocation shortcut. */
  const handleSaveRegion = useCallback(
    async (name: string) => {
      if (!name) return;
      setRegionBusy(true);
      setRegionError(null);
      const { error } = await setMyRegion(studentId, name);
      if (error) setRegionError(error);
      else myRegion.patch(() => name);
      setRegionBusy(false);
    },
    [studentId, myRegion]
  );

  /**
   * The convenience path. It can fail for reasons the student can do nothing
   * about — a device with location services off refuses without ever prompting —
   * so a failure points them at the picker rather than leaving them stuck.
   */
  const handleShareLocation = useCallback(async () => {
    setRegionBusy(true);
    setRegionError(null);
    const outcome = await detectRegion();
    if (!outcome.ok) {
      setRegionError(`${REGION_ERROR[outcome.reason]} You can pick your province from the list instead.`);
      setRegionBusy(false);
      return;
    }
    setRegionBusy(false);
    await handleSaveRegion(outcome.region);
  }, [handleSaveRegion]);

  const handleForgetLocation = useCallback(async () => {
    setRegionBusy(true);
    setRegionError(null);
    const { error } = await setMyRegion(studentId, null);
    if (error) setRegionError(error);
    else myRegion.patch(() => null);
    setRegionBusy(false);
  }, [studentId, myRegion]);

  const countdown = formatCountdown(msUntilWeekEnd(new Date(now)));

  return (
    <div className={p.panel}>
      <div className={p.panelHead}>
        <div>
          <h2 className={p.panelTitle}>Leagues</h2>
          <p className={p.panelSub}>
            Every Monday the tables reset. Where you finish this week decides whether you go up.
          </p>
        </div>
      </div>

      <div className={s.tabs} role="tablist" aria-label="Leaderboard">
        {boards.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={activeBoard === key}
            className={`${s.tab} ${activeBoard === key ? s.tabOn : ''}`}
            onClick={() => setBoard(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {activeBoard === 'league' && (
        <LeagueBoard
          state={league.state}
          studentId={studentId}
          countdown={countdown}
          globalAllowed={globalAllowed}
          onRetry={() => void league.reload()}
        />
      )}

      {activeBoard === 'class' && (
        <ClassBoard
          state={classBoard.state}
          studentId={studentId}
          hasClass={Boolean(boardClass)}
          onRetry={() => void classBoard.reload()}
        />
      )}

      {activeBoard === 'region' && (
        <RegionBoard
          state={regionBoard.state}
          studentId={studentId}
          region={region}
          globalAllowed={globalAllowed}
          busy={regionBusy}
          error={regionError}
          picked={picked}
          onPick={setPicked}
          onSave={() => void handleSaveRegion(picked)}
          onShare={() => void handleShareLocation()}
          onForget={() => void handleForgetLocation()}
          onRetry={() => void regionBoard.reload()}
        />
      )}
    </div>
  );
}

// ── League ───────────────────────────────────────────────────────────────────

function LeagueBoard({
  state,
  studentId,
  countdown,
  globalAllowed,
  onRetry,
}: {
  state: Load<LeagueData>;
  studentId: string;
  countdown: string;
  globalAllowed: boolean;
  onRetry: () => void;
}) {
  if (!globalAllowed) {
    return (
      <div className={s.blocked}>
        Your teacher has turned off leagues for your class, so you don’t appear in any table outside
        it. Your XP and levels are unaffected.
      </div>
    );
  }
  if (state.status === 'loading') return <PanelLoading label="Loading your league…" />;
  if (state.status === 'error') {
    return <PanelError title="Couldn't load your league" message={state.message} onRetry={onRetry} />;
  }

  const { context, tier, activeTiers, cohort } = state.data;
  const meta = TIER_META[tier];
  const standings = rankCohort(cohort, studentId, tier, activeTiers);
  const gap = xpToPromotion(standings, studentId);
  const tierIndex = LEAGUE_TIERS.indexOf(tier);

  return (
    <>
      <div className={s.banner}>
        <span className={s.tierIcon} aria-hidden="true">
          {meta.icon}
        </span>
        <span className={s.tierText}>
          <span className={s.tierName} style={{ color: meta.color }}>
            {meta.label} League
          </span>
          <span className={s.tierSub}>
            {activeTiers === 1
              ? `Numo has ${context.totalUsers} ${context.totalUsers === 1 ? 'player' : 'players'} so far — higher leagues open as more people join.`
              : `Tier ${tierIndex + 1} of ${activeTiers} · ranked ${ordinal(context.myRank)} of ${context.totalUsers} overall`}
          </span>
          <span className={s.tierDots} aria-hidden="true">
            {LEAGUE_TIERS.map((t, i) => (
              <span
                key={t}
                className={`${s.dot} ${i === tierIndex ? s.dotOn : ''} ${
                  i >= activeTiers ? s.dotLocked : ''
                }`}
              />
            ))}
          </span>
        </span>
        <span className={s.countdown}>{countdown}</span>
      </div>

      <Standings
        standings={standings}
        empty="No one has earned XP in your league this week yet. Be the first."
        gap={gap}
      />
    </>
  );
}

// ── Class ────────────────────────────────────────────────────────────────────

function ClassBoard({
  state,
  studentId,
  hasClass,
  onRetry,
}: {
  state: Load<LeaderboardRow[]>;
  studentId: string;
  hasClass: boolean;
  onRetry: () => void;
}) {
  // The tab is only offered to students who are in a class, so reaching this
  // means the teacher has switched the table off.
  if (!hasClass) {
    return (
      <div className={s.blocked}>
        Your teacher has turned the class table off. Your XP and levels are unaffected.
      </div>
    );
  }
  if (state.status === 'loading') return <PanelLoading label="Loading your class…" />;
  if (state.status === 'error') {
    return <PanelError title="Couldn't load the class table" message={state.message} onRetry={onRetry} />;
  }
  return (
    <Standings
      standings={rankCohort(state.data, studentId, 'bronze', 1)}
      empty="Nobody in your class has earned XP this week yet."
      gap={null}
    />
  );
}

// ── Region ───────────────────────────────────────────────────────────────────

function RegionBoard({
  state,
  studentId,
  region,
  globalAllowed,
  busy,
  error,
  picked,
  onPick,
  onSave,
  onShare,
  onForget,
  onRetry,
}: {
  state: Load<LeaderboardRow[]>;
  studentId: string;
  region: string | null;
  globalAllowed: boolean;
  busy: boolean;
  error: string | null;
  picked: string;
  onPick: (region: string) => void;
  onSave: () => void;
  onShare: () => void;
  onForget: () => void;
  onRetry: () => void;
}) {
  if (!globalAllowed) {
    return (
      <div className={s.blocked}>
        Your teacher has turned off leaderboards outside your class, so region tables are unavailable
        and no location can be shared.
      </div>
    );
  }

  if (!region) {
    return (
      <div className={s.consent}>
        <span className={s.consentTitle}>See how your area is doing</span>
        <p className={s.consentBody}>
          Numo can put you on a leaderboard with other students near you. To do that it needs to know
          your <strong>region</strong> — nothing more precise than that.
        </p>
        <div className={s.promises}>
          <span className={s.promise}>
            <span className={s.tick} aria-hidden="true">
              ✓
            </span>
            Only a name like “Ankara” is stored — never a street, an address, or a position.
          </span>
          <span className={s.promise}>
            <span className={s.tick} aria-hidden="true">
              ✓
            </span>
            If you use your device’s location, it works the name out on the device. Your coordinates
            are never sent anywhere and are never saved.
          </span>
          <span className={s.promise}>
            <span className={s.tick} aria-hidden="true">
              ✓
            </span>
            You can remove it at any time.
          </span>
          <span className={s.promise}>
            <span className={s.tick} aria-hidden="true">
              ✓
            </span>
            Other students only ever see your first name and last initial.
          </span>
        </div>

        {/* Picking from the list is the reliable path and involves no location
            permission at all — plenty of devices refuse geolocation outright, with
            no prompt, and before this the button was the only way in. */}
        <div className={s.pickRow}>
          <label className={s.pickLabel} htmlFor="region-pick">
            Choose your province
          </label>
          <div className={s.pickControls}>
            <select
              id="region-pick"
              className={p.select}
              value={picked}
              onChange={(e) => onPick(e.target.value)}
              disabled={busy}
            >
              <option value="">Select a province…</option>
              {TR_PROVINCES.map((province) => (
                <option key={province.name} value={province.name}>
                  {province.name}
                </option>
              ))}
            </select>
            <button type="button" className={p.btn} onClick={onSave} disabled={busy || !picked}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        <div className={s.consentActions}>
          <button type="button" className={`${p.btn} ${p.btnGhost}`} onClick={onShare} disabled={busy}>
            {busy ? 'Checking…' : 'Or use my device’s location'}
          </button>
          <span className={s.consentBody}>You can skip this — everything else works without it.</span>
        </div>
        {error && (
          <p className={s.consentError} role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      <div className={s.consent}>
        <div className={s.regionNow}>
          <span>You’re competing in</span>
          <span className={s.regionName}>{region}</span>
          <button
            type="button"
            className={`${p.btn} ${p.btnQuiet}`}
            onClick={onForget}
            disabled={busy}
          >
            {busy ? 'Removing…' : 'Remove my region'}
          </button>
        </div>
        {error && (
          <p className={s.consentError} role="alert">
            {error}
          </p>
        )}
      </div>
      {state.status === 'loading' && <PanelLoading label={`Loading ${region}…`} />}
      {state.status === 'error' && (
        <PanelError title="Couldn't load the region table" message={state.message} onRetry={onRetry} />
      )}
      {state.status === 'ready' && (
        <Standings
          standings={rankCohort(state.data, studentId, 'bronze', 1)}
          empty={`You're the first person from ${region} on Numo. Earn some XP and hold the top spot.`}
          gap={null}
        />
      )}
    </>
  );
}

// ── Shared table ─────────────────────────────────────────────────────────────

function Standings({
  standings,
  empty,
  gap,
}: {
  standings: Standing[];
  empty: string;
  gap: number | null;
}) {
  if (standings.length === 0) return <div className={p.empty}>{empty}</div>;

  const firstDemotion = standings.find((row) => row.zone === 'demotion');
  const hasPromotion = standings.some((row) => row.zone === 'promotion');

  return (
    <div className={s.table}>
      {hasPromotion && (
        <div className={`${s.zoneBar} ${s.zonePromotion}`}>
          {ZONE_LABEL.promotion} · top {PROMOTE_COUNT} move up
        </div>
      )}
      {standings.map((row) => (
        <div key={row.studentId}>
          {firstDemotion?.studentId === row.studentId && (
            <div className={`${s.zoneBar} ${s.zoneDemotion}`}>{ZONE_LABEL.demotion}</div>
          )}
          <div className={`${s.row} ${row.isMe ? s.rowMe : ''}`}>
            <span className={s.position}>{row.position}</span>
            <span className={s.medal} aria-hidden="true">
              {/* A podium place has to be earned. Before anyone has scored,
                  everyone is tied on zero, and handing the whole table a gold
                  medal would be celebrating nothing. */}
              {row.position <= 3 && row.weeklyXp > 0 ? MEDALS[row.position - 1] : ''}
            </span>
            <span className={s.name}>{row.name}</span>
            {row.isMe && <span className={s.youTag}>You</span>}
            <span className={s.xp}>
              {row.weeklyXp.toLocaleString()}
              <span className={s.xpUnit}>XP</span>
            </span>
          </div>
        </div>
      ))}
      {gap !== null && (
        <div className={s.gapNote}>
          {gap.toLocaleString()} XP would put you in the promotion zone.
        </div>
      )}
    </div>
  );
}

export default LeaguePanel;
