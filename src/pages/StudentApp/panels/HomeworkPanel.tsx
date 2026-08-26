import { useState } from 'react';
import { getAssignmentQuestions, type StudentAssignment } from '../../../lib/classroomApi';
import type { Load } from '../../../lib/useFetched';
import { PanelError, PanelLoading } from '../../../components/panels/PanelState';
import { AssignmentRunner } from '../../../components/AssignmentRunner/AssignmentRunner';
import { VideoEmbed } from '../../../components/VideoEmbed/VideoEmbed';
import {
  accuracy,
  assignmentStatus,
  formatDue,
  STATUS_LABEL,
  type AssignmentStatus,
} from '../../../engine/assignmentEngine';
import { areaList } from '../../../data/areaMeta';
import type { AssignmentQuestion, StudentProgress } from '../../../types';
import s from '../../../components/panels/panels.module.css';

interface HomeworkPanelProps {
  studentId: string;
  seed: StudentProgress;
  onProgress: (snapshot: StudentProgress) => void;
  /**
   * The assignment list is read one level up, because the rail's badge needs the
   * outstanding count whether or not this panel is on screen.
   */
  state: Load<StudentAssignment[]>;
  onReload: (quiet?: boolean) => void | Promise<void>;
}

/** A run that is loaded and ready, with the teacher's questions if it has any. */
interface ActiveRun {
  item: StudentAssignment;
  written: AssignmentQuestion[];
}

const STATUS_CLASS: Record<AssignmentStatus, string> = {
  done: s.pillOk,
  overdue: s.pillErr,
  'due-soon': s.pillWarn,
  open: s.pillInfo,
};

const STRIP_CLASS: Record<AssignmentStatus, string> = {
  done: s.stripOk,
  overdue: s.stripErr,
  'due-soon': s.stripWarn,
  open: '',
};

export function HomeworkPanel({
  studentId,
  seed,
  onProgress,
  state,
  onReload,
}: HomeworkPanelProps) {
  const [running, setRunning] = useState<ActiveRun | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  /**
   * A teacher-written set needs its questions before the first one can be shown,
   * so the fetch happens here rather than inside the runner — the runner builds
   * the whole sequence once, and it cannot do that from a half-loaded list.
   */
  async function handleStart(item: StudentAssignment) {
    setStartError(null);
    if (item.assignment.kind !== 'custom') {
      setRunning({ item, written: [] });
      return;
    }
    setStartingId(item.assignment.id);
    const res = await getAssignmentQuestions(item.assignment.id);
    setStartingId(null);
    if (!res.ok) {
      setStartError(res.error);
      return;
    }
    setRunning({ item, written: res.data });
  }

  if (running) {
    return (
      <AssignmentRunner
        assignment={running.item.assignment}
        written={running.written}
        studentId={studentId}
        seed={seed}
        onProgress={onProgress}
        onFinished={() => void onReload()}
        onExit={() => setRunning(null)}
      />
    );
  }

  if (state.status === 'loading') return <PanelLoading label="Loading your homework…" />;
  if (state.status === 'error') {
    return (
      <PanelError
        title="Couldn't load your homework"
        message={state.message}
        onRetry={() => void onReload()}
      />
    );
  }

  const todo = state.data.filter((a) => !a.submission);
  const done = state.data.filter((a) => a.submission);

  const renderCard = (item: StudentAssignment) => {
    const status = assignmentStatus(item.assignment, item.submission);
    const { assignment } = item;
    const source =
      assignment.kind === 'custom'
        ? 'set by your teacher'
        : assignment.kind === 'mixed'
          ? 'mixed exercises'
          : areaList(assignment.areas);
    return (
      <div key={assignment.id} className={s.card}>
        <div className={s.cardHead}>
          <div>
            <div className={s.cardTitle}>{assignment.title}</div>
            <div className={s.cardMeta}>
              <span>{item.className}</span>
              <span>· {source}</span>
              <span>· {assignment.question_count} questions</span>
            </div>
          </div>
          <span className={`${s.pill} ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>
        </div>

        {/* The deadline gets its own strip rather than a fourth clause in the
            meta line — it is the one fact that decides what to do next. */}
        <div className={`${s.strip} ${STRIP_CLASS[status]}`}>{formatDue(assignment.due_at)}</div>

        {assignment.instructions && <div className={s.cardBody}>{assignment.instructions}</div>}
        {assignment.video_url && (
          <VideoEmbed url={assignment.video_url} title={`Video for ${assignment.title}`} />
        )}

        {item.submission && (
          <div className={s.cardMeta}>
            Scored {item.submission.correct} / {item.submission.total} ·{' '}
            {accuracy(item.submission.correct, item.submission.total)}% · earned{' '}
            {item.submission.xp_earned} XP
          </div>
        )}

        <button
          type="button"
          className={`${s.btn} ${item.submission ? s.btnGhost : ''} ${s.cardAction}`}
          onClick={() => void handleStart(item)}
          disabled={startingId === assignment.id}
        >
          {startingId === assignment.id
            ? 'Opening…'
            : item.submission
              ? 'Do it again'
              : 'Start assignment'}
        </button>
      </div>
    );
  };

  return (
    <div className={s.panel}>
      <div className={s.panelHead}>
        <div>
          <h2 className={s.panelTitle}>Homework</h2>
          <p className={s.panelSub}>
            Work your teacher has set for you. Everything you answer here still counts toward your
            skill levels.
          </p>
        </div>
      </div>

      {startError && <div className={s.error} role="alert">{startError}</div>}

      {state.data.length === 0 && (
        <div className={s.empty}>
          Nothing set right now. When your teacher assigns something it will show up here.
        </div>
      )}

      {todo.length > 0 && <div className={s.list}>{todo.map(renderCard)}</div>}

      {done.length > 0 && (
        <>
          <h3 className={s.label}>Already handed in</h3>
          <div className={s.list}>{done.map(renderCard)}</div>
        </>
      )}
    </div>
  );
}

export default HomeworkPanel;
