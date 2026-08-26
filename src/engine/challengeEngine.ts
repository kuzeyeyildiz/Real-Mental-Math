import type { Area, SkillXp, SpeedRating, Status } from '../types';
import { AREAS, SPEED_META, rateSpeed, skillLevelFromXp, targetSeconds } from './skillLadder';

/**
 * The mixed challenge is a timed run across all four skills, where the harder
 * rungs stop asking one operation at a time and start combining them. Its point
 * is not measurement — the benchmark does that — but pressure: a combo that
 * pulls harder questions toward you the longer you keep it alive.
 */
export const CHALLENGE_DURATION_MS = 90_000;

/** How the two operands and operators of a question are arranged. */
export type ChallengeShape =
  | 'single'
  | 'mul-add'
  | 'mul-sub'
  | 'div-add'
  | 'div-sub'
  | 'add-mul'
  | 'sub-mul';

export interface ChallengeQuestion {
  /** Ready to render, e.g. `(14 + 6) × 7`. */
  prompt: string;
  answer: number;
  /** Every skill the question exercises: one term, or two when combined. */
  areas: Area[];
  shape: ChallengeShape;
  level: number;
  key: string;
}

export interface ChallengeGain {
  points: number;
  speed: SpeedRating;
  speedMultiplier: number;
  comboMultiplier: number;
  /** Combining two operations pays a premium over a single one. */
  combinedBonus: number;
  elapsedMs: number;
  targetMs: number;
}

export interface ChallengeState {
  question: ChallengeQuestion;
  input: string;
  status: Status;
  startedAt: number;
  endsAt: number;
  questionStartedAt: number;
  answered: number;
  correct: number;
  combo: number;
  bestCombo: number;
  score: number;
  /** Correct answers touching each skill; drives how the XP is split at the end. */
  areaHits: Record<Area, number>;
  /**
   * Correct answers inside 40% of the target. The speed badges read this too,
   * so an answer that was fast in a challenge counts the same as one that was
   * fast in practice.
   */
  lightning: number;
  recent: string[];
  lastGain: ChallengeGain | null;
  finished: boolean;
}

// ── Difficulty ───────────────────────────────────────────────────────────────

/** Combo rungs are worth this much extra level each, up to `MAX_RUNG`. */
const COMBO_PER_RUNG = 4;
const MAX_RUNG = 4;

/**
 * How far a live combo has pushed the difficulty above the student's own level.
 * Capped, so a long run gets harder but never leaves the student behind.
 */
export function comboRung(combo: number): number {
  return Math.min(MAX_RUNG, Math.floor(combo / COMBO_PER_RUNG));
}

/** Combined questions only appear once the student has a combo going. */
const COMBINE_FROM_COMBO = 3;

const COMBINED_SHAPES: ChallengeShape[] = [
  'mul-add',
  'mul-sub',
  'div-add',
  'div-sub',
  'add-mul',
  'sub-mul',
];

const SHAPE_AREAS: Record<ChallengeShape, Area[]> = {
  single: [],
  'mul-add': ['mul', 'add'],
  'mul-sub': ['mul', 'sub'],
  'div-add': ['div', 'add'],
  'div-sub': ['div', 'sub'],
  'add-mul': ['add', 'mul'],
  'sub-mul': ['sub', 'mul'],
};

/** Base levels the run is built from — the student's own ladder, per skill. */
export type ChallengeLevels = Record<Area, number>;

export function levelsFromSkillXp(skillXp: SkillXp): ChallengeLevels {
  return {
    add: skillLevelFromXp(skillXp.add),
    sub: skillLevelFromXp(skillXp.sub),
    mul: skillLevelFromXp(skillXp.mul),
    div: skillLevelFromXp(skillXp.div),
  };
}

/**
 * The level a question is built at: the average of the student's levels in the
 * skills it touches, lifted by whatever the combo has earned.
 */
function levelFor(levels: ChallengeLevels, areas: Area[], combo: number): number {
  const avg = areas.reduce((sum, a) => sum + levels[a], 0) / areas.length;
  return Math.max(1, Math.round(avg) + comboRung(combo));
}

// ── Question generation ──────────────────────────────────────────────────────

type Rng = () => number;

function rnd(rng: Rng, lo: number, hi: number): number {
  if (hi < lo) return lo;
  return Math.floor(rng() * (hi - lo + 1)) + lo;
}

function pick<T>(rng: Rng, items: T[]): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

/**
 * Operand band for a term inside a combined question. Deliberately tighter than
 * the practice ladder: `847 × 623 + 918` is arithmetic homework, not a
 * 90-second challenge, so combined terms stay in a range you can hold in mind.
 */
function band(level: number, growth: number, cap: number): { lo: number; hi: number } {
  const hi = Math.max(9, Math.min(cap, Math.round(9 * growth ** (level - 1))));
  return { lo: Math.max(2, Math.round(hi / 4)), hi };
}

function singleTerm(rng: Rng, area: Area, level: number): { a: number; b: number; value: number } {
  if (area === 'add') {
    const { lo, hi } = band(level, 1.3, 9999);
    const a = rnd(rng, lo, hi);
    const b = rnd(rng, lo, hi);
    return { a, b, value: a + b };
  }
  if (area === 'sub') {
    const { lo, hi } = band(level, 1.3, 9999);
    const a = rnd(rng, Math.max(lo, 3), hi);
    const b = rnd(rng, Math.min(lo, a - 1), a - 1);
    return { a, b, value: a - b };
  }
  if (area === 'mul') {
    const aBand = band(level, 1.15, 999);
    const bBand = band(level, 1.2, 999);
    const a = rnd(rng, aBand.lo, aBand.hi);
    const b = rnd(rng, bBand.lo, bBand.hi);
    return { a, b, value: a * b };
  }
  const qBand = band(level, 1.12, 999);
  const dBand = band(level, 1.1, 99);
  const quotient = rnd(rng, qBand.lo, qBand.hi);
  const divisor = rnd(rng, Math.max(2, dBand.lo), Math.max(2, dBand.hi));
  return { a: quotient * divisor, b: divisor, value: quotient };
}

const SYM: Record<Area, string> = { add: '+', sub: '−', mul: '×', div: '÷' };

function buildSingle(rng: Rng, area: Area, level: number): ChallengeQuestion {
  const { a, b, value } = singleTerm(rng, area, level);
  return {
    prompt: `${a} ${SYM[area]} ${b}`,
    answer: value,
    areas: [area],
    shape: 'single',
    level,
    key: `${area}:${a}:${b}`,
  };
}

/**
 * A combined question is a first operation whose result is then added to,
 * subtracted from, or multiplied by a third number. The tail term is drawn
 * small on purpose: the difficulty should come from holding two steps in mind,
 * not from the second step being hard on its own.
 */
function buildCombined(rng: Rng, shape: ChallengeShape, level: number): ChallengeQuestion {
  const [first, second] = SHAPE_AREAS[shape];
  // Each half is built a rung easier than a single-operation question at the
  // same level, because the student now has to hold two of them.
  const inner = Math.max(1, level - 1);
  const head = singleTerm(rng, first, inner);

  if (shape === 'add-mul' || shape === 'sub-mul') {
    const tail = rnd(rng, 2, Math.max(3, Math.min(12, 3 + level)));
    const prompt = `(${head.a} ${SYM[first]} ${head.b}) × ${tail}`;
    return {
      prompt,
      answer: head.value * tail,
      areas: [first, second],
      shape,
      level,
      key: `${shape}:${head.a}:${head.b}:${tail}`,
    };
  }

  const tailBand = band(Math.max(1, inner - 1), 1.25, 999);
  let tail = rnd(rng, tailBand.lo, tailBand.hi);
  if (second === 'sub') {
    // Schoolchildren, no negatives: keep the tail inside what the head produced.
    tail = Math.min(tail, Math.max(1, head.value - 1));
  }
  const prompt = `${head.a} ${SYM[first]} ${head.b} ${SYM[second]} ${tail}`;
  return {
    prompt,
    answer: second === 'add' ? head.value + tail : head.value - tail,
    areas: [first, second],
    shape,
    level,
    key: `${shape}:${head.a}:${head.b}:${tail}`,
  };
}

const MAX_ATTEMPTS = 24;
const RECENT_LIMIT = 30;

/**
 * Next question for a run. Below `COMBINE_FROM_COMBO` it stays single, then
 * combined shapes mix in — so the challenge visibly changes character as the
 * student keeps a streak alive.
 */
export function nextChallengeQuestion(
  levels: ChallengeLevels,
  combo: number,
  recent: string[] = [],
  rng: Rng = Math.random
): ChallengeQuestion {
  const combined = combo >= COMBINE_FROM_COMBO && rng() < 0.5;
  const seen = new Set(recent);
  let fallback: ChallengeQuestion | null = null;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const q = combined
      ? (() => {
          const shape = pick(rng, COMBINED_SHAPES);
          return buildCombined(rng, shape, levelFor(levels, SHAPE_AREAS[shape], combo));
        })()
      : (() => {
          const area = pick(rng, AREAS);
          return buildSingle(rng, area, levelFor(levels, [area], combo));
        })();
    if (!seen.has(q.key)) return q;
    fallback ??= q;
  }
  return fallback ?? buildSingle(rng, 'add', 1);
}

/**
 * A fixed set of challenge-style questions, for a teacher who wants the combined
 * two-step work as homework rather than as a 90-second scramble (spec 12).
 *
 * There is no combo to earn here, so the mix is decided by position instead: the
 * set opens single and works up to roughly half combined, which is the shape a
 * live run takes anyway. Difficulty comes from the student's own ladders, so the
 * same assignment meets each child where they are.
 */
export function mixedSequence(
  levels: ChallengeLevels,
  count: number,
  rng: Rng = Math.random
): ChallengeQuestion[] {
  const out: ChallengeQuestion[] = [];
  const recent: string[] = [];

  for (let i = 0; i < Math.max(0, count); i++) {
    // Ramps from all-single at the start to about half combined by the end.
    const share = count > 1 ? (i / (count - 1)) * 0.55 : 0;
    const combined = rng() < share;
    let question: ChallengeQuestion | null = null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const candidate = combined
        ? (() => {
            const shape = pick(rng, COMBINED_SHAPES);
            return buildCombined(rng, shape, levelFor(levels, SHAPE_AREAS[shape], 0));
          })()
        : (() => {
            const area = pick(rng, AREAS);
            return buildSingle(rng, area, levelFor(levels, [area], 0));
          })();
      question ??= candidate;
      if (!recent.includes(candidate.key)) {
        question = candidate;
        break;
      }
    }

    if (!question) break;
    out.push(question);
    recent.unshift(question.key);
    if (recent.length > RECENT_LIMIT) recent.pop();
  }

  return out;
}

// ── Scoring ──────────────────────────────────────────────────────────────────

const BASE_POINTS = 10;
/** A two-step question is worth half again as much as a single one. */
const COMBINED_BONUS = 1.5;

/** Grows with the combo and is capped, matching the practice streak's shape. */
export function comboMultiplier(combo: number): number {
  return 1 + Math.min(combo, 15) * 0.06;
}

/** Time budget for a question: each operation it contains gets its own clock. */
export function challengeTargetMs(question: ChallengeQuestion): number {
  const seconds = question.areas.reduce(
    (sum, area) => sum + targetSeconds(area, question.level),
    0
  );
  // Two steps read as one prompt, so the pair is quicker than solving both
  // separately — but not as quick as one alone.
  return (question.areas.length > 1 ? seconds * 0.8 : seconds) * 1000;
}

export function scoreAnswer(
  question: ChallengeQuestion,
  elapsedMs: number,
  comboAfter: number
): ChallengeGain {
  const targetMs = challengeTargetMs(question);
  const speed = rateSpeed(elapsedMs, targetMs);
  const speedMultiplier = SPEED_META[speed].multiplier;
  const combinedBonus = question.areas.length > 1 ? COMBINED_BONUS : 1;
  const comboMult = comboMultiplier(comboAfter);
  return {
    points: Math.max(1, Math.round(BASE_POINTS * speedMultiplier * comboMult * combinedBonus)),
    speed,
    speedMultiplier,
    comboMultiplier: comboMult,
    combinedBonus,
    elapsedMs,
    targetMs,
  };
}

const EMPTY_HITS: Record<Area, number> = { add: 0, sub: 0, mul: 0, div: 0 };

/**
 * The run's score becomes skill XP, split across the skills it actually
 * exercised. A run that was three-quarters multiplication moves the
 * multiplication ladder three-quarters as much — the challenge is practice that
 * counts, not a side game with its own currency.
 */
export function splitChallengeXp(score: number, areaHits: Record<Area, number>): SkillXp {
  const total = AREAS.reduce((sum, a) => sum + areaHits[a], 0);
  const split: SkillXp = { ...EMPTY_HITS };
  if (total <= 0 || score <= 0) return split;

  let handed = 0;
  for (const area of AREAS) {
    split[area] = Math.floor((score * areaHits[area]) / total);
    handed += split[area];
  }
  // Flooring loses a few points to rounding; give the remainder to the skill
  // the student answered most, rather than quietly dropping it.
  const remainder = score - handed;
  if (remainder > 0) {
    const best = AREAS.reduce((top, a) => (areaHits[a] > areaHits[top] ? a : top), AREAS[0]);
    split[best] += remainder;
  }
  return split;
}

// ── Run state ────────────────────────────────────────────────────────────────

export function startChallenge(
  levels: ChallengeLevels,
  now = Date.now(),
  rng: Rng = Math.random
): ChallengeState {
  const question = nextChallengeQuestion(levels, 0, [], rng);
  return {
    question,
    input: '',
    status: 'idle',
    startedAt: now,
    endsAt: now + CHALLENGE_DURATION_MS,
    questionStartedAt: now,
    answered: 0,
    correct: 0,
    combo: 0,
    bestCombo: 0,
    score: 0,
    areaHits: { ...EMPTY_HITS },
    lightning: 0,
    recent: [question.key],
    lastGain: null,
    finished: false,
  };
}

export interface ChallengeCheck {
  correct: boolean;
  state: ChallengeState;
}

export function submitChallengeAnswer(
  state: ChallengeState,
  input: string,
  now = Date.now()
): ChallengeCheck {
  if (state.finished || state.status !== 'idle' || input === '') {
    return { correct: false, state };
  }

  const elapsedMs = Math.max(0, now - state.questionStartedAt);
  const correct = parseInt(input, 10) === state.question.answer;

  if (!correct) {
    return {
      correct: false,
      state: { ...state, input, status: 'wrong', combo: 0, answered: state.answered + 1, lastGain: null },
    };
  }

  const combo = state.combo + 1;
  const gain = scoreAnswer(state.question, elapsedMs, combo);
  const areaHits = { ...state.areaHits };
  for (const area of state.question.areas) areaHits[area] += 1;

  return {
    correct: true,
    state: {
      ...state,
      input,
      status: 'correct',
      answered: state.answered + 1,
      correct: state.correct + 1,
      combo,
      bestCombo: Math.max(state.bestCombo, combo),
      score: state.score + gain.points,
      areaHits,
      lightning: state.lightning + (gain.speed === 'lightning' ? 1 : 0),
      lastGain: gain,
    },
  };
}

export function advanceChallenge(
  state: ChallengeState,
  levels: ChallengeLevels,
  now = Date.now(),
  rng: Rng = Math.random
): ChallengeState {
  if (now >= state.endsAt) return { ...state, finished: true, status: 'idle', input: '' };
  const question = nextChallengeQuestion(levels, state.combo, state.recent, rng);
  return {
    ...state,
    question,
    input: '',
    status: 'idle',
    questionStartedAt: now,
    recent: [question.key, ...state.recent.filter((k) => k !== question.key)].slice(0, RECENT_LIMIT),
    lastGain: null,
  };
}

export function finishChallenge(state: ChallengeState): ChallengeState {
  return { ...state, finished: true, status: 'idle', input: '' };
}

export interface ChallengeSummary {
  score: number;
  correct: number;
  answered: number;
  accuracy: number;
  bestCombo: number;
  lightning: number;
  xpSplit: SkillXp;
  xpTotal: number;
}

export function summariseChallenge(state: ChallengeState): ChallengeSummary {
  const xpSplit = splitChallengeXp(state.score, state.areaHits);
  return {
    score: state.score,
    correct: state.correct,
    answered: state.answered,
    accuracy: state.answered > 0 ? Math.round((state.correct / state.answered) * 100) : 0,
    bestCombo: state.bestCombo,
    lightning: state.lightning,
    xpSplit,
    xpTotal: AREAS.reduce((sum, a) => sum + xpSplit[a], 0),
  };
}
