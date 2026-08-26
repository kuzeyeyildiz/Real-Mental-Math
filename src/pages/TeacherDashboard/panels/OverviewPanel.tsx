import { useMemo } from 'react';
import { analyseClass, type AnalyticsStudent } from '../../../engine/analytics';
import { formatAgo } from '../../../engine/assignmentEngine';
import { AREA_META } from '../../../data/areaMeta';
import { ClassStats } from './ClassStats';
import type { RosterEntry } from '../../../lib/api';
import type { Classroom } from '../../../types';
import p from '../../../components/panels/panels.module.css';
import s from '../TeacherDashboard.module.css';

interface OverviewPanelProps {
  roster: RosterEntry[];
  classroom: Classroom;
  onOpenRoster: () => void;
}

/**
 * The class at a glance — what a teacher wants on the way in, before they pick
 * a job. Every figure comes from the roster this dashboard already holds, so
 * opening it costs nothing.
 */
export function OverviewPanel({ roster, classroom, onOpenRoster }: OverviewPanelProps) {
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

  if (roster.length === 0) {
    return (
      <div className={p.empty}>
        No students have joined yet. Share code <strong>{classroom.join_code}</strong> and they’ll
        appear here.
      </div>
    );
  }

  return (
    <div className={p.panel}>
      <div className={p.panelHead}>
        <div>
          <h2 className={p.panelTitle}>Overview</h2>
          <p className={p.panelSub}>
            Where {classroom.name} stands today, and who to look at first.
          </p>
        </div>
      </div>

      <ClassStats analytics={analytics} />

      <div className={s.overviewGrid}>
        <div className={p.card}>
          <div className={p.cardTitle}>Needs a nudge</div>
          <div className={p.cardMeta}>
            Nobody who has practised in the last seven days is listed here.
          </div>
          {analytics.needsAttention.length === 0 ? (
            <div className={p.cardBody}>Everyone has practised this week. Nothing to chase.</div>
          ) : (
            <div className={p.rows}>
              {analytics.needsAttention.map((student) => (
                <div key={student.id} className={p.rowItem}>
                  <span className={p.rowName}>{student.name}</span>
                  <span className={p.rowValue}>
                    {student.solved} solved · last practised {formatAgo(student.lastActive)}
                  </span>
                </div>
              ))}
            </div>
          )}
          <button type="button" className={`${p.btn} ${p.btnGhost} ${p.cardAction}`} onClick={onOpenRoster}>
            Open the roster
          </button>
        </div>

        <div className={p.card}>
          <div className={p.cardTitle}>Average level by skill</div>
          {analytics.weakestAreas.length > 0 && (
            <div className={p.cardMeta}>
              Weakest across the class:{' '}
              <strong>{analytics.weakestAreas.map((a) => AREA_META[a].label).join(', ')}</strong>
            </div>
          )}
          <div className={p.rows}>
            {analytics.areas.map((stat) => (
              <div key={stat.area} className={p.rowItem}>
                <span className={p.rowName}>{AREA_META[stat.area].label}</span>
                <span className={p.rowStrong} style={{ color: AREA_META[stat.area].color }}>
                  Lv {stat.averageLevel.toFixed(1)} avg
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default OverviewPanel;
