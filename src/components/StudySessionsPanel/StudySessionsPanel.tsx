import React, { useCallback, useState } from 'react';
import {
  createStudySession,
  deleteStudySession,
  getStudySessions,
  joinStudySession,
  leaveStudySession,
  type SessionDetail,
} from '../../lib/classroomApi';
import { useFetched } from '../../lib/useFetched';
import { PanelError, PanelLoading } from '../panels/PanelState';
import { AREA_META, areaList } from '../../data/areaMeta';
import { AREAS } from '../../engine/skillLadder';
import type { Area } from '../../types';
import s from '../panels/panels.module.css';

interface StudySessionsPanelProps {
  classroomId: string;
  userId: string;
  /** Teachers can remove a session they did not host. */
  canModerate: boolean;
}

/** A datetime-local input needs "YYYY-MM-DDTHH:mm" in the viewer's own timezone. */
function defaultWhen(): string {
  const soon = new Date(Date.now() + 24 * 60 * 60 * 1000);
  soon.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${soon.getFullYear()}-${pad(soon.getMonth() + 1)}-${pad(soon.getDate())}T${pad(soon.getHours())}:${pad(soon.getMinutes())}`;
}

export function StudySessionsPanel({ classroomId, userId, canModerate }: StudySessionsPanelProps) {
  const load = useCallback(() => getStudySessions(classroomId), [classroomId]);
  const { state, reload } = useFetched<SessionDetail[]>(load, classroomId);

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [areas, setAreas] = useState<Area[]>([...AREAS]);
  const [when, setWhen] = useState(defaultWhen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Read once, so a session doesn't hop from "upcoming" to "past" mid-scroll.
  const [mountedAt] = useState(() => Date.now());

  const toggleArea = (area: Area) =>
    setAreas((cur) => (cur.includes(area) ? cur.filter((a) => a !== area) : [...cur, area]));

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || areas.length === 0 || !when) return;
    setBusy(true);
    setError(null);
    const { error: err } = await createStudySession({
      classroomId,
      hostId: userId,
      title: title.trim(),
      note: note.trim() || null,
      areas,
      scheduledAt: new Date(when).toISOString(),
    });
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setTitle('');
    setNote('');
    setAreas([...AREAS]);
    setWhen(defaultWhen());
    setOpen(false);
    void reload();
  }

  async function handleJoin(detail: SessionDetail, joined: boolean) {
    setError(null);
    const { error: err } = joined
      ? await leaveStudySession(detail.session.id, userId)
      : await joinStudySession(detail.session.id, userId);
    if (err) {
      setError(err);
      return;
    }
    void reload();
  }

  async function handleDelete(detail: SessionDetail) {
    setError(null);
    const { error: err } = await deleteStudySession(detail.session.id);
    if (err) {
      setError(err);
      return;
    }
    void reload();
  }

  if (state.status === 'loading') return <PanelLoading label="Loading study sessions…" />;
  if (state.status === 'error') {
    return (
      <PanelError
        title="Couldn't load study sessions"
        message={state.message}
        onRetry={() => void reload()}
      />
    );
  }

  const upcoming = state.data.filter((d) => new Date(d.session.scheduled_at).getTime() >= mountedAt);
  const past = state.data.filter((d) => new Date(d.session.scheduled_at).getTime() < mountedAt);

  const renderSession = (detail: SessionDetail, isPast: boolean) => {
    const { session, members } = detail;
    const joined = members.some((m) => m.id === userId);
    const isHost = session.host_id === userId;
    return (
      <div key={session.id} className={s.card}>
        <div className={s.cardHead}>
          <div>
            <div className={s.cardTitle}>{session.title}</div>
            <div className={s.cardMeta}>
              <span>{new Date(session.scheduled_at).toLocaleString()}</span>
              <span>· {areaList(session.areas)}</span>
              <span>· {members.length} joined</span>
              {isHost && <span className={`${s.pill} ${s.pillInfo}`}>You’re hosting</span>}
            </div>
          </div>
          {(isHost || canModerate) && (
            <button
              type="button"
              className={`${s.btnQuiet} ${s.btnDanger}`}
              onClick={() => void handleDelete(detail)}
              aria-label={`Cancel study session ${session.title}`}
            >
              Cancel
            </button>
          )}
        </div>

        {session.note && <div className={s.cardBody}>{session.note}</div>}

        {members.length > 0 && (
          <div className={s.cardMeta}>{members.map((m) => m.full_name).join(', ')}</div>
        )}

        {!isPast && (
          <button
            type="button"
            className={`${s.btn} ${joined ? s.btnGhost : ''} ${s.cardAction}`}
            onClick={() => void handleJoin(detail, joined)}
          >
            {joined ? 'Leave session' : 'Join session'}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className={s.panel}>
      <div className={s.panelHead}>
        <div>
          <h2 className={s.panelTitle}>Study sessions</h2>
          <p className={s.panelSub}>
            Arrange a time to practise together. Anyone in the class can host one, and everyone in
            the class can see and join it.
          </p>
        </div>
        <button type="button" className={s.btn} onClick={() => setOpen((v) => !v)}>
          {open ? 'Cancel' : 'New session'}
        </button>
      </div>

      {error && <div className={s.error}>{error}</div>}

      {open && (
        <form className={s.form} onSubmit={handleCreate}>
          <div className={s.field}>
            <label className={s.label} htmlFor="session-title">Title</label>
            <input
              id="session-title"
              className={s.input}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Thursday times-tables drill"
              maxLength={120}
              required
            />
          </div>

          <div className={s.field}>
            <label className={s.label} htmlFor="session-when">When</label>
            <input
              id="session-when"
              className={s.input}
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              required
            />
          </div>

          <div className={s.field}>
            <span className={s.label} id="session-skills-label">Skills to practise</span>
            <div className={s.chips} role="group" aria-labelledby="session-skills-label">
              {AREAS.map((area) => (
                <button
                  key={area}
                  type="button"
                  className={`${s.chip} ${areas.includes(area) ? s.chipOn : ''}`}
                  onClick={() => toggleArea(area)}
                  aria-pressed={areas.includes(area)}
                >
                  <span aria-hidden="true">{AREA_META[area].sym}</span>
                  {AREA_META[area].label}
                </button>
              ))}
            </div>
          </div>

          <div className={s.field}>
            <label className={s.label} htmlFor="session-note">Note (optional)</label>
            <textarea
              id="session-note"
              className={s.textarea}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
            />
          </div>

          <button type="submit" className={s.btn} disabled={busy || !title.trim() || areas.length === 0}>
            {busy ? 'Creating…' : 'Create session'}
          </button>
        </form>
      )}

      {upcoming.length === 0 && !open && (
        <div className={s.empty}>No sessions coming up. Create one and invite the class.</div>
      )}

      <div className={s.list}>{upcoming.map((d) => renderSession(d, false))}</div>

      {past.length > 0 && (
        <>
          <h3 className={s.label}>Past sessions</h3>
          <div className={s.list}>{past.map((d) => renderSession(d, true))}</div>
        </>
      )}
    </div>
  );
}

export default StudySessionsPanel;
