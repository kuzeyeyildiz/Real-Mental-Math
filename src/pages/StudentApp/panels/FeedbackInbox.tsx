import { useCallback, useState } from 'react';
import { getFeedbackForStudent, markFeedbackRead } from '../../../lib/classroomApi';
import { useFetched } from '../../../lib/useFetched';
import { PanelError, PanelLoading } from '../../../components/panels/PanelState';
import { formatAgo } from '../../../engine/assignmentEngine';
import type { Feedback } from '../../../types';
import s from '../../../components/panels/panels.module.css';

export function FeedbackInbox({ studentId }: { studentId: string }) {
  const load = useCallback(() => getFeedbackForStudent(studentId), [studentId]);
  const { state, reload, patch } = useFetched<Feedback[]>(load, studentId);
  const [error, setError] = useState<string | null>(null);

  async function handleRead(item: Feedback) {
    const readAt = new Date().toISOString();
    setError(null);
    // Optimistic: marking as read is cosmetic, and a round trip before the
    // badge clears would feel broken.
    patch((items) => items.map((f) => (f.id === item.id ? { ...f, read_at: readAt } : f)));
    const { error: err } = await markFeedbackRead(item.id);
    if (err) {
      patch((items) => items.map((f) => (f.id === item.id ? { ...f, read_at: null } : f)));
      setError(err);
    }
  }

  if (state.status === 'loading') return <PanelLoading label="Loading your feedback…" />;
  if (state.status === 'error') {
    return (
      <PanelError
        title="Couldn't load your feedback"
        message={state.message}
        onRetry={() => void reload()}
      />
    );
  }

  return (
    <div className={s.panel}>
      <div className={s.panelHead}>
        <div>
          <h2 className={s.panelTitle}>Feedback</h2>
          <p className={s.panelSub}>Notes your teacher has written for you.</p>
        </div>
      </div>

      {error && <div className={s.error}>{error}</div>}

      {state.data.length === 0 ? (
        <div className={s.empty}>No feedback yet.</div>
      ) : (
        <div className={s.list}>
          {state.data.map((item) => (
            <div key={item.id} className={s.card}>
              <div className={s.cardHead}>
                <div className={s.cardMeta}>
                  {!item.read_at && <span className={`${s.pill} ${s.pillInfo}`}>New</span>}
                  <span>{formatAgo(item.created_at)}</span>
                </div>
                {!item.read_at && (
                  <button
                    type="button"
                    className={s.btnQuiet}
                    onClick={() => void handleRead(item)}
                  >
                    Mark as read
                  </button>
                )}
              </div>
              <div className={s.cardBody}>{item.body}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default FeedbackInbox;
