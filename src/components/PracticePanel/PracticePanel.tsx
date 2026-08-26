import React, { useEffect, useReducer, useRef, useCallback, useMemo } from 'react';
import type { Area, Variant, PracticeState, StudentProgress } from '../../types';
import {
  freshState,
  beginQuestion,
  check,
  nextQuestion,
  switchArea,
  sanitizeInput,
  methodTip,
  formatElapsed,
  type ProgressSeed,
} from '../../engine/practiceEngine';
import {
  skillProgress,
  targetSeconds,
  rateSpeed,
  SPEED_META,
  AREAS,
} from '../../engine/skillLadder';
import { Keypad } from './Keypad';
import s from './PracticePanel.module.css';

const AREA_META: Record<Area, { label: string; short: string; sym: string }> = {
  add: { label: 'Addition', short: 'Add', sym: '+' },
  sub: { label: 'Subtraction', short: 'Sub', sym: '−' },
  mul: { label: 'Multiplication', short: 'Mul', sym: '×' },
  div: { label: 'Division', short: 'Div', sym: '÷' },
};

type Action =
  | { type: 'SET_AREA'; area: Area }
  | { type: 'BEGIN' }
  | { type: 'SET_INPUT'; value: string }
  | { type: 'CHECK' }
  | { type: 'NEXT' }
  | { type: 'TICK' };

function reducer(state: PracticeState, action: Action): PracticeState {
  switch (action.type) {
    case 'SET_AREA':
      // Re-tapping the skill you are already on shouldn't throw the question
      // away — but if it is still waiting, there is nothing to preserve.
      if (action.area === state.area && state.status === 'idle' && state.startedAt !== null) {
        return state;
      }
      return switchArea(state, action.area);
    case 'BEGIN':
      return beginQuestion(state);
    case 'SET_INPUT':
      if (state.status !== 'idle' || state.startedAt === null) return state;
      return { ...state, input: sanitizeInput(action.value) };
    case 'CHECK':
      return check(state, state.input).state;
    case 'NEXT':
      return nextQuestion(state);
    case 'TICK':
      // The clock is display only — scoring reads the real timestamp at check
      // time, so a throttled background tab can't inflate or deflate a reward.
      if (state.status !== 'idle' || state.startedAt === null) return state;
      return { ...state, elapsedMs: Date.now() - state.startedAt };
    default:
      return state;
  }
}

export type ProgressSnapshot = StudentProgress;

interface PracticePanelProps {
  variant: Variant;
  initialArea?: Area;
  initialSeed?: ProgressSeed;
  /** Fired after every scoring change so a parent can persist / mirror progress. */
  onProgress?: (snapshot: ProgressSnapshot) => void;
}

const TICK_MS = 100;

export function PracticePanel({
  variant,
  initialArea = 'add',
  initialSeed,
  onProgress,
}: PracticePanelProps) {
  const [state, dispatch] = useReducer(reducer, undefined, () => freshState(initialArea, initialSeed));

  const inputRef = useRef<HTMLInputElement>(null);
  const liveRef = useRef<HTMLDivElement>(null);

  const ladder = useMemo(() => skillProgress(state.skillXp[state.area]), [state.skillXp, state.area]);
  const targetMs = useMemo(
    () => targetSeconds(state.area, ladder.level) * 1000,
    [state.area, ladder.level]
  );

  // Running clock while the question is open. Nothing ticks while it waits.
  useEffect(() => {
    if (state.status !== 'idle' || state.startedAt === null) return;
    const id = setInterval(() => dispatch({ type: 'TICK' }), TICK_MS);
    return () => clearInterval(id);
  }, [state.status, state.startedAt]);

  useEffect(() => {
    if (state.status === 'idle' && state.startedAt !== null) inputRef.current?.focus();
  }, [state.status, state.startedAt, state.a, state.b]);

  // Announce the outcome to screen readers.
  useEffect(() => {
    if (!liveRef.current) return;
    if (state.status === 'correct' && state.lastSolve) {
      const { xp, speed, levelUp } = state.lastSolve;
      liveRef.current.textContent =
        `Correct. ${SPEED_META[speed].label}, plus ${xp} XP. Streak ${state.streak}.` +
        (levelUp ? ` ${AREA_META[state.area].label} reached level ${levelUp}.` : '');
    } else if (state.status === 'wrong') {
      liveRef.current.textContent = `Not quite. The answer is ${state.answer}. ${methodTip(state)}`;
    }
  }, [state.status]);

  // Keep the callback in a ref so an inline parent function doesn't retrigger
  // the effect — this must fire only when the scored values actually change.
  const onProgressRef = useRef(onProgress);
  useEffect(() => { onProgressRef.current = onProgress; });
  useEffect(() => {
    onProgressRef.current?.({
      xp: state.xp,
      streak: state.streak,
      solved: state.solved,
      counts: state.counts,
      skillXp: state.skillXp,
      bestStreak: state.bestStreak,
      lightningSolves: state.lightningSolves,
    });
  }, [
    state.xp,
    state.streak,
    state.solved,
    state.counts,
    state.skillXp,
    state.bestStreak,
    state.lightningSolves,
  ]);

  const handleCheck = useCallback(() => dispatch({ type: 'CHECK' }), []);
  const handleNext = useCallback(() => dispatch({ type: 'NEXT' }), []);
  const handleBegin = useCallback(() => dispatch({ type: 'BEGIN' }), []);
  const setArea = useCallback((area: Area) => dispatch({ type: 'SET_AREA', area }), []);
  const setInput = useCallback((value: string) => dispatch({ type: 'SET_INPUT', value }), []);
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (state.status === 'idle') handleCheck();
      else handleNext();
    },
    [state.status, handleCheck, handleNext]
  );

  const op = AREA_META[state.area];
  const waiting = state.status === 'idle' && state.startedAt === null;
  const isIdle = state.status === 'idle' && state.startedAt !== null;
  const isCorrect = state.status === 'correct';
  const isWrong = state.status === 'wrong';
  /* Not just while the question is open: the clock freezes at the solve time,
     and a dial that flipped back from amber to violet the moment a slow answer
     landed would be congratulating it. */
  const overTime = !waiting && state.elapsedMs > targetMs;

  const targetSecs = Math.round(targetMs / 1000);
  /* The dial fills as the target is spent, and stops at full rather than
     wrapping round a second time. */
  const ringPct = waiting ? 0 : Math.min(100, (state.elapsedMs / targetMs) * 100);
  /* The multiplier the student would earn if they answered now, so the reward
     visibly slips away rather than being explained afterwards. */
  const liveSpeed = rateSpeed(state.elapsedMs, targetMs);
  const liveMeta = SPEED_META[liveSpeed];

  return (
    <div className={`${s.panel} ${variant === 'focus' ? s.panelFocus : s.panelStudio}`}>
      <div className={s.glow} aria-hidden="true" />
      <div role="status" aria-live="polite" className={s.srOnly} ref={liveRef} />

      <nav className={s.areaTabs} aria-label="Practice area">
        {AREAS.map((area) => {
          const level = skillProgress(state.skillXp[area]).level;
          const active = area === state.area;
          return (
            <button
              key={area}
              type="button"
              className={`${s.areaTab} ${active ? s.areaTabActive : ''}`}
              onClick={() => setArea(area)}
              aria-pressed={active}
            >
              <span className={s.areaTabLabel}>{AREA_META[area].label}</span>
              <span className={s.areaTabSym} aria-hidden="true">{AREA_META[area].sym}</span>
              <span className={s.areaTabLevel}>LV {level}</span>
            </button>
          );
        })}
      </nav>

      <div className={s.stageRow}>
        <div className={s.stageMain}>
          {waiting ? (
            /* The operands stay hidden until the clock starts. Showing them first
               would let a student work the answer out untimed and then submit it in
               a fraction of a second, which the speed multiplier would pay double
               for. */
            <>
              <div className={s.problemMasked} aria-hidden="true">
                ? {op.sym} ?
              </div>
              <button type="button" className={s.stageBtn} onClick={handleBegin} autoFocus>
                Show the question
              </button>
              <div className={s.hint}>
                The clock starts when the question appears — take your time getting here.
              </div>
            </>
          ) : (
            <>
              <div
                className={s.problem}
                aria-label={`${state.a} ${op.label.toLowerCase()} ${state.b}`}
              >
                {state.a} {op.sym} {state.b}
              </div>

              <div className={s.answerRow}>
                <span className={s.equals} aria-hidden="true">=</span>
                <input
                  ref={inputRef}
                  type="text"
                  inputMode="numeric"
                  value={state.input}
                  placeholder="?"
                  className={`${s.input} ${isCorrect ? s.inputCorrect : ''} ${isWrong ? s.inputWrong : ''}`}
                  readOnly={!isIdle}
                  aria-label="Your answer"
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
                {isIdle && (
                  <button
                    type="button"
                    className={s.checkBtn}
                    onClick={handleCheck}
                    disabled={!state.input}
                  >
                    Check answer
                  </button>
                )}
              </div>

              {isIdle && (
                <div className={s.hint}>Faster answers earn more XP — press Enter to submit</div>
              )}
            </>
          )}
        </div>

        {/* The clock, as a dial rather than a number: how much of the target is
            spent reads at a glance, and the multiplier under it is what that
            spending costs. */}
        <div className={s.dialWrap}>
          <div
            className={`${s.dial} ${overTime ? s.dialOver : ''}`}
            style={{ '--ring': `${ringPct}%` } as React.CSSProperties}
            role="timer"
            aria-label={
              waiting
                ? 'The clock has not started'
                : `Time on this question: ${formatElapsed(state.elapsedMs)} of ${targetSecs} seconds`
            }
          >
            <div className={s.dialFace}>
              <span className={s.dialValue}>
                {waiting ? '—' : formatElapsed(state.elapsedMs)}
              </span>
              <span className={s.dialTarget}>OF {targetSecs}S</span>
            </div>
          </div>
          <span className={`${s.speedBand} ${overTime ? s.speedBandOver : ''}`}>
            {waiting
              ? 'NOT STARTED'
              : `${liveMeta.label.toUpperCase()} PACE · ${liveMeta.multiplier}×`}
          </span>
        </div>
      </div>

      {/* On a phone the hardware keyboard is a soft one that covers half the
          screen; these keys write into the same state, and typing still works. */}
      {isIdle && (
        <Keypad
          value={state.input}
          onChange={setInput}
          onSubmit={handleCheck}
          className={s.keypad}
        />
      )}

      {(isCorrect || isWrong) && (
        <div className={s.result}>
          {isCorrect && state.lastSolve && (
            <div className={s.correctPanel} role="region" aria-label="Result">
              {state.lastSolve.levelUp && (
                <div className={s.levelUp}>
                  {op.label} is now Level {state.lastSolve.levelUp}
                </div>
              )}
              <div className={s.correctHead}>
                <span className={s.correctMark}>Correct</span>
                <span className={s.xpGain}>+{state.lastSolve.xp} XP</span>
              </div>
              <div className={s.xpBreakdown}>
                <span className={s.speedTag} data-speed={state.lastSolve.speed}>
                  {SPEED_META[state.lastSolve.speed].label} · {formatElapsed(state.lastSolve.elapsedMs)}
                </span>
                <span className={s.xpMath}>
                  {state.lastSolve.base} base × {state.lastSolve.speedMultiplier} speed
                  {state.lastSolve.streakMultiplier > 1 &&
                    ` × ${state.lastSolve.streakMultiplier.toFixed(2)} streak`}
                </span>
              </div>
              <button type="button" className={s.stageBtn} onClick={handleNext} autoFocus>
                Next →
              </button>
            </div>
          )}

          {isWrong && (
            <div className={s.wrongPanel} role="region" aria-label="Result">
              <div className={s.wrongLine}>
                Correct answer is <span className={s.wrongValue}>{state.answer}</span>
              </div>
              <div className={s.methodBox}>
                <span className={s.methodLabel}>Method · </span>
                {methodTip(state)}
              </div>
              <button type="button" className={s.stageBtn} onClick={handleNext} autoFocus>
                Next question →
              </button>
            </div>
          )}
        </div>
      )}

      <footer className={s.footer}>
        <div className={s.ladder}>
          <div className={s.ladderHead}>
            <span className={s.ladderLevel}>{op.label} · Level {ladder.level}</span>
            <span className={s.ladderHint}>{ladder.toNext} XP to Lv {ladder.level + 1}</span>
          </div>
          <div className={s.ladderTrack}>
            <div
              className={s.ladderFill}
              style={{ width: `${ladder.pct}%` }}
              role="progressbar"
              aria-valuenow={Math.round(ladder.pct)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${op.label} level ${ladder.level} progress`}
            />
          </div>
        </div>
        <span className={s.solved}>{state.solved} solved this session</span>
        <span className={s.streak}>Streak {state.streak}</span>
      </footer>
    </div>
  );
}

export default PracticePanel;
