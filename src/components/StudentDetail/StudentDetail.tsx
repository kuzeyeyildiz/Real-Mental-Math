import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LEVEL_LABEL } from '../../engine/benchmarkEngine';
import { MAX_BENCHMARK_SCORE } from '../../data/benchmarkTest';
import { skillProgress, AREAS } from '../../engine/skillLadder';
import { formatAgo } from '../../engine/assignmentEngine';
import { AREA_META } from '../../data/areaMeta';
import { getFeedbackForStudent, sendFeedback } from '../../lib/classroomApi';
import { useFetched } from '../../lib/useFetched';
import type { RosterEntry } from '../../lib/api';
import type { Feedback } from '../../types';
import s from './StudentDetail.module.css';
import p from '../panels/panels.module.css';

interface StudentDetailProps {
  entry: RosterEntry;
  className: string;
  classroomId: string;
  teacherId: string;
  onClose: () => void;
}

/** Teacher-only view of one student's placement, per-skill progress and feedback. */
export function StudentDetail({
  entry,
  className,
  classroomId,
  teacherId,
  onClose,
}: StudentDetailProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const studentId = entry.profile.id;

  const loadFeedback = useCallback(() => getFeedbackForStudent(studentId), [studentId]);
  const { state: feedback, reload: reloadFeedback } = useFetched<Feedback[]>(
    loadFeedback,
    studentId
  );

  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    setBusy(true);
    setNoteError(null);
    const { error } = await sendFeedback(studentId, teacherId, classroomId, note.trim());
    setBusy(false);
    if (error) {
      setNoteError(error);
      return;
    }
    setNote('');
    void reloadFeedback();
  }

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const { profile, level, score, xp, solved, skillXp, lastActive } = entry;
  const initials = (profile.full_name || '?')
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className={s.backdrop} onClick={onClose} role="presentation">
      <div
        className={s.sheet}
        role="dialog"
        aria-modal="true"
        aria-label={`${profile.full_name} — student detail`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={s.head}>
          <div className={s.identity}>
            <div className={s.avatar} aria-hidden="true">{initials}</div>
            <div>
              <div className={s.name}>{profile.full_name}</div>
              <div className={s.meta}>
                {profile.grade || 'No grade set'} · {className}
              </div>
            </div>
          </div>
          <button ref={closeRef} type="button" className={s.close} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className={s.statRow}>
          <div className={s.stat}>
            <span className={s.statValue}>{xp}</span>
            <span className={s.statLabel}>Total XP</span>
          </div>
          <div className={s.stat}>
            <span className={s.statValue}>{solved}</span>
            <span className={s.statLabel}>Solved</span>
          </div>
          <div className={s.stat}>
            <span className={s.statValue}>
              {level ? LEVEL_LABEL[level] : '—'}
            </span>
            <span className={s.statLabel}>Placement</span>
          </div>
          <div className={s.stat}>
            <span className={s.statValue}>
              {score != null ? score : '—'}
              {score != null && <span className={s.statOutOf}>/{MAX_BENCHMARK_SCORE}</span>}
            </span>
            <span className={s.statLabel}>Score</span>
          </div>
        </div>

        <div className={s.section}>
          <h3 className={s.sectionTitle}>Skill levels</h3>
          <div className={s.skills}>
            {AREAS.map((area) => {
              const ladder = skillProgress(skillXp[area]);
              return (
                <div key={area} className={s.skill}>
                  <div className={s.skillHead}>
                    <span className={s.skillName}>{AREA_META[area].label}</span>
                    <span className={s.skillLevel} style={{ color: AREA_META[area].color }}>
                      Level {ladder.level}
                    </span>
                  </div>
                  <div className={s.track}>
                    <div
                      className={s.fill}
                      style={{ width: `${ladder.pct}%`, background: AREA_META[area].color }}
                      role="progressbar"
                      aria-valuenow={Math.round(ladder.pct)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${AREA_META[area].label} level ${ladder.level} progress`}
                    />
                  </div>
                  <div className={s.skillFoot}>
                    {skillXp[area]} XP · {ladder.toNext} to Lv {ladder.level + 1}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className={s.section}>
          <h3 className={s.sectionTitle}>Feedback</h3>
          <form className={s.feedbackForm} onSubmit={handleSend}>
            <label className={p.srOnly} htmlFor="feedback-body">
              Feedback for {profile.full_name}
            </label>
            <textarea
              id="feedback-body"
              className={p.textarea}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={`Write a note for ${profile.full_name.split(' ')[0]} — they'll see it in their Class tab.`}
              maxLength={2000}
            />
            {noteError && <div className={p.error}>{noteError}</div>}
            <button type="submit" className={p.btn} disabled={busy || !note.trim()}>
              {busy ? 'Sending…' : 'Send feedback'}
            </button>
          </form>

          {feedback.status === 'error' && (
            <div className={p.error}>
              Couldn’t load past feedback.{' '}
              <button type="button" className={p.errorRetry} onClick={() => void reloadFeedback()}>
                Retry
              </button>
            </div>
          )}

          {feedback.status === 'ready' && feedback.data.length > 0 && (
            <div className={s.feedbackList}>
              {feedback.data.map((item) => (
                <div key={item.id} className={s.feedbackItem}>
                  <div className={s.feedbackMeta}>
                    {formatAgo(item.created_at)}
                    {item.read_at ? ' · read' : ' · unread'}
                  </div>
                  <div className={s.feedbackBody}>{item.body}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <footer className={s.foot}>
          Last practised {formatAgo(lastActive)}
          {!level && ' · has not taken the assessment yet'}
        </footer>
      </div>
    </div>
  );
}

export default StudentDetail;
