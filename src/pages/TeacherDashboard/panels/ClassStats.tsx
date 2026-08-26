import type { ClassAnalytics } from '../../../engine/analytics';
import s from '../TeacherDashboard.module.css';

/**
 * The five numbers a teacher wants before they want anything else. All of them
 * already come out of `analyseClass()` — nothing here is a new read.
 */
export function ClassStats({ analytics }: { analytics: ClassAnalytics }) {
  const nudges = analytics.needsAttention.length;

  const cells: { label: string; value: number; alert?: boolean }[] = [
    { label: 'Students', value: analytics.students },
    { label: 'Practised this week', value: analytics.activeThisWeek },
    { label: 'Questions solved', value: analytics.totalSolved },
    { label: 'Average XP', value: analytics.averageXp },
    { label: 'Need a nudge', value: nudges, alert: nudges > 0 },
  ];

  return (
    <div className={s.statStrip}>
      {cells.map((cell) => (
        <div key={cell.label} className={s.statCard}>
          <div className={`${s.statValue} ${cell.alert ? s.statValueAlert : ''}`}>
            {cell.value.toLocaleString()}
          </div>
          <div className={s.statLabel}>{cell.label}</div>
        </div>
      ))}
    </div>
  );
}

export default ClassStats;
