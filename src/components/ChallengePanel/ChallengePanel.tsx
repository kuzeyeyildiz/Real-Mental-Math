import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  CHALLENGE_DURATION_MS,
  advanceChallenge,
  finishChallenge,
  levelsFromSkillXp,
  startChallenge,
  submitChallengeAnswer,
  summariseChallenge,
  type ChallengeLevels,
  type ChallengeState,
} from '../../engine/challengeEngine';
import { sanitizeInput } from '../../engine/practiceEngine';
import { AREAS, SPEED_META } from '../../engine/skillLadder';
import { AREA_META } from '../../data/areaMeta';
import { newlyEarned, type BadgeDef, type BadgeStats } from '../../engine/badges';
import { applyChallengeXp, awardBadges, saveChallengeRun } from '../../lib/gamificationApi';
import type { ProgressRow } from '../../lib/api';
import p from '../panels/panels.module.css';
import s from './ChallengePanel.module.css';

type Phase = 'intro' | 'running' | 'done';

type Action =
  | { type: 'START'; levels: ChallengeLevels }
  | { type: 'INPUT'; value: string }
  | { type: 'SUBMIT' }
  | { type: 'NEXT'; levels: ChallengeLevels }
  | { type: 'EXPIRE' }
  | { type: 'RESET' };

interface RunState {
  phase: Phase;
  run: ChallengeState | null;
}

function reducer(state: RunState, action: Action): RunState {
  switch (action.type) {
    case 'START':
      return { phase: 'running', run: startChallenge(action.levels) };
    case 'INPUT':
      if (!state.run || state.run.status !== 'idle') return state;
      return { ...state, run: { ...state.run, input: sanitizeInput(action.value) } };
    case 'SUBMIT': {
      if (!state.run) return state;
      return { ...state, run: submitChallengeAnswer(state.run, state.run.input).state };
    }
    case 'NEXT': {
      if (!state.run) return state;
      const next = advanceChallenge(state.run, action.levels);
      return { phase: next.finished ? 'done' : 'running', run: next };
    }
    case 'EXPIRE': {
      if (!state.run || state.run.finished) return state;
      return { phase: 'done', run: finishChallenge(state.run) };
    }
    case 'RESET':
      return { phase: 'intro', run: null };
    default:
      return state;
  }
}

/** How long a correct/incorrect verdict stays up before the next question. */
const VERDICT_MS = 900;
const TICK_MS = 100;
const LOW_TIME_MS = 15_000;

interface ChallengePanelProps {
  studentId: string;
  progress: ProgressRow;
  badgeStats: BadgeStats;
  earnedBadgeIds: string[];
  /** Applies the run's XP to the student's ladders and persists it. */
  onProgress: (next: ProgressRow) => void;
  /**
   * Lets the parent fold newly earned badges into its own state. `silent` asks
   * it not to run its own celebration: the result screen below already gives
   * these badges a panel of their own, and a toast over the top of it would be
   * the same news twice.
   */
  onBadgesEarned: (badgeIds: string[], opts?: { silent?: boolean }) => void;
}

export function ChallengePanel({
  studentId,
  progress,
  badgeStats,
  earnedBadgeIds,
  onProgress,
  onBadgesEarned,
}: ChallengePanelProps) {
  const [state, dispatch] = useReducer(reducer, { phase: 'intro', run: null });
  const [now, setNow] = useState(() => Date.now());
  const [fresh, setFresh] = useState<BadgeDef[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const liveRef = useRef<HTMLDivElement>(null);
  const savedRunId = useRef<number | null>(null);

  const levels = useMemo(() => levelsFromSkillXp(progress.skillXp), [progress.skillXp]);

  // The run's own clock. Scoring reads real timestamps, so a throttled tab
  // changes what the student sees but never what they are paid.
  useEffect(() => {
    if (state.phase !== 'running') return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [state.phase]);

  const run = state.run;
  const remaining = run ? Math.max(0, run.endsAt - now) : CHALLENGE_DURATION_MS;

  useEffect(() => {
    if (state.phase === 'running' && remaining <= 0) dispatch({ type: 'EXPIRE' });
  }, [state.phase, remaining]);

  // Auto-advance after a verdict so the run keeps its rhythm without the
  // student having to press anything between questions.
  useEffect(() => {
    if (!run || run.status === 'idle' || run.finished) return;
    const id = setTimeout(() => dispatch({ type: 'NEXT', levels }), VERDICT_MS);
    return () => clearTimeout(id);
  }, [run, levels]);

  useEffect(() => {
    if (state.phase === 'running' && run?.status === 'idle') inputRef.current?.focus();
  }, [state.phase, run?.status, run?.question.key]);

  useEffect(() => {
    if (!liveRef.current || !run) return;
    if (run.status === 'correct' && run.lastGain) {
      liveRef.current.textContent = `Correct, plus ${run.lastGain.points} points. Combo ${run.combo}.`;
    } else if (run.status === 'wrong') {
      liveRef.current.textContent = `Not quite. The answer was ${run.question.answer}.`;
    }
  }, [run]);

  const summary = useMemo(() => (run ? summariseChallenge(run) : null), [run]);

  // Bank the finished run exactly once: XP onto the ladders, the run into its
  // history, and any badges it just unlocked.
  useEffect(() => {
    if (state.phase !== 'done' || !run || !summary) return;
    if (savedRunId.current === run.startedAt) return;
    savedRunId.current = run.startedAt;

    const updated = applyChallengeXp(progress, summary);
    onProgress(updated);

    const statsAfter: BadgeStats = {
      ...badgeStats,
      solved: updated.solved,
      xp: updated.xp,
      skillXp: updated.skillXp,
      bestStreak: updated.bestStreak,
      lightningSolves: updated.lightningSolves,
      challengeRuns: badgeStats.challengeRuns + 1,
      challengeBestScore: Math.max(badgeStats.challengeBestScore, summary.score),
      challengeBestCombo: Math.max(badgeStats.challengeBestCombo, summary.bestCombo),
    };
    const earned = newlyEarned(statsAfter, earnedBadgeIds);
    setFresh(earned);

    void (async () => {
      const runWrite = await saveChallengeRun(studentId, summary, CHALLENGE_DURATION_MS);
      const badgeWrite =
        earned.length > 0
          ? await awardBadges(studentId, earned.map((b) => b.id))
          : { error: null };
      setSaveError(runWrite.error ?? badgeWrite.error);
      if (!badgeWrite.error && earned.length > 0)
        onBadgesEarned(earned.map((b) => b.id), { silent: true });
    })();
    // Only the transition into 'done' should bank a run. Re-running this when
    // the parent hands back updated progress would double-count the XP.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, run?.startedAt]);

  const handleStart = useCallback(() => {
    setFresh([]);
    setSaveError(null);
    setNow(Date.now());
    dispatch({ type: 'START', levels });
  }, [levels]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    dispatch({ type: 'SUBMIT' });
  }, []);

  // ── Intro ─────────────────────────────────────────────────────────────────
  if (state.phase === 'intro' || !run) {
    return (
      <div className={s.wrap}>
        <div className={s.intro}>
          <h2 className={s.introTitle}>Mixed Challenge</h2>
          <p className={s.introBody}>
            Ninety seconds, all four skills, one after another. Keep a combo going and the
            questions start combining operations — and paying more.
          </p>
          <div className={s.rules}>
            <div className={s.rule}>
              <span className={s.ruleTitle}>90 seconds</span>
              <span className={s.ruleBody}>
                The clock never stops. A wrong answer costs you the combo, not the run.
              </span>
            </div>
            <div className={s.rule}>
              <span className={s.ruleTitle}>Combos raise the stakes</span>
              <span className={s.ruleBody}>
                Every 4 in a row pulls harder questions toward you, up to four rungs above
                your level.
              </span>
            </div>
            <div className={s.rule}>
              <span className={s.ruleTitle}>Skills combine</span>
              <span className={s.ruleBody}>
                At a combo of 3, two operations start arriving together:{' '}
                <span className={s.sample}>(14 + 6) × 7</span>
              </span>
            </div>
            <div className={s.rule}>
              <span className={s.ruleTitle}>It all counts</span>
              <span className={s.ruleBody}>
                Your score becomes XP, split across the skills you actually used.
              </span>
            </div>
          </div>
          <div className={s.actions}>
            <button type="button" className={p.btn} onClick={handleStart}>
              Start challenge
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Result ────────────────────────────────────────────────────────────────
  if (state.phase === 'done' && summary) {
    const maxSplit = Math.max(1, ...AREAS.map((a) => summary.xpSplit[a]));
    const isBest = summary.score > 0 && summary.score >= badgeStats.challengeBestScore;
    return (
      <div className={s.wrap}>
        <div className={s.result}>
          {isBest && <div className={s.personalBest}>New personal best</div>}
          <div>
            <div className={s.finalScore}>{summary.score}</div>
            <div className={s.finalLabel}>Final score</div>
          </div>

          <div className={s.resultStats}>
            <div className={s.resultStat}>
              <span className={s.hudValue}>
                {summary.correct}/{summary.answered}
              </span>
              <span className={s.hudLabel}>Correct</span>
            </div>
            <div className={s.resultStat}>
              <span className={s.hudValue}>{summary.accuracy}%</span>
              <span className={s.hudLabel}>Accuracy</span>
            </div>
            <div className={s.resultStat}>
              <span className={s.hudValue}>{summary.bestCombo}</span>
              <span className={s.hudLabel}>Best combo</span>
            </div>
          </div>

          {summary.xpTotal > 0 ? (
            <div className={s.xpSplit}>
              <div className={s.xpSplitHead}>+{summary.xpTotal} XP across the skills you used</div>
              {AREAS.filter((a) => summary.xpSplit[a] > 0).map((area) => (
                <div key={area} className={s.xpRow}>
                  <span className={s.xpArea}>{AREA_META[area].label}</span>
                  <span className={s.xpTrack}>
                    <span
                      className={s.xpFill}
                      style={{
                        width: `${(summary.xpSplit[area] / maxSplit) * 100}%`,
                        background: AREA_META[area].color,
                      }}
                    />
                  </span>
                  <span className={s.xpValue}>+{summary.xpSplit[area]}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className={s.introBody}>
              No points this time. The clock is unforgiving — go again.
            </p>
          )}

          {fresh.length > 0 && (
            <div className={s.badgeBurst}>
              <span className={s.badgeBurstTitle}>
                {fresh.length === 1 ? 'Badge unlocked' : `${fresh.length} badges unlocked`}
              </span>
              {fresh.map((badge, i) => (
                <div
                  key={badge.id}
                  className={s.badgeBurstRow}
                  /* Dealt out one after another rather than landing as a block —
                     a haul of four is worth counting. */
                  style={{ '--delay': `${i * 160}ms` } as React.CSSProperties}
                >
                  <span className={s.badgeBurstIcon} aria-hidden="true">
                    {badge.icon}
                  </span>
                  <span>
                    <span className={s.badgeBurstName}>{badge.name}</span>
                    <br />
                    <span className={s.badgeBurstDesc}>{badge.description}</span>
                  </span>
                </div>
              ))}
            </div>
          )}

          {saveError && (
            <p className={s.saveNote} role="alert">
              This run wasn’t saved: {saveError}
            </p>
          )}

          <div className={s.actions}>
            <button type="button" className={p.btn} onClick={handleStart}>
              Play again
            </button>
            <button
              type="button"
              className={`${p.btn} ${p.btnGhost}`}
              onClick={() => dispatch({ type: 'RESET' })}
            >
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Live run ──────────────────────────────────────────────────────────────
  const seconds = Math.ceil(remaining / 1000);
  const low = remaining <= LOW_TIME_MS;
  const pct = (remaining / CHALLENGE_DURATION_MS) * 100;
  const isIdle = run.status === 'idle';
  const combined = run.question.areas.length > 1;

  return (
    <div className={s.wrap}>
      <div role="status" aria-live="polite" className={p.srOnly} ref={liveRef} />

      {/* One dark card, same stage as practice: clock, score and question are a
          single instrument rather than three stacked panels. */}
      <div className={s.stageCard}>
        <div className={s.glow} aria-hidden="true" />

        <div className={s.hud}>
          <span
            className={`${s.clock} ${low ? s.clockLow : ''}`}
            aria-label={`${seconds} seconds left`}
          >
            {seconds}
            <span className={s.clockUnit}>seconds left</span>
          </span>
          <div className={s.hudStats}>
            <span className={s.hudStat}>
              <span className={s.hudValue}>{run.score}</span>
              <span className={s.hudLabel}>Score</span>
            </span>
            <span className={`${s.hudStat} ${s.hudStatCombo}`}>
              <span className={`${s.hudValue} ${run.combo >= 8 ? s.comboHot : s.combo}`}>
                ×{run.combo}
              </span>
              <span className={s.hudLabel}>Combo</span>
            </span>
          </div>
        </div>

        <div className={s.timeTrack}>
          <div
            className={`${s.timeFill} ${low ? s.timeFillLow : ''}`}
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuenow={seconds}
            aria-valuemin={0}
            aria-valuemax={CHALLENGE_DURATION_MS / 1000}
            aria-label="Time remaining"
          />
        </div>

        <div className={s.stage}>
          {combined && <span className={s.combined}>Two steps</span>}
          <div className={s.prompt}>{run.question.prompt}</div>
          <div className={s.inputRow}>
            <span className={s.equals} aria-hidden="true">
              =
            </span>
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              value={run.input}
              placeholder="?"
              className={`${s.input} ${run.status === 'correct' ? s.inputCorrect : ''} ${
                run.status === 'wrong' ? s.inputWrong : ''
              }`}
              readOnly={!isIdle}
              aria-label="Your answer"
              onChange={(e) => dispatch({ type: 'INPUT', value: e.target.value })}
              onKeyDown={handleKeyDown}
            />
          </div>

          <div className={s.verdict}>
            {run.status === 'correct' && run.lastGain && (
              <>
                <span className={s.gain}>+{run.lastGain.points}</span>
                <span className={s.verdictMeta}>
                  {SPEED_META[run.lastGain.speed].label}
                  {run.lastGain.combinedBonus > 1 && ' · two steps'}
                  {run.combo > 1 && ` · ×${run.combo} combo`}
                </span>
              </>
            )}
            {run.status === 'wrong' && (
              <>
                <span className={s.miss}>Not quite</span>
                <span className={s.verdictMeta}>The answer was {run.question.answer}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {isIdle && <p className={s.hint}>Press Enter to answer — speed is most of the score</p>}
    </div>
  );
}

export default ChallengePanel;
