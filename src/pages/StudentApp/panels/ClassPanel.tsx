import { useState } from 'react';
import { ErrorBoundary } from '../../../components/ErrorBoundary/ErrorBoundary';
import { MaterialsPanel } from '../../../components/MaterialsPanel/MaterialsPanel';
import { StudySessionsPanel } from '../../../components/StudySessionsPanel/StudySessionsPanel';
import { ClassFeedPanel } from '../../../components/ClassFeedPanel/ClassFeedPanel';
import { FriendsPanel } from '../../../components/FriendsPanel/FriendsPanel';
import { JoinClassCard } from '../../../components/JoinClassCard/JoinClassCard';
import { FeedbackInbox } from './FeedbackInbox';
import type { Classroom } from '../../../types';
import s from '../../../components/panels/panels.module.css';

type Tab = 'feed' | 'materials' | 'sessions' | 'friends' | 'feedback';

const TABS: { key: Tab; label: string }[] = [
  { key: 'feed', label: 'Feed' },
  { key: 'materials', label: 'Material' },
  { key: 'sessions', label: 'Sessions' },
  { key: 'friends', label: 'Friends' },
  { key: 'feedback', label: 'Feedback' },
];

/** Friends are classmates by design, so they live here rather than in a
 *  destination of their own — but they span every class the student is in, so
 *  the classroom switcher above does not apply to them. */
const IGNORES_CLASSROOM: Tab[] = ['friends'];

interface ClassPanelProps {
  studentId: string;
  studentName: string;
  xp: number;
  classes: Classroom[];
  onSocialChange?: () => void;
  /** Joining a class changes what the whole app offers, so the page reloads. */
  onClassesChanged?: () => void;
}

export function ClassPanel({
  studentId,
  studentName,
  xp,
  classes,
  onSocialChange,
  onClassesChanged,
}: ClassPanelProps) {
  const [activeId, setActiveId] = useState<string | null>(classes[0]?.id ?? null);
  const [tab, setTab] = useState<Tab>('feed');

  const active = classes.find((c) => c.id === activeId) ?? classes[0] ?? null;

  if (!active) {
    return (
      <div className={s.panel}>
        <div className={s.empty}>
          You’re practising on your own, which works perfectly well. If you have a class
          code, entering it below adds your teacher’s homework, material and class feed.
        </div>
        <JoinClassCard onJoined={onClassesChanged} />
      </div>
    );
  }

  const showSwitcher = classes.length > 1 && !IGNORES_CLASSROOM.includes(tab);

  return (
    <div className={s.panel}>
      {showSwitcher && (
        <nav className={s.groupTabs} aria-label="Class">
          {classes.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`${s.groupTab} ${c.id === active.id ? s.groupTabActive : ''}`}
              onClick={() => setActiveId(c.id)}
              aria-pressed={c.id === active.id}
            >
              {c.name}
            </button>
          ))}
        </nav>
      )}

      <nav className={s.tabs} aria-label="Class section">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={`${s.tab} ${tab === key ? s.tabActive : ''}`}
            onClick={() => setTab(key)}
            aria-pressed={tab === key}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* A failure inside one section must not blank the student's whole class
          view — remounting per tab also clears a crashed panel on switch. */}
      <ErrorBoundary key={`${active.id}-${tab}`}>
        {tab === 'feed' && (
          <ClassFeedPanel classroomId={active.id} userId={studentId} canPost={false} />
        )}
        {tab === 'materials' && (
          <MaterialsPanel classroomId={active.id} teacherId={null} canManage={false} />
        )}
        {tab === 'sessions' && (
          <StudySessionsPanel classroomId={active.id} userId={studentId} canModerate={false} />
        )}
        {tab === 'friends' && (
          <FriendsPanel
            studentId={studentId}
            myName={studentName}
            myXp={xp}
            onSocialChange={onSocialChange}
          />
        )}
        {tab === 'feedback' && <FeedbackInbox studentId={studentId} />}
      </ErrorBoundary>

      <JoinClassCard onJoined={onClassesChanged} />
    </div>
  );
}

export default ClassPanel;
