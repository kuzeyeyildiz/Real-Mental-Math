import { useEffect, useMemo, useRef, useState, useCallback, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../../components/Logo/Logo';
import { useAuth } from '../../auth/AuthProvider';
import {
  BENCHMARK_QUESTIONS,
  BENCHMARK_TIME_BUDGET_S,
  AREA_SYMBOL,
  PART_LABELS,
  MAX_BENCHMARK_SCORE,
} from '../../data/benchmarkTest';
import {
  scoreBenchmark,
  LEVEL_BANDS,
  LEVEL_LABEL,
  type BenchmarkAnswers,
} from '../../engine/benchmarkEngine';
import { getStudentClassrooms, saveBenchmark } from '../../lib/api';
import { sanitizeInput } from '../../engine/practiceEngine';
import type { Area, BenchmarkResult } from '../../types';
import s from './BenchmarkPage.module.css';

type Phase = 'intro' | 'running' | 'result';

const SKILL_COLORS: Record<Area, string> = {
  add: 'var(--color-skill-add)',
  sub: 'var(--color-skill-sub)',
  mul: 'var(--color-skill-mul)',
  div: 'var(--color-skill-div)',
};

export function BenchmarkPage() {
  const { session } = useAuth();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>('intro');
  const [index, setIndex] = useState(0);
  const [input, setInput] = useState('');
  const [timeLeft, setTimeLeft] = useState(0);
  const [result, setResult] = useState<BenchmarkResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);

  const answers = useRef<BenchmarkAnswers>({});
  const inputRef = useRef<HTMLInputElement>(null);

  // The placement is the teacher's to share. Load the flag up front so the
  // result screen never flashes a score that should have stayed hidden.
  useEffect(() => {
    let active = true;
    if (!session?.user) return;
    void (async () => {
      const res = await getStudentClassrooms(session.user.id);
      if (active && res.ok) setShowResult(res.data.some((c) => c.reveal_benchmark));
    })();
    return () => { active = false; };
  }, [session]);

  const total = BENCHMARK_QUESTIONS.length;
  const question = BENCHMARK_QUESTIONS[index];

  /**
   * The placement gate reads this row to decide whether practice is unlocked, so
   * a silent failure here would send the student straight back into the test.
   */
  const persist = useCallback(
    async (res: BenchmarkResult) => {
      if (!session?.user) {
        setSaveError('You appear to be signed out, so this result could not be saved.');
        return;
      }
      setSaving(true);
      setSaveError(null);
      const { error } = await saveBenchmark(session.user.id, res);
      setSaveError(error);
      setSaving(false);
    },
    [session]
  );

  const finishTest = useCallback(async (commitCurrent?: string) => {
    // Optionally count the answer typed for the current question (early finish).
    if (commitCurrent != null && commitCurrent !== '') {
      answers.current[BENCHMARK_QUESTIONS[index].id] = commitCurrent;
    }
    const res = scoreBenchmark(answers.current);
    setResult(res);
    setPhase('result');
    await persist(res);
  }, [persist, index]);

  const advance = useCallback(
    (recorded: string | null) => {
      answers.current[BENCHMARK_QUESTIONS[index].id] = recorded;
      if (index + 1 >= total) {
        finishTest();
        return;
      }
      setIndex((i) => i + 1);
      setInput('');
    },
    [index, total, finishTest]
  );

  // Reset and start the per-question countdown whenever the question changes.
  useEffect(() => {
    if (phase !== 'running') return;
    setTimeLeft(question.seconds);
    inputRef.current?.focus();
  }, [index, phase, question.seconds]);

  // Tick the countdown; on 0, record whatever is typed (or null) and advance.
  useEffect(() => {
    if (phase !== 'running') return;
    if (timeLeft <= 0) {
      advance(input.trim() === '' ? null : input.trim());
      return;
    }
    const id = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(id);
  }, [timeLeft, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  function startTest() {
    answers.current = {};
    setIndex(0);
    setInput('');
    setPhase('running');
  }

  function submitAnswer() {
    if (input.trim() === '') return;
    advance(input.trim());
  }

  const progressPct = useMemo(() => ((index) / total) * 100, [index, total]);
  const timerPct = question ? (timeLeft / question.seconds) * 100 : 0;
  const timerColor =
    timerPct > 50 ? 'var(--color-success)' : timerPct > 20 ? 'var(--color-amber)' : 'var(--color-error)';

  // ── Intro ──────────────────────────────────────────────────────────────────
  if (phase === 'intro') {
    return (
      <div className={s.page}>
        <div className={s.card}>
          <div className={s.introLogo}><Logo size={44} layout="stacked" showKicker /></div>
          <h1 className={s.introTitle}>Level Assessment</h1>
          <p className={s.introBody}>
            Answer as many as you can — each question is timed. Harder questions are worth more.
            Your score places you on a 130-point scale so practice adapts to your level.
          </p>
          <div className={s.introStats}>
            <div className={s.introStat}>
              <div className={s.introStatValue}>{total}</div>
              <div className={s.introStatLabel}>questions</div>
            </div>
            <div className={s.introStat}>
              <div className={s.introStatValue}>~{Math.round(BENCHMARK_TIME_BUDGET_S / 60)}</div>
              <div className={s.introStatLabel}>minutes max</div>
            </div>
            <div className={s.introStat}>
              <div className={s.introStatValue}>{MAX_BENCHMARK_SCORE}</div>
              <div className={s.introStatLabel}>point scale</div>
            </div>
          </div>
          {showResult && (
            <div className={s.bandList}>
              {LEVEL_BANDS.map((b) => (
                <div key={b.level} className={s.bandRow}>
                  <span>{b.label}</span>
                  <span className={s.bandRange}>{b.min}–{b.max}</span>
                </div>
              ))}
            </div>
          )}
          <button className={s.primaryBtn} onClick={startTest}>Start the test</button>
        </div>
      </div>
    );
  }

  // ── Running ────────────────────────────────────────────────────────────────
  if (phase === 'running' && question) {
    return (
      <div className={s.page}>
        {/* The same dark stage as practice: while the clock is running, the
            question is the only thing that should be competing for attention. */}
        <div className={s.stageCard}>
          <div className={s.runHeader}>
            <span className={s.runPart}>{PART_LABELS[question.area]}</span>
            <span className={s.runCounter}>Question {index + 1} of {total}</span>
          </div>

          <div className={s.progressTrack}>
            <div
              className={s.progressFill}
              style={{ width: `${progressPct}%` }}
              role="progressbar"
              aria-valuenow={index}
              aria-valuemin={0}
              aria-valuemax={total}
              aria-label="Questions answered"
            />
          </div>

          <div className={s.runCenter}>
            <div className={s.runProblem}>
              {question.a} {AREA_SYMBOL[question.area]} {question.b}
            </div>
            <div className={s.runInputRow}>
              <span className={s.runEquals} aria-hidden="true">=</span>
              <input
                ref={inputRef}
                className={s.runInput}
                type="text"
                inputMode="numeric"
                placeholder="?"
                value={input}
                aria-label={`Answer for ${question.a} ${PART_LABELS[question.area]} ${question.b}`}
                onChange={(e) => setInput(sanitizeInput(e.target.value))}
                onKeyDown={(e) => { if (e.key === 'Enter') submitAnswer(); }}
              />
            </div>
          </div>

          <div className={s.timerRow}>
            <div className={s.timerTrack}>
              <div className={s.timerFill} style={{ width: `${timerPct}%`, background: timerColor }} />
            </div>
            <span className={s.timerValue} style={{ color: timerColor }}>{timeLeft}s</span>
          </div>

          <div className={s.runActions}>
            <button className={s.stageBtn} onClick={submitAnswer}>
              {index + 1 >= total ? 'Submit & finish' : 'Next →'}
            </button>
            <button className={s.stageQuiet} onClick={() => finishTest(input.trim())}>
              Finish test now
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Result ─────────────────────────────────────────────────────────────────
  if (phase === 'result' && result) {
    return (
      <div className={s.page}>
        <div className={s.card}>
          <div className={s.introLogo}><Logo size={40} layout="horizontal" /></div>

          {showResult ? (
            <>
              {/* The ring carries the score, so the number and the level tag can
                  sit together and be read in one glance. */}
              <div className={s.resultHead}>
                <div
                  className={s.resultRing}
                  style={{
                    '--ring': `${Math.min(100, (result.score / MAX_BENCHMARK_SCORE) * 100)}%`,
                  } as CSSProperties}
                  role="progressbar"
                  aria-valuenow={result.score}
                  aria-valuemin={0}
                  aria-valuemax={MAX_BENCHMARK_SCORE}
                  aria-label="Benchmark score"
                >
                  <div className={s.resultRingFace}>
                    <span className={s.resultScoreValue}>{result.score}</span>
                    <span className={s.resultScoreMax}>/ {MAX_BENCHMARK_SCORE}</span>
                  </div>
                </div>
                <div className={s.resultHeadText}>
                  <div className={s.resultBadge}>{LEVEL_LABEL[result.level]}</div>
                  <div className={s.resultLevelLine}>
                    You're placed at <span className={s.resultLevelName}>{LEVEL_LABEL[result.level]}</span>. Practice will adapt to this level.
                  </div>
                </div>
              </div>

              <div className={s.breakdownGrid}>
                {(Object.keys(PART_LABELS) as Area[]).map((area) => {
                  const b = result.breakdown[area];
                  return (
                    <div key={area} className={s.breakdownRow}>
                      <div className={s.breakdownMeta}>
                        <span>{PART_LABELS[area]}</span>
                        <span className={s.breakdownCount}>{b.correct}/{b.total} · {b.points} pts</span>
                      </div>
                      <div className={s.breakdownTrack}>
                        <div className={s.breakdownFill}
                          style={{ width: `${(b.correct / b.total) * 100}%`, background: SKILL_COLORS[area] }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <div className={s.resultBadge}>Assessment complete</div>
              <p className={s.resultLevelLine}>
                Nicely done — that's everything. Your result has gone to your
                teacher, and your practice is now pitched to what you showed on
                each skill.
              </p>
              <p className={s.withheldNote}>
                You'll watch your skill levels climb as you practise. Your teacher
                can choose to share the placement score with you.
              </p>
            </>
          )}

          {saveError && (
            <div className={s.saveError} role="alert">
              <strong>Your result hasn’t been saved yet.</strong>
              <span>{saveError}</span>
              <span>Keep this page open — leaving now means retaking the assessment.</span>
            </div>
          )}

          <button
            className={s.primaryBtn}
            disabled={saving}
            onClick={() => (saveError ? void persist(result) : navigate('/'))}
          >
            {saving ? 'Saving…' : saveError ? 'Retry saving' : 'Start practicing →'}
          </button>
        </div>
      </div>
    );
  }

  return null;
}

export default BenchmarkPage;
