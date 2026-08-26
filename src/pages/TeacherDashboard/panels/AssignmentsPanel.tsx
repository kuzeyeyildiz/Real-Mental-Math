import React, { useCallback, useState } from 'react';
import {
  createAssignment,
  deleteAssignment,
  getClassroomAssignments,
  type AssignmentDetail,
  type DraftQuestion,
} from '../../../lib/classroomApi';
import { useFetched } from '../../../lib/useFetched';
import { PanelError, PanelLoading } from '../../../components/panels/PanelState';
import { VideoEmbed } from '../../../components/VideoEmbed/VideoEmbed';
import { AREA_META, areaList } from '../../../data/areaMeta';
import { AREAS } from '../../../engine/skillLadder';
import { describeLevel } from '../../../engine/practiceEngine';
import { formatDue, summariseSubmissions } from '../../../engine/assignmentEngine';
import { isEmbeddableVideo, VIDEO_HOSTS_HINT } from '../../../engine/videoEmbed';
import type { RosterEntry } from '../../../lib/api';
import type { Area, AssignmentKind } from '../../../types';
import s from '../../../components/panels/panels.module.css';
import a from './AssignmentsPanel.module.css';

interface AssignmentsPanelProps {
  classroomId: string;
  roster: RosterEntry[];
}

const DEFAULT_COUNT = 10;

/**
 * The pinnable range. The ladder itself has no ceiling, but a dropdown does, and
 * 30 is past where any student in a school will be — level 30 addition runs to
 * four figures.
 */
const MAX_PIN_LEVEL = 30;
const PIN_LEVELS = Array.from({ length: MAX_PIN_LEVEL }, (_, i) => i + 1);

const KINDS: { key: AssignmentKind; label: string; blurb: string }[] = [
  {
    key: 'generated',
    label: 'Built for me',
    blurb: 'Numo generates questions in the skills you pick, at each student’s own level.',
  },
  {
    key: 'mixed',
    label: 'Mixed exercises',
    blurb:
      'Challenge-style, mixing all four skills and working up to two-step questions like (14 + 6) × 7.',
  },
  {
    key: 'custom',
    label: 'My own questions',
    blurb: 'You write every question and its answer. Served in the order you type them.',
  },
];

/** A row in the authoring table, before it becomes a `DraftQuestion`. */
interface QuestionDraft {
  prompt: string;
  answer: string;
  area: Area;
}

const BLANK_QUESTION: QuestionDraft = { prompt: '', answer: '', area: 'add' };

/** Whole numbers only — one numeric answer pad is shared by every mode. */
function parseAnswer(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^-?\d{1,15}$/.test(trimmed)) return null;
  return Number.parseInt(trimmed, 10);
}

export function AssignmentsPanel({ classroomId, roster }: AssignmentsPanelProps) {
  const load = useCallback(() => getClassroomAssignments(classroomId), [classroomId]);
  const { state, reload } = useFetched<AssignmentDetail[]>(load, classroomId);

  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<AssignmentKind>('generated');
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [areas, setAreas] = useState<Area[]>(['add']);
  const [count, setCount] = useState(DEFAULT_COUNT);
  const [pinLevel, setPinLevel] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [targets, setTargets] = useState<string[]>([]);
  const [questions, setQuestions] = useState<QuestionDraft[]>([{ ...BLANK_QUESTION }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleArea = (area: Area) =>
    setAreas((current) =>
      current.includes(area) ? current.filter((a) => a !== area) : [...current, area]
    );

  const toggleTarget = (id: string) =>
    setTargets((current) =>
      current.includes(id) ? current.filter((t) => t !== id) : [...current, id]
    );

  const patchQuestion = (index: number, patch: Partial<QuestionDraft>) =>
    setQuestions((current) => current.map((q, i) => (i === index ? { ...q, ...patch } : q)));

  const written: DraftQuestion[] = questions.flatMap((q) => {
    const answer = parseAnswer(q.answer);
    if (!q.prompt.trim() || answer === null) return [];
    return [{ prompt: q.prompt.trim(), answer, area: q.area }];
  });

  // Generated and mixed sets need at least one skill and a count; a custom set
  // needs at least one complete question. Nothing else is required of either.
  const ready =
    Boolean(title.trim()) &&
    (kind === 'custom' ? written.length > 0 : areas.length > 0 || kind === 'mixed');

  function resetForm() {
    setKind('generated');
    setTitle('');
    setInstructions('');
    setVideoUrl('');
    setAreas(['add']);
    setCount(DEFAULT_COUNT);
    setPinLevel('');
    setDueAt('');
    setTargets([]);
    setQuestions([{ ...BLANK_QUESTION }]);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;

    // Caught here rather than after saving: a link we cannot frame would be
    // stored and then quietly render as a bare link to the class.
    if (videoUrl.trim() && !isEmbeddableVideo(videoUrl)) {
      setError(`That video link can’t be embedded. ${VIDEO_HOSTS_HINT}`);
      return;
    }
    // Half-typed rows are dropped, so say so rather than silently shortening the set.
    if (kind === 'custom' && written.length !== questions.length) {
      setError('Every question needs a prompt and a whole-number answer. Remove any blank rows.');
      return;
    }

    setBusy(true);
    setError(null);
    const { error: err } = await createAssignment({
      classroomId,
      title: title.trim(),
      instructions: instructions.trim() || null,
      videoUrl: videoUrl.trim() || null,
      kind,
      // A mixed set draws on all four skills by definition.
      areas: kind === 'mixed' ? [...AREAS] : areas,
      questionCount: kind === 'custom' ? written.length : count,
      levelOverride: pinLevel ? Number(pinLevel) : null,
      // A datetime-local value has no zone; the browser reads it as local time,
      // which is what the teacher meant when they typed it.
      dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      studentIds: targets,
      questions: written,
    });
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    resetForm();
    setOpen(false);
    void reload();
  }

  async function handleDelete(detail: AssignmentDetail) {
    setError(null);
    const { error: err } = await deleteAssignment(detail.assignment.id);
    if (err) {
      setError(err);
      return;
    }
    void reload();
  }

  if (state.status === 'loading') return <PanelLoading label="Loading assignments…" />;
  if (state.status === 'error') {
    return (
      <PanelError
        title="Couldn't load assignments"
        message={state.message}
        onRetry={() => void reload()}
      />
    );
  }


  return (
    <div className={s.panel}>
      <div className={s.panelHead}>
        <div>
          <h2 className={s.panelTitle}>Assignments</h2>
          <p className={s.panelSub}>
            Set homework for the whole class or for named students. Each one runs as a timed
            practice set and counts toward the student’s skill levels.
          </p>
        </div>
        <button type="button" className={s.btn} onClick={() => setOpen((v) => !v)}>
          {open ? 'Cancel' : 'New assignment'}
        </button>
      </div>

      {error && <div className={s.error} role="alert">{error}</div>}

      {open && (
        <form className={s.form} onSubmit={handleCreate}>
          <div className={s.field}>
            <span className={s.label} id="assignment-kind-label">Where the questions come from</span>
            {/* Cards rather than chips: this is the choice that decides what the
                rest of the form asks for, and each option's blurb is worth
                reading before picking, not after. */}
            <div className={a.kinds} role="group" aria-labelledby="assignment-kind-label">
              {KINDS.map((k) => (
                <button
                  key={k.key}
                  type="button"
                  className={`${a.kindCard} ${kind === k.key ? a.kindCardOn : ''}`}
                  onClick={() => setKind(k.key)}
                  aria-pressed={kind === k.key}
                >
                  <span className={a.kindLabel}>{k.label}</span>
                  <span className={a.kindBlurb}>{k.blurb}</span>
                </button>
              ))}
            </div>
          </div>

          <div className={s.field}>
            <label className={s.label} htmlFor="assignment-title">Title</label>
            <input
              id="assignment-title"
              className={s.input}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Times tables warm-up"
              maxLength={120}
              required
            />
          </div>

          <div className={s.field}>
            <label className={s.label} htmlFor="assignment-instructions">Instructions (optional)</label>
            <textarea
              id="assignment-instructions"
              className={s.textarea}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Anything the class should know before they start."
              maxLength={2000}
            />
          </div>

          <div className={s.field}>
            <label className={s.label} htmlFor="assignment-video">Video (optional)</label>
            <input
              id="assignment-video"
              className={s.input}
              type="url"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://…"
            />
            <span className={s.hint}>
              Shown above the instructions, and the clock does not start until the student asks for
              the first question — so there is time to watch it. {VIDEO_HOSTS_HINT}
            </span>
            {isEmbeddableVideo(videoUrl) && <VideoEmbed url={videoUrl} title="Assignment video" />}
          </div>

          {kind !== 'custom' && kind !== 'mixed' && (
            <div className={s.field}>
              <span className={s.label} id="assignment-skills-label">Skills</span>
              <div className={s.chips} role="group" aria-labelledby="assignment-skills-label">
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
              {areas.length === 0 && <span className={s.hint}>Pick at least one skill.</span>}
            </div>
          )}

          {kind === 'custom' && (
            <div className={s.field}>
              <span className={s.label} id="assignment-questions-label">Your questions</span>
              <span className={s.hint}>
                Write the question as the student should read it. Answers are whole numbers, because
                the answer pad is numeric. The skill decides which level a correct answer moves.
              </span>
              <ol className={a.questions} aria-labelledby="assignment-questions-label">
                {questions.map((q, i) => (
                  <li key={i} className={a.question}>
                    <span className={a.questionNumber}>{i + 1}</span>
                    <input
                      className={`${s.input} ${a.questionPrompt}`}
                      value={q.prompt}
                      onChange={(e) => patchQuestion(i, { prompt: e.target.value })}
                      placeholder="e.g. 148 + 96, or: three buses of 42 children — how many?"
                      maxLength={200}
                      aria-label={`Question ${i + 1}`}
                    />
                    <input
                      className={`${s.input} ${a.questionAnswer}`}
                      value={q.answer}
                      onChange={(e) => patchQuestion(i, { answer: e.target.value })}
                      placeholder="Answer"
                      inputMode="numeric"
                      aria-label={`Answer to question ${i + 1}`}
                    />
                    <select
                      className={`${s.select} ${a.questionArea}`}
                      value={q.area}
                      onChange={(e) => patchQuestion(i, { area: e.target.value as Area })}
                      aria-label={`Skill for question ${i + 1}`}
                    >
                      {AREAS.map((area) => (
                        <option key={area} value={area}>{AREA_META[area].label}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className={`${s.btnQuiet} ${s.btnDanger}`}
                      onClick={() =>
                        setQuestions((current) =>
                          current.length === 1
                            ? [{ ...BLANK_QUESTION }]
                            : current.filter((_, index) => index !== i)
                        )
                      }
                      aria-label={`Remove question ${i + 1}`}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ol>
              <button
                type="button"
                className={`${s.btn} ${s.btnGhost}`}
                onClick={() => setQuestions((current) => [...current, { ...BLANK_QUESTION }])}
                disabled={questions.length >= 100}
              >
                Add another question
              </button>
            </div>
          )}

          <div className={s.row}>
            {kind !== 'custom' && (
              <div className={s.field}>
                <label className={s.label} htmlFor="assignment-count">Questions</label>
                <input
                  id="assignment-count"
                  className={s.input}
                  type="number"
                  min={5}
                  max={100}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                />
              </div>
            )}
            <div className={s.field}>
              <label className={s.label} htmlFor="assignment-level">Difficulty</label>
              <select
                id="assignment-level"
                className={s.select}
                value={pinLevel}
                onChange={(e) => setPinLevel(e.target.value)}
              >
                <option value="">Match each student’s level</option>
                {PIN_LEVELS.map((lv) => (
                  <option key={lv} value={lv}>
                    Level {lv} · {describeLevel(lv)}
                  </option>
                ))}
              </select>
              <span className={s.hint}>
                {kind === 'custom'
                  ? 'Your questions are fixed, so this only sets the time each one is allowed.'
                  : 'Levels above 15 are extension work — the operands keep growing, but more slowly, so the arithmetic stays something to do in your head.'}
              </span>
            </div>
            <div className={s.field}>
              <label className={s.label} htmlFor="assignment-due">Due (optional)</label>
              <input
                id="assignment-due"
                className={s.input}
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
              />
            </div>
          </div>

          <div className={s.field}>
            <span className={s.label} id="assignment-who-label">Who gets it</span>
            <div className={s.chips} role="group" aria-labelledby="assignment-who-label">
              <button
                type="button"
                className={`${s.chip} ${targets.length === 0 ? s.chipOn : ''}`}
                onClick={() => setTargets([])}
                aria-pressed={targets.length === 0}
              >
                Whole class
              </button>
              {roster.map((entry) => (
                <button
                  key={entry.profile.id}
                  type="button"
                  className={`${s.chip} ${targets.includes(entry.profile.id) ? s.chipOn : ''}`}
                  onClick={() => toggleTarget(entry.profile.id)}
                  aria-pressed={targets.includes(entry.profile.id)}
                >
                  {entry.profile.full_name}
                </button>
              ))}
            </div>
            <span className={s.hint}>
              {targets.length === 0
                ? 'Everyone in this class will see it.'
                : `Only ${targets.length} selected student${targets.length === 1 ? '' : 's'} will see it.`}
            </span>
          </div>

          <button type="submit" className={s.btn} disabled={busy || !ready}>
            {busy ? 'Creating…' : 'Set assignment'}
          </button>
        </form>
      )}

      {state.data.length === 0 && !open && (
        <div className={s.empty}>
          No assignments yet. Create one and it will appear in every student’s Homework tab.
        </div>
      )}

      <div className={s.list}>
        {state.data.map((detail) => {
          const { assignment, targetIds, submissions } = detail;
          const assigned = targetIds.length > 0 ? targetIds.length : roster.length;
          const progress = summariseSubmissions(assigned, submissions);
          const kindLabel = KINDS.find((k) => k.key === assignment.kind)?.label ?? 'Built for me';
          return (
            <div key={assignment.id} className={s.card}>
              <div className={s.cardHead}>
                <div>
                  <div className={s.cardTitle}>{assignment.title}</div>
                  <div className={s.cardMeta}>
                    <span className={`${s.pill} ${s.pillInfo}`}>{kindLabel}</span>
                    <span>
                      {assignment.kind === 'custom' ? 'Written by you' : areaList(assignment.areas)}
                    </span>
                    <span>· {assignment.question_count} questions</span>
                    <span>
                      ·{' '}
                      {assignment.level_override
                        ? `Fixed at level ${assignment.level_override}`
                        : 'Adaptive difficulty'}
                    </span>
                    <span>· {formatDue(assignment.due_at)}</span>
                    <span>
                      ·{' '}
                      {targetIds.length > 0
                        ? `${targetIds.length} student${targetIds.length === 1 ? '' : 's'}`
                        : 'Whole class'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className={`${s.btnQuiet} ${s.btnDanger}`}
                  onClick={() => void handleDelete(detail)}
                  aria-label={`Delete assignment ${assignment.title}`}
                >
                  Delete
                </button>
              </div>

              {assignment.instructions && <div className={s.cardBody}>{assignment.instructions}</div>}
              {assignment.video_url && (
                <VideoEmbed url={assignment.video_url} title={`Video for ${assignment.title}`} />
              )}

              <div className={s.cardMeta} style={{ marginTop: 12 }}>
                <span className={`${s.pill} ${progress.handedIn >= assigned && assigned > 0 ? s.pillOk : s.pillInfo}`}>
                  {progress.handedIn} / {assigned} handed in
                </span>
                {progress.handedIn > 0 && (
                  <span className={s.pill}>{progress.averageAccuracy}% average</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default AssignmentsPanel;
