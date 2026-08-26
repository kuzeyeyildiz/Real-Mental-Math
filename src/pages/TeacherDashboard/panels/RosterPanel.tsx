import { useMemo, useState } from 'react';
import { StudentDetail } from '../../../components/StudentDetail/StudentDetail';
import { LEVEL_LABEL } from '../../../engine/benchmarkEngine';
import { skillProgress, AREAS } from '../../../engine/skillLadder';
import { analyseClass, type AnalyticsStudent } from '../../../engine/analytics';
import { formatAgo } from '../../../engine/assignmentEngine';
import { AREA_META } from '../../../data/areaMeta';
import { ClassStats } from './ClassStats';
import type { RosterEntry } from '../../../lib/api';
import type { Level } from '../../../types';
import s from '../TeacherDashboard.module.css';
import p from '../../../components/panels/panels.module.css';

/** Tinted rather than filled: a placement is a starting point, not a verdict. */
const LEVEL_TAG: Record<Level, string> = {
  beginner: s.tagBeginner,
  intermediate: s.tagIntermediate,
  expert: s.tagExpert,
  master: s.tagMaster,
};

type Filter = 'all' | 'nudge' | 'untested';

const DAYS = 7;

interface RosterPanelProps {
  roster: RosterEntry[];
  className: string;
  classroomId: string;
  teacherId: string;
  joinCode: string;
}

function initialsOf(name: string): string {
  return (name || '?')
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/**
 * Bar heights for one student's week, as a percentage of their own best day.
 *
 * Scaled per student rather than across the class: this column answers "is this
 * child working steadily or in one panicked burst", and normalising it against
 * the class's strongest would flatten everyone else's shape to nothing.
 */
function sparkHeights(dailyXp: number[]): number[] {
  const week = dailyXp.length === DAYS ? dailyXp : Array<number>(DAYS).fill(0);
  const peak = Math.max(...week);
  if (peak <= 0) return week.map(() => 0);
  return week.map((xp) => (xp > 0 ? Math.max(18, (xp / peak) * 100) : 0));
}

export function RosterPanel({
  roster,
  className,
  classroomId,
  teacherId,
  joinCode,
}: RosterPanelProps) {
  const [selected, setSelected] = useState<RosterEntry | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

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
  // The same rule the analytics panel uses, so the two never disagree about
  // who has gone quiet.
  const quiet = useMemo(
    () => new Set(analytics.needsAttention.map((a) => a.id)),
    [analytics]
  );
  const untestedCount = roster.filter((e) => !e.level).length;

  const shown = useMemo(() => {
    if (filter === 'nudge') return roster.filter((e) => quiet.has(e.profile.id));
    if (filter === 'untested') return roster.filter((e) => !e.level);
    return roster;
  }, [roster, filter, quiet]);

  if (roster.length === 0) {
    return (
      <div className={p.empty}>
        No students have joined yet. Share code <strong>{joinCode}</strong> and they’ll appear here.
      </div>
    );
  }

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'nudge', label: `Needs a nudge · ${quiet.size}` },
    { key: 'untested', label: `Not tested · ${untestedCount}` },
  ];

  return (
    <div className={p.panel}>
      <ClassStats analytics={analytics} />

      <div className={s.tableCard}>
        <div className={s.tableHead}>
          <div>
            <div className={s.tableTitle}>
              {roster.length} {roster.length === 1 ? 'student' : 'students'}
            </div>
            <div className={s.tableSub}>
              Select a student to see their full profile, their skill ladders, and to leave them
              feedback.
            </div>
          </div>
          <div className={s.filters}>
            {filters.map((f) => (
              <button
                key={f.key}
                type="button"
                className={`${s.filterChip} ${filter === f.key ? s.filterChipOn : ''}`}
                onClick={() => setFilter(f.key)}
                aria-pressed={filter === f.key}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className={s.tableScroll}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Student</th>
                <th>Placement</th>
                <th>Skill levels</th>
                <th>Last 7 days</th>
                <th className={s.alignRight}>XP</th>
                <th className={s.alignRight}>Last active</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((entry) => {
                const isQuiet = quiet.has(entry.profile.id);
                return (
                  <tr
                    key={entry.profile.id}
                    className={s.rosterRow}
                    tabIndex={0}
                    role="button"
                    aria-label={`Open ${entry.profile.full_name}'s profile`}
                    onClick={() => setSelected(entry)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelected(entry);
                      }
                    }}
                  >
                    <td>
                      <div className={s.studentCell}>
                        <span
                          className={`${s.rosterAvatar} ${isQuiet ? s.rosterAvatarQuiet : ''}`}
                          aria-hidden="true"
                        >
                          {initialsOf(entry.profile.full_name)}
                        </span>
                        <div>
                          <div className={s.studentName}>{entry.profile.full_name}</div>
                          <div className={s.studentGrade}>{entry.profile.grade ?? 'No grade set'}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      {entry.level ? (
                        <span className={`${s.levelTag} ${LEVEL_TAG[entry.level]}`}>
                          {LEVEL_LABEL[entry.level]}
                        </span>
                      ) : (
                        <span className={`${s.levelTag} ${s.tagUntested}`}>Not tested</span>
                      )}
                    </td>
                    <td>
                      <div className={s.levelCells}>
                        {AREAS.map((area) => {
                          const level = skillProgress(entry.skillXp[area]).level;
                          return (
                            <span
                              key={area}
                              className={s.miniLevel}
                              // Dimmed at level 1: nothing has moved yet, and a
                              // full-strength chip would read as progress.
                              style={{
                                background: AREA_META[area].color,
                                opacity: level === 1 ? 0.4 : 1,
                              }}
                              title={`${AREA_META[area].label} — level ${level}`}
                            >
                              <span aria-hidden="true">{AREA_META[area].sym}</span>
                              {level}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td>
                      <div
                        className={s.spark}
                        role="img"
                        aria-label={`XP over the last seven days: ${entry.dailyXp.join(', ')}`}
                      >
                        {sparkHeights(entry.dailyXp).map((height, i) => (
                          <span
                            key={i}
                            className={`${s.sparkBar} ${height > 0 ? s.sparkBarOn : ''}`}
                            style={height > 0 ? { height: `${height}%` } : undefined}
                          />
                        ))}
                      </div>
                    </td>
                    <td className={`${s.alignRight} ${s.xpCell}`}>{entry.xp.toLocaleString()}</td>
                    <td className={`${s.alignRight} ${isQuiet ? s.lastActiveQuiet : s.lastActive}`}>
                      {entry.lastActive ? formatAgo(entry.lastActive) : 'Never'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {shown.length === 0 && (
          <div className={s.filterEmpty}>
            Nobody matches that filter — which is the good outcome.
          </div>
        )}
      </div>

      {selected && (
        <StudentDetail
          entry={selected}
          className={className}
          classroomId={classroomId}
          teacherId={teacherId}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

export default RosterPanel;
