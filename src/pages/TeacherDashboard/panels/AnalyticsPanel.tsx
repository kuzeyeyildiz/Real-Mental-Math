import { useCallback, useMemo, useState } from 'react';
import {
  getClassroomAssignments,
  sendFeedback,
  type AssignmentDetail,
} from '../../../lib/classroomApi';
import { useFetched } from '../../../lib/useFetched';
import { PanelError, PanelLoading } from '../../../components/panels/PanelState';
import { analyseClass, type AnalyticsStudent } from '../../../engine/analytics';
import { formatAgo, summariseSubmissions } from '../../../engine/assignmentEngine';
import { AREA_META } from '../../../data/areaMeta';
import { AREAS, skillProgress } from '../../../engine/skillLadder';
import { ClassStats } from './ClassStats';
import type { RosterEntry } from '../../../lib/api';
import s from '../../../components/panels/panels.module.css';
import t from '../TeacherDashboard.module.css';

interface AnalyticsPanelProps {
  classroomId: string;
  roster: RosterEntry[];
  teacherId: string;
}

/** Level bars are drawn against this, so a strong class doesn't peg every bar full. */
const LEVEL_SCALE = 12;

function initialsOf(name: string): string {
  return (name || '?')
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

const NUMBER_WORD = ['nobody', 'one', 'two', 'three', 'four', 'five', 'six'];

/** "Message all three" reads better than "message all 3" at this size. */
function countWord(n: number): string {
  return n < NUMBER_WORD.length ? NUMBER_WORD[n] : String(n);
}

export function AnalyticsPanel({ classroomId, roster, teacherId }: AnalyticsPanelProps) {
  const load = useCallback(() => getClassroomAssignments(classroomId), [classroomId]);
  const { state, reload } = useFetched<AssignmentDetail[]>(load, classroomId);

  const [composing, setComposing] = useState(false);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState(0);

  const students = useMemo<AnalyticsStudent[]>(
    () =>
      roster.map((entry) => ({
        id: entry.profile.id,
        name: entry.profile.full_name,
        xp: entry.xp,
        solved: entry.solved,
        skillXp: entry.skillXp,
        lastActive: entry.lastActive,
      })),
    [roster]
  );

  const analytics = useMemo(() => analyseClass(students), [students]);

  /**
   * One message, sent to each quiet student individually — the same write the
   * student-detail panel uses, so it lands in the same inbox and reads the same
   * way. Nothing is sent until the teacher has written and pressed send.
   */
  async function handleSendAll() {
    const body = note.trim();
    if (!body) return;
    setSending(true);
    setSendError(null);
    const results = await Promise.all(
      analytics.needsAttention.map((student) =>
        sendFeedback(student.id, teacherId, classroomId, body)
      )
    );
    setSending(false);
    const failed = results.filter((r) => r.error);
    if (failed.length > 0) {
      setSendError(
        failed.length === results.length
          ? failed[0].error
          : `Sent to ${results.length - failed.length} of ${results.length}. ${failed[0].error}`
      );
      return;
    }
    setSentTo(results.length);
    setNote('');
    setComposing(false);
  }

  if (state.status === 'loading') return <PanelLoading label="Loading analytics…" />;
  if (state.status === 'error') {
    return (
      <PanelError
        title="Couldn't load analytics"
        message={state.message}
        onRetry={() => void reload()}
      />
    );
  }

  const assignmentRows = state.data.map((detail) => {
    const assigned =
      detail.targetIds.length > 0 ? detail.targetIds.length : roster.length;
    return { detail, progress: summariseSubmissions(assigned, detail.submissions) };
  });

  if (roster.length === 0) {
    return (
      <div className={s.panel}>
        <div className={s.empty}>
          No students have joined this class yet, so there is nothing to analyse. Share the join
          code and check back once they’ve practised.
        </div>
      </div>
    );
  }

  return (
    <div className={s.panel}>
      <div className={s.panelHead}>
        <div>
          <h2 className={s.panelTitle}>Analytics</h2>
          <p className={s.panelSub}>
            How this class is doing across the four skills, and who has gone quiet.
          </p>
        </div>
      </div>

      <ClassStats analytics={analytics} />

      <div className={s.card}>
        <div className={s.cardTitle}>Average level by skill</div>
        {analytics.weakestAreas.length > 0 && (
          <div className={s.cardMeta}>
            Weakest across the class:{' '}
            <strong>{analytics.weakestAreas.map((a) => AREA_META[a].label).join(', ')}</strong>
          </div>
        )}
        <div className={s.bars}>
          {analytics.areas.map((stat) => {
            const meta = AREA_META[stat.area];
            const pct = Math.min(100, (stat.averageLevel / LEVEL_SCALE) * 100);
            const minPct = Math.min(100, (stat.minLevel / LEVEL_SCALE) * 100);
            const maxPct = Math.min(100, (stat.maxLevel / LEVEL_SCALE) * 100);
            return (
              <div key={stat.area}>
                <div className={s.barHead}>
                  <span className={s.barName}>{meta.label}</span>
                  <span className={s.barValue} style={{ color: meta.color }}>
                    Lv {stat.averageLevel.toFixed(1)} avg
                    <span className={s.barRange}> · {stat.minLevel}–{stat.maxLevel} range</span>
                  </span>
                </div>
                {/* The average alone hides a split class; the ticks show how far
                    apart the strongest and weakest actually are. */}
                <div className={`${s.track} ${t.rangeTrack}`}>
                  <div
                    className={s.fill}
                    role="progressbar"
                    aria-valuenow={Math.round(pct)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${meta.label} class average level ${stat.averageLevel}`}
                    style={{ width: `${pct}%`, background: meta.color }}
                  />
                  <span className={t.rangeTick} style={{ left: `${minPct}%` }} aria-hidden="true" />
                  <span className={t.rangeTick} style={{ left: `${maxPct}%` }} aria-hidden="true" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className={s.card}>
        <div className={s.cardTitle}>Needs a nudge</div>
        <div className={s.cardMeta}>Nobody who has practised in the last seven days is listed here.</div>
        {analytics.needsAttention.length === 0 ? (
          <div className={s.cardBody}>Everyone has practised this week. Nothing to chase.</div>
        ) : (
          <>
            <div className={t.nudgeList}>
              {analytics.needsAttention.map((student) => (
                <div key={student.id} className={t.nudgeRow}>
                  <span className={t.nudgeAvatar} aria-hidden="true">
                    {initialsOf(student.name)}
                  </span>
                  <span className={t.nudgeName}>{student.name}</span>
                  <span className={t.nudgeMeta}>
                    {student.solved} solved · last practised {formatAgo(student.lastActive)}
                  </span>
                </div>
              ))}
            </div>

            {sentTo > 0 && !composing && (
              <div className={s.ok} role="status">
                Sent to {countWord(sentTo)}. They’ll see it next time they open Numo.
              </div>
            )}

            {composing ? (
              <div className={t.composer}>
                <label className={s.label} htmlFor="nudge-note">
                  Message
                </label>
                <textarea
                  id="nudge-note"
                  className={s.textarea}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Something short and specific — “Two minutes of times tables today?”"
                  autoFocus
                />
                {sendError && <div className={s.error} role="alert">{sendError}</div>}
                <div className={s.row}>
                  <button
                    type="button"
                    className={s.btn}
                    onClick={() => void handleSendAll()}
                    disabled={sending || !note.trim()}
                  >
                    {sending
                      ? 'Sending…'
                      : `Send to ${countWord(analytics.needsAttention.length)}`}
                  </button>
                  <button
                    type="button"
                    className={`${s.btn} ${s.btnQuiet}`}
                    onClick={() => {
                      setComposing(false);
                      setSendError(null);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className={`${s.btn} ${s.btnGhost} ${s.cardAction}`}
                onClick={() => {
                  setComposing(true);
                  setSentTo(0);
                }}
              >
                Message all {countWord(analytics.needsAttention.length)}
              </button>
            )}
          </>
        )}
      </div>

      <div className={s.card}>
        <div className={s.cardTitle}>Assignment completion</div>
        {assignmentRows.length === 0 ? (
          <div className={s.cardBody}>No assignments set for this class yet.</div>
        ) : (
          <div className={t.completionList}>
            {assignmentRows.map(({ detail, progress }) => {
              const pct =
                progress.assigned > 0 ? (progress.handedIn / progress.assigned) * 100 : 0;
              const done = progress.assigned > 0 && progress.handedIn >= progress.assigned;
              return (
                <div key={detail.assignment.id}>
                  <div className={s.barHead}>
                    <span className={s.barName}>{detail.assignment.title}</span>
                    <span className={s.chips}>
                      <span className={`${s.pill} ${done ? s.pillOk : s.pillInfo}`}>
                        {progress.handedIn} / {progress.assigned} in
                      </span>
                      {progress.handedIn > 0 && (
                        <span className={s.pill}>{progress.averageAccuracy}% avg</span>
                      )}
                    </span>
                  </div>
                  <div className={s.track}>
                    <div
                      className={s.fill}
                      role="progressbar"
                      aria-valuenow={Math.round(pct)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${detail.assignment.title} handed in`}
                      style={{
                        width: `${pct}%`,
                        background: done ? 'var(--color-success)' : 'var(--color-primary)',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className={s.card}>
        <div className={s.cardTitle}>Strongest skill per student</div>
        <div className={s.rows}>
          {roster.map((entry) => {
            const levels = AREAS.map((area) => ({
              area,
              level: skillProgress(entry.skillXp[area]).level,
            }));
            const top = Math.max(...levels.map((l) => l.level));
            const leaders = levels.filter((l) => l.level === top);
            // Naming one skill when all four are tied would be reporting the
            // order of the list rather than anything about the student.
            const tied = leaders.length === levels.length;
            return (
              <div key={entry.profile.id} className={s.rowItem}>
                <span className={s.rowName}>{entry.profile.full_name}</span>
                {tied ? (
                  <span className={s.rowValue}>Even across all four · Lv {top}</span>
                ) : (
                  <span className={s.rowStrong} style={{ color: AREA_META[leaders[0].area].color }}>
                    {leaders.map((l) => AREA_META[l.area].label).join(' & ')} · Lv {top}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default AnalyticsPanel;
