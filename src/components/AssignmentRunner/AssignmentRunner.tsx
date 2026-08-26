import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  advanceRun,
  beginRunQuestion,
  buildRun,
  checkRunAnswer,
  currentQuestion,
  isLastQuestion,
  questionTargetMs,
  setRunInput,
  startRun,
  type RunState,
} from '../../engine/runner';
import { sanitizeInput, formatElapsed } from '../../engine/practiceEngine';
import { accuracy } from '../../engine/assignmentEngine';
import { SPEED_META } from '../../engine/skillLadder';
import { areaList } from '../../data/areaMeta';
import { submitAssignment } from '../../lib/classroomApi';
import { VideoEmbed } from '../VideoEmbed/VideoEmbed';
import type { Assignment, AssignmentQuestion, StudentProgress } from '../../types';
import s from './AssignmentRunner.module.css';
import p from '../panels/panels.module.css';

type Action =
  | { type: 'BEGIN' }
  | { type: 'SET_INPUT'; value: string }
  | { type: 'CHECK' }
  | { type: 'NEXT' }
  | { type: 'TICK' };

function reducer(state: RunState, action: Action): RunState {
  switch (action.type) {
    case 'BEGIN':
      return beginRunQuestion(state);
    case 'SET_INPUT':
      return setRunInput(state, sanitizeInput(action.value));
    case 'CHECK':
      return checkRunAnswer(state, state.input);
    case 'NEXT':
      return advanceRun(state);
    case 'TICK':
      // Display only — scoring reads the real timestamp when the answer is
      // checked, so a throttled tab can't change the reward.
      if (state.status !== 'idle' || state.startedAt === null) return state;
      return { ...state, elapsedMs: Date.now() - state.startedAt };
    default:
      return state;
  }
}

interface AssignmentRunnerProps {
  assignment: Assignment;
  /** The teacher's own questions. Empty for generated and mixed sets. */
  written: AssignmentQuestion[];
  studentId: string;
  seed: StudentProgress;
  onProgress: (snapshot: StudentProgress) => void;
  /** Fired once the submission is written, so the list can refresh. */
  onFinished: () => void;
  onExit: () => void;
}

const TICK_MS = 100;

export function AssignmentRunner({
  assignment,
  written,
  studentId,
  seed,
  onProgress,
  onFinished,
  onExit,
}: AssignmentRunnerProps) {
  // Built once for the whole run: re-rolling mid-assignment would change how many
  // of each skill the student gets, and a reload must not hand out an easier set.
  const questions = useMemo(
    () => buildRun(assignment, seed.skillXp, written),
    // The seed's skillXp is read for the opening difficulty only; letting it into
    // the dependencies would rebuild the set after every answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assignment, written]
  );

  const [state, dispatch] = useReducer(reducer, undefined, () => startRun(questions, seed));

  const [handedIn, setHandedIn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // A lazy initializer runs once; `useRef(Date.now())` would re-read the clock
  // on every render and throw the value away.
  const [startedAt] = useState(() => Date.now());
  const inputRef = useRef<HTMLInputElement>(null);
  const liveRef = useRef<HTMLDivElement>(null);

  const { xp, streak, solved, counts, skillXp, bestStreak, lightningSolves } = state;
  const question = currentQuestion(state);
  const total = state.questions.length;
  const isLast = isLastQuestion(state);
  const answered = state.status !== 'idle';
  const waiting = !answered && state.startedAt === null;
  const finished = answered && isLast;
  const targetMs = question ? questionTargetMs(question) : 0;

  useEffect(() => {
    if (state.status !== 'idle' || state.startedAt === null) return;
    const id = setInterval(() => dispatch({ type: 'TICK' }), TICK_MS);
    return () => clearInterval(id);
  }, [state.status, state.startedAt]);

  useEffect(() => {
    if (state.status === 'idle' && state.startedAt !== null) inputRef.current?.focus();
  }, [state.status, state.startedAt, state.index]);

  useEffect(() => {
    if (!liveRef.current) return;
    if (state.status === 'correct' && state.lastSolve) {
      liveRef.current.textContent = `Correct, plus ${state.lastSolve.xp} XP. Question ${state.index + 1} of ${total}.`;
    } else if (state.status === 'wrong' && question) {
      liveRef.current.textContent = `Not quite. The answer is ${question.answer}.`;
    }
  }, [state.status, state.index, state.lastSolve, total, question]);

  // Mirror scored values outward so the run's XP is persisted like any practice.
  //
  // Every field is listed out rather than passed as `runProgress(state)`. Reading
  // the whole state here would make the effect depend on something its dependency
  // array does not mention, and the memoised closure then keeps the state it was
  // first built with — the run scores correctly on screen and saves the opening
  // values forever. Naming the fields keeps the closure and the deps in step.
  const onProgressRef = useRef(onProgress);
  useEffect(() => { onProgressRef.current = onProgress; });
  useEffect(() => {
    onProgressRef.current({
      xp,
      streak,
      solved,
      counts,
      skillXp,
      bestStreak,
      lightningSolves,
    });
  }, [xp, streak, solved, counts, skillXp, bestStreak, lightningSolves]);

  const handleHandIn = useCallback(async () => {
    setSubmitting(true);
    setSubmitError(null);
    const { error } = await submitAssignment({
      assignmentId: assignment.id,
      studentId,
      correct: state.correct,
      total,
      xpEarned: state.runXp,
      elapsedMs: Date.now() - startedAt,
    });
    setSubmitting(false);
    if (error) {
      setSubmitError(error);
      return;
    }
    setHandedIn(true);
    onFinished();
  }, [assignment.id, studentId, state.correct, state.runXp, total, startedAt, onFinished]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (waiting) dispatch({ type: 'BEGIN' });
    else if (!answered) dispatch({ type: 'CHECK' });
    else if (!isLast) dispatch({ type: 'NEXT' });
  };

  if (handedIn) {
    return (
      <div className={s.runner}>
        <div className={s.doneCard}>
          <div className={s.doneMark}>Handed in</div>
          <h2 className={s.doneTitle}>{assignment.title}</h2>
          <div className={s.doneStats}>
            <div className={s.doneStat}>
              <span className={s.doneValue}>{state.correct} / {total}</span>
              <span className={s.doneLabel}>Correct</span>
            </div>
            <div className={s.doneStat}>
              <span className={s.doneValue}>{accuracy(state.correct, total)}%</span>
              <span className={s.doneLabel}>Accuracy</span>
            </div>
            <div className={s.doneStat}>
              <span className={s.doneValue}>+{state.runXp}</span>
              <span className={s.doneLabel}>XP earned</span>
            </div>
          </div>
          <button type="button" className={p.btn} onClick={onExit}>
            Back to homework
          </button>
        </div>
      </div>
    );
  }

  // A custom assignment whose questions failed to load would otherwise render an
  // empty run the student could "hand in" for nothing.
  if (!question) {
    return (
      <div className={s.runner}>
        <div className={p.empty}>
          This assignment has no questions in it yet. Let your teacher know.
        </div>
        <button type="button" className={p.btn} onClick={onExit}>
          Back to homework
        </button>
      </div>
    );
  }

  const pct = ((state.index + (answered ? 1 : 0)) / total) * 100;

  const sourceLabel =
    assignment.kind === 'custom'
      ? 'written by your teacher'
      : assignment.kind === 'mixed'
        ? 'mixed exercises, all four skills'
        : areaList(assignment.areas);

  return (
    <div className={s.runner}>
      <div role="status" aria-live="polite" className={p.srOnly} ref={liveRef} />

      <header className={s.head}>
        <div>
          <h2 className={s.title}>{assignment.title}</h2>
          <div className={s.meta}>
            {sourceLabel} ·{' '}
            {assignment.level_override
              ? `fixed at level ${assignment.level_override}`
              : 'matched to your level'}
          </div>
        </div>
        <button type="button" className={p.btnQuiet} onClick={onExit}>
          Leave
        </button>
      </header>

      {assignment.video_url && (
        <VideoEmbed url={assignment.video_url} title={`Video for ${assignment.title}`} />
      )}
      {assignment.instructions && <div className={s.instructions}>{assignment.instructions}</div>}

      <div className={s.progressRow}>
        <span className={s.counter}>
          Question {state.index + 1} of {total}
        </span>
        <span className={s.counter}>{state.correct} correct</span>
      </div>
      <div className={s.progressTrack}>
        <div
          className={s.progressFill}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Assignment progress"
        />
      </div>

      {waiting ? (
        /* Nothing is timed until the student asks for the question — they may
           have instructions or a video to get through first. */
        <div className={s.stage}>
          <div className={s.problemMasked} aria-hidden="true">? ? ?</div>
          <div className={s.timerIdle}>Clock not started</div>
        </div>
      ) : (
        <div className={s.stage}>
          <div className={s.problem}>{question.prompt}</div>
          <div className={s.inputRow}>
            <span className={s.equals} aria-hidden="true">=</span>
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              value={state.input}
              placeholder="?"
              className={`${s.input} ${state.status === 'correct' ? s.inputCorrect : ''} ${
                state.status === 'wrong' ? s.inputWrong : ''
              }`}
              readOnly={answered}
              aria-label="Your answer"
              onChange={(e) => dispatch({ type: 'SET_INPUT', value: e.target.value })}
              onKeyDown={handleKeyDown}
            />
          </div>
          {!answered && (
            <div className={s.timer}>
              {formatElapsed(state.elapsedMs)}
              <span className={s.timerTarget}> / {Math.round(targetMs / 1000)}s</span>
            </div>
          )}
        </div>
      )}

      {waiting && (
        <button type="button" className={p.btn} onClick={() => dispatch({ type: 'BEGIN' })} autoFocus>
          {state.index === 0 ? 'Start question 1' : 'Show the question'}
        </button>
      )}

      {!answered && !waiting && (
        <button
          type="button"
          className={p.btn}
          onClick={() => dispatch({ type: 'CHECK' })}
          disabled={!state.input}
        >
          Check answer
        </button>
      )}

      {state.status === 'correct' && state.lastSolve && (
        <div className={s.result} role="region" aria-label="Result">
          <div className={s.resultHead}>
            <span className={s.correctMark}>Correct</span>
            <span className={s.xpGain}>+{state.lastSolve.xp} XP</span>
          </div>
          <div className={s.resultMeta}>
            {SPEED_META[state.lastSolve.speed].label} ·{' '}
            {formatElapsed(state.lastSolve.elapsedMs)}
          </div>
        </div>
      )}

      {state.status === 'wrong' && (
        <div className={`${s.result} ${s.resultWrong}`} role="region" aria-label="Result">
          <div className={s.resultHead}>
            Correct answer is <span className={s.wrongValue}>{question.answer}</span>
          </div>
          {question.tip && (
            <div className={s.method}>
              <span className={s.methodLabel}>Method · </span>
              {question.tip}
            </div>
          )}
        </div>
      )}

      {submitError && <div className={p.error}>{submitError}</div>}

      {answered && !finished && (
        <button type="button" className={p.btn} onClick={() => dispatch({ type: 'NEXT' })} autoFocus>
          Next question →
        </button>
      )}

      {finished && (
        <button type="button" className={p.btn} onClick={() => void handleHandIn()} disabled={submitting} autoFocus>
          {submitting ? 'Handing in…' : 'Hand in assignment'}
        </button>
      )}
    </div>
  );
}

export default AssignmentRunner;
