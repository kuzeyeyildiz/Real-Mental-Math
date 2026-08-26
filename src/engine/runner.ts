import type {
  Area,
  Assignment,
  AssignmentQuestion,
  SkillXp,
  SolveOutcome,
  Status,
  StudentProgress,
} from '../types';
import { generate, methodTip, questionKey } from './practiceEngine';
import { assignmentSequence } from './assignmentEngine';
import { mixedSequence, levelsFromSkillXp } from './challengeEngine';
import { awardXp, skillLevelFromXp, targetSeconds } from './skillLadder';

/**
 * One question shape for all three kinds of assignment.
 *
 * The runner used to reuse `PracticeState` directly, which meant every question
 * had to be an `a`, a `b` and an operator. A teacher's own question is a sentence,
 * and a mixed question is two operations in one prompt, so neither fits. This is
 * the smallest thing all three have in common: something to read, a number that
 * answers it, the skills it exercises, and the difficulty it was built at.
 */
export interface RunQuestion {
  /** Ready to render: `14 × 7`, `(14 + 6) × 7`, or whatever the teacher typed. */
  prompt: string;
  answer: number;
  /** Skills a correct answer credits. One for a single operation, two for a combined one. */
  areas: Area[];
  /** Difficulty served, which is what the time budget is measured against. */
  level: number;
  /** Worked method, where one can be derived. Teacher-written questions have none. */
  tip: string | null;
}

/** Time budget for a question: every operation in it gets its own clock. */
export function questionTargetMs(question: RunQuestion): number {
  const seconds = question.areas.reduce((sum, area) => sum + targetSeconds(area, question.level), 0);
  // Two steps read as one prompt, so the pair is quicker than solving both
  // separately — but not as quick as one alone.
  return (question.areas.length > 1 ? seconds * 0.8 : seconds) * 1000;
}

// ── Building a run ───────────────────────────────────────────────────────────

/** The level a question is built at: the pin if the teacher set one, else the ladder. */
function levelFor(skillXp: SkillXp, area: Area, override: number | null): number {
  return override ?? skillLevelFromXp(skillXp[area]);
}

const SYM: Record<Area, string> = { add: '+', sub: '−', mul: '×', div: '÷' };

/**
 * The whole run, decided up front. Re-rolling mid-assignment would change how
 * many of each skill the student actually gets, and a student who reloads must
 * not be handed a different, easier set.
 */
export function buildRun(
  assignment: Pick<Assignment, 'kind' | 'areas' | 'question_count' | 'level_override'>,
  skillXp: SkillXp,
  written: AssignmentQuestion[] = [],
  rng: () => number = Math.random
): RunQuestion[] {
  if (assignment.kind === 'custom') {
    return [...written]
      .sort((a, b) => a.position - b.position)
      .map((q) => ({
        prompt: q.prompt,
        answer: q.answer,
        areas: [q.area],
        // A teacher's question has no generated difficulty, so the clock is set
        // by where the student is — or by the pin, if the teacher set one.
        level: levelFor(skillXp, q.area, assignment.level_override),
        tip: null,
      }));
  }

  if (assignment.kind === 'mixed') {
    const levels = assignment.level_override
      ? { add: assignment.level_override, sub: assignment.level_override,
          mul: assignment.level_override, div: assignment.level_override }
      : levelsFromSkillXp(skillXp);
    return mixedSequence(levels, assignment.question_count, rng).map((q) => ({
      prompt: q.prompt,
      answer: q.answer,
      areas: q.areas,
      level: q.level,
      tip: null,
    }));
  }

  const order = assignmentSequence(assignment.areas, assignment.question_count, rng);
  const recent: string[] = [];
  return order.map((area) => {
    const level = levelFor(skillXp, area, assignment.level_override);
    const q = generate(area, level, recent);
    recent.unshift(questionKey(q));
    return {
      prompt: `${q.a} ${SYM[area]} ${q.b}`,
      answer: q.answer,
      areas: [area],
      level,
      tip: methodTip(q),
    };
  });
}

// ── Scoring ──────────────────────────────────────────────────────────────────

export interface RunState extends StudentProgress {
  questions: RunQuestion[];
  index: number;
  input: string;
  status: Status;
  /** Epoch ms when the clock started, or null while the question waits. */
  startedAt: number | null;
  elapsedMs: number;
  /** Correct answers so far — what gets handed in. */
  correct: number;
  /** XP earned inside this run alone, separate from the account total. */
  runXp: number;
  lastSolve: SolveOutcome | null;
}

export function startRun(questions: RunQuestion[], seed: StudentProgress): RunState {
  return {
    ...seed,
    questions,
    index: 0,
    input: '',
    status: 'idle',
    startedAt: null,
    elapsedMs: 0,
    correct: 0,
    runXp: 0,
    lastSolve: null,
  };
}

export function currentQuestion(state: RunState): RunQuestion | null {
  return state.questions[state.index] ?? null;
}

/**
 * Reveal the question and start its clock. Nothing is timed before this, and a
 * run with no questions in it never starts one — there would be nothing to time.
 */
export function beginRunQuestion(state: RunState, now = Date.now()): RunState {
  if (state.status !== 'idle' || state.startedAt !== null) return state;
  if (!currentQuestion(state)) return state;
  return { ...state, startedAt: now, elapsedMs: 0 };
}

export function setRunInput(state: RunState, raw: string): RunState {
  if (state.status !== 'idle' || state.startedAt === null) return state;
  return { ...state, input: raw };
}

/**
 * Score the current answer. XP goes to every skill the question exercised, split
 * evenly, so a combined question moves both ladders rather than picking one.
 */
export function checkRunAnswer(state: RunState, input: string, now = Date.now()): RunState {
  const question = currentQuestion(state);
  if (!question || state.status !== 'idle' || input === '' || state.startedAt === null) {
    return state;
  }

  const elapsedMs = Math.max(0, now - state.startedAt);
  const correct = Number.parseInt(input, 10) === question.answer;

  if (!correct) {
    return { ...state, input, status: 'wrong', elapsedMs, streak: 0, lastSolve: null };
  }

  const streak = state.streak + 1;
  // Scored against the difficulty actually served — the same rule as practice —
  // but with the combined-question budget, so two steps get two clocks.
  const primary = question.areas[0];
  const award = awardXp(primary, question.level, elapsedMs, streak);
  const targetMs = questionTargetMs(question);
  const scaled = Math.max(1, Math.round((award.xp * targetMs) / award.targetMs));

  const skillXp: SkillXp = { ...state.skillXp };
  const counts = { ...state.counts };
  const share = Math.max(1, Math.round(scaled / question.areas.length));
  const levelsBefore = question.areas.map((a) => skillLevelFromXp(skillXp[a]));
  for (const area of question.areas) {
    skillXp[area] += share;
    counts[area] += 1;
  }
  const levelUp = question.areas.reduce<number | null>((up, area, i) => {
    const after = skillLevelFromXp(skillXp[area]);
    return after > levelsBefore[i] ? Math.max(up ?? 0, after) : up;
  }, null);

  return {
    ...state,
    input,
    status: 'correct',
    elapsedMs,
    correct: state.correct + 1,
    solved: state.solved + 1,
    streak,
    bestStreak: Math.max(state.bestStreak, streak),
    lightningSolves: state.lightningSolves + (award.speed === 'lightning' ? 1 : 0),
    xp: state.xp + scaled,
    runXp: state.runXp + scaled,
    skillXp,
    counts,
    lastSolve: {
      xp: scaled,
      base: award.base,
      speed: award.speed,
      speedMultiplier: award.speedMultiplier,
      streakMultiplier: award.streakMultiplier,
      elapsedMs,
      targetMs,
      levelUp,
    },
  };
}

/** Move to the next question, timed from arrival — the student asked for it. */
export function advanceRun(state: RunState, now = Date.now()): RunState {
  if (state.index + 1 >= state.questions.length) return state;
  return {
    ...state,
    index: state.index + 1,
    input: '',
    status: 'idle',
    startedAt: now,
    elapsedMs: 0,
    lastSolve: null,
  };
}

export function isLastQuestion(state: RunState): boolean {
  return state.index >= state.questions.length - 1;
}

/** Just the account-level progress, for the caller to persist. */
export function runProgress(state: RunState): StudentProgress {
  return {
    xp: state.xp,
    streak: state.streak,
    solved: state.solved,
    counts: state.counts,
    skillXp: state.skillXp,
    bestStreak: state.bestStreak,
    lightningSolves: state.lightningSolves,
  };
}
