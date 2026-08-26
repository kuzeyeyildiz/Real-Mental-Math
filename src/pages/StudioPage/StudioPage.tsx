import { useCallback, useMemo, useState, type CSSProperties } from 'react';
import type { Area, Classroom } from '../../types';
import { PracticePanel, type ProgressSnapshot } from '../../components/PracticePanel/PracticePanel';
import { skillProgress, AREAS } from '../../engine/skillLadder';
import { nextUp, type BadgeStats } from '../../engine/badges';
import {
  LEAGUE_TIERS,
  TIER_META,
  formatCountdown,
  msUntilWeekEnd,
  rankCohort,
  weekStart,
  xpToPromotion,
} from '../../engine/leagues';
import { getLeagueCohort, getLeagueContext } from '../../lib/leagueApi';
import { useFetched } from '../../lib/useFetched';
import { getDailyXp, type DailyXp, type ProgressRow } from '../../lib/api';
import type { Fetched } from '../../lib/result';
import s from './StudioPage.module.css';

const SKILL_COLORS: Record<Area, string> = {
  add: 'var(--color-skill-add)',
  sub: 'var(--color-skill-sub)',
  mul: 'var(--color-skill-mul)',
  div: 'var(--color-skill-div)',
};

const SKILL_LABELS: Record<Area, string> = {
  add: 'Addition',
  sub: 'Subtraction',
  mul: 'Multiplication',
  div: 'Division',
};

const SKILL_SYMBOLS: Record<Area, string> = {
  add: '+',
  sub: '−',
  mul: '×',
  div: '÷',
};

/** A day's worth of practice, in XP. Not stored anywhere — it is a target. */
const DAILY_GOAL = 150;

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

interface StudioPageProps {
  studentId: string;
  /** Live progress, kept in sync via onProgress from the practice panel. */
  progress: ProgressRow;
  classes: Classroom[];
  stats: BadgeStats;
  earnedIds: string[];
  onProgress: (snapshot: ProgressSnapshot) => void;
}

/**
 * The seven days ending today, each with the XP actually earned on it.
 *
 * `numo_daily_xp` records this now, so the strip is a real chart rather than a
 * two-state "practised / didn't". The last entry is today, and its XP is topped
 * up live from the session so the bar grows while the student is looking at it.
 */
function weekStrip(
  history: DailyXp | null,
  earnedThisSession: number
): { key: string; letter: string; xp: number; isToday: boolean }[] {
  if (!history) return [];
  const last = history.days.length - 1;

  return history.days.map((key, i) => {
    const date = new Date(`${key}T00:00:00`);
    // The stored figure covers saves that have landed; anything still in the
    // debounce is in the session delta, so today is the sum of both.
    const stored = history.xp[i] ?? 0;
    return {
      key,
      letter: DAY_LETTERS[date.getDay()],
      xp: i === last ? Math.max(stored, earnedThisSession) : stored,
      isToday: i === last,
    };
  });
}

export function StudioPage({
  studentId,
  progress,
  classes,
  stats,
  earnedIds,
  onProgress,
}: StudioPageProps) {
  // `useState` rather than a ref: the initialiser runs once, on the first
  // render, which is exactly "the XP this panel opened with" — and unlike a ref
  // it can be read during render.
  const [openedWith] = useState(progress.xp);
  const earnedThisSession = Math.max(0, progress.xp - openedWith);

  const loadHistory = useCallback(() => getDailyXp(studentId), [studentId]);
  const history = useFetched<DailyXp>(loadHistory, studentId);
  const days = history.state.status === 'ready' ? history.state.data : null;

  /**
   * Everything earned today: what has already been saved, plus whatever this
   * session has added since. The two overlap while a save is in flight, so the
   * larger of the pair is the honest figure rather than their sum.
   */
  const stored = days ? days.xp[days.xp.length - 1] ?? 0 : 0;
  const earnedToday = Math.max(stored, earnedThisSession);
  const goalPct = Math.min(100, (earnedToday / DAILY_GOAL) * 100);
  const remaining = Math.max(0, DAILY_GOAL - earnedToday);

  const week = useMemo(() => weekStart(), []);
  const strip = useMemo(() => weekStrip(days, earnedThisSession), [days, earnedThisSession]);
  /** Bars are drawn against the best day in view, floored at the daily goal so
      one big day doesn't flatten the rest of the week to nothing. */
  const stripPeak = Math.max(DAILY_GOAL, ...strip.map((d) => d.xp));

  /**
   * Vacuously true with no classes, which is the right answer: nobody's teacher
   * has restricted a student who has no teacher. Same rule as LeaguePanel.
   */
  const globalAllowed = classes.every((c) => c.global_leaderboard_enabled);

  const loadLeague = useCallback(async (): Promise<Fetched<{
    tier: (typeof LEAGUE_TIERS)[number];
    activeTiers: number;
    rows: { studentId: string; name: string; weeklyXp: number }[];
  }>> => {
    const context = await getLeagueContext(week);
    if (!context.ok) return context;
    const cohort = await getLeagueCohort(context.data, week);
    if (!cohort.ok) return cohort;
    return {
      ok: true,
      data: { tier: cohort.data.tier, activeTiers: cohort.data.activeTiers, rows: cohort.data.rows },
    };
  }, [week]);

  // Skipped entirely when leagues are off for this student, so no request is
  // made for a table they are not allowed to appear in.
  const league = useFetched(loadLeague, globalAllowed ? week : 'off');

  const upcoming = useMemo(() => nextUp(stats, earnedIds), [stats, earnedIds]);

  return (
    <div className="numo-section">
      <div className={s.layout}>
        <div className={s.main}>
          <PracticePanel
            variant="studio"
            initialArea="add"
            initialSeed={{
              xp: progress.xp,
              streak: progress.streak,
              solved: progress.solved,
              counts: progress.counts,
              skillXp: progress.skillXp,
            }}
            onProgress={onProgress}
          />

          <section>
            <div className={s.sectionHead}>
              <h2 className={s.sectionTitle}>Your skill ladders</h2>
              <span className={s.sectionNote}>Every level costs 16% more than the last</span>
            </div>

            <div className={s.skillGrid}>
              {AREAS.map((area) => {
                const ladder = skillProgress(progress.skillXp[area]);
                return (
                  <article key={area} className={s.skillCard}>
                    <div className={s.skillHead}>
                      <span
                        className={s.skillTile}
                        style={{ background: SKILL_COLORS[area] }}
                        aria-hidden="true"
                      >
                        {SKILL_SYMBOLS[area]}
                      </span>
                      <div className={s.skillNames}>
                        <div className={s.skillName}>{SKILL_LABELS[area]}</div>
                        <div className={s.skillSolved}>{progress.counts[area] || 0} solved</div>
                      </div>
                    </div>
                    <div className={s.skillLevel} style={{ color: SKILL_COLORS[area] }}>
                      Lv {ladder.level}
                    </div>
                    <div className={s.skillTrack}>
                      <div
                        className={s.skillFill}
                        style={{ width: `${ladder.pct}%`, background: SKILL_COLORS[area] }}
                        role="progressbar"
                        aria-valuenow={Math.round(ladder.pct)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${SKILL_LABELS[area]} level ${ladder.level} progress`}
                      />
                    </div>
                    <div className={s.skillHint}>
                      {ladder.toNext} XP to Lv {ladder.level + 1}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>

        <aside className={s.side} aria-label="Your progress">
          <section className={s.card}>
            <div className={s.cardHead}>
              <h2 className={s.cardTitle}>Today</h2>
              <span className={s.cardMeta}>Goal {DAILY_GOAL} XP</span>
            </div>
            <div className={s.goalRow}>
              <div
                className={s.ring}
                style={{ '--ring': `${goalPct}%` } as CSSProperties}
                role="progressbar"
                aria-valuenow={earnedToday}
                aria-valuemin={0}
                aria-valuemax={DAILY_GOAL}
                aria-label="XP earned today"
              >
                <div className={s.ringFace}>
                  <span className={s.ringValue}>{earnedToday}</span>
                  <span className={s.ringUnit}>XP</span>
                </div>
              </div>
              <p className={s.goalText}>
                {remaining === 0
                  ? 'Goal reached. Everything from here is on top of it.'
                  : `${remaining} XP left — about ${Math.max(1, Math.round(remaining / 14))} more questions at your pace.`}
              </p>
            </div>

            {strip.length > 0 && (
              <div className={s.strip}>
                {strip.map((day) => (
                  <div key={day.key} className={s.stripDay}>
                    <span className={s.stripTrack}>
                      <span
                        className={`${s.stripBar} ${day.isToday ? s.stripToday : ''}`}
                        style={{
                          // A day with nothing earned still gets a sliver, so the
                          // strip reads as seven days rather than four.
                          height: day.xp > 0
                            ? `${Math.max(12, (day.xp / stripPeak) * 100)}%`
                            : '4px',
                        }}
                        title={`${day.key}: ${day.xp} XP`}
                      />
                    </span>
                    <span className={s.stripLabel}>{day.letter}</span>
                  </div>
                ))}
              </div>
            )}
            <div className={s.stripNote}>
              {progress.streak > 0
                ? `${progress.streak}-day streak · ${progress.daysPractised} days practised in total`
                : `${progress.daysPractised} days practised in total`}
            </div>
          </section>

          {/* Nothing at all when leagues are off for this class — the same rule
              the League panel applies, so the two never disagree. */}
          {globalAllowed && league.state.status === 'ready' && (
            <LeagueCard
              studentId={studentId}
              tier={league.state.data.tier}
              activeTiers={league.state.data.activeTiers}
              rows={league.state.data.rows}
            />
          )}

          {upcoming.length > 0 && (
            <section className={s.card}>
              <h2 className={s.cardTitle}>Closest to unlocking</h2>
              <div className={s.badgeList}>
                {upcoming.map((item) => (
                  <div key={item.badge.id} className={s.badgeRow}>
                    <span className={s.badgeIcon} aria-hidden="true">{item.badge.icon}</span>
                    <div className={s.badgeBody}>
                      <div className={s.badgeHead}>
                        <span className={s.badgeName}>{item.badge.name}</span>
                        <span className={s.badgeProgress}>
                          {item.have} / {item.goal}
                        </span>
                      </div>
                      <div className={s.badgeTrack}>
                        <div
                          className={s.badgeFill}
                          style={{ width: `${item.pct}%` }}
                          role="progressbar"
                          aria-valuenow={Math.round(item.pct)}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`${item.badge.name} progress`}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

/** The three rows around the student, the tier, and how long is left. */
function LeagueCard({
  studentId,
  tier,
  activeTiers,
  rows,
}: {
  studentId: string;
  tier: (typeof LEAGUE_TIERS)[number];
  activeTiers: number;
  rows: { studentId: string; name: string; weeklyXp: number }[];
}) {
  const standings = rankCohort(rows, studentId, tier, activeTiers);
  if (standings.length === 0) return null;

  const meta = TIER_META[tier];
  const gap = xpToPromotion(standings, studentId);
  const meIndex = standings.findIndex((row) => row.isMe);

  // Three rows centred on the student, clamped to the ends of the table.
  const start = meIndex < 0 ? 0 : Math.min(Math.max(0, meIndex - 1), Math.max(0, standings.length - 3));
  const around = standings.slice(start, start + 3);

  return (
    <section className={s.card}>
      <div className={s.cardHead}>
        <h2 className={s.cardTitle} style={{ color: meta.color }}>
          {meta.label} League
        </h2>
        <span className={s.countdown}>{formatCountdown(msUntilWeekEnd())} left</span>
      </div>
      <div className={s.standings}>
        {around.map((row) => (
          <div key={row.studentId} className={`${s.standing} ${row.isMe ? s.standingMe : ''}`}>
            <span className={s.standingPos}>{row.position}</span>
            <span className={s.standingName}>{row.name}</span>
            <span className={s.standingXp}>{row.weeklyXp.toLocaleString()}</span>
          </div>
        ))}
      </div>
      {gap !== null && (
        <p className={s.cardNote}>
          {gap.toLocaleString()} XP would put you in the promotion zone.
        </p>
      )}
    </section>
  );
}

export default StudioPage;
