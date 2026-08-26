import type {
  Area,
  Question,
  PracticeState,
  CheckResult,
  Counts,
  SkillXp,
} from '../types';
import { awardXp, skillLevelFromXp } from './skillLadder';

// ── Question generation ──────────────────────────────────────────────────────

/**
 * Operand ceilings grow geometrically with the skill level, so the ladder has
 * no ceiling: level 1 is single digits, level 10 is genuinely hard, and a
 * student who keeps climbing keeps getting harder work. Multiplication grows
 * more slowly in the first operand than the second — a big number times a small
 * one stays tractable in the head far longer than two big ones.
 */
const GROWTH: Record<Area, { a: number; b: number }> = {
  add: { a: 1.3, b: 1.3 },
  sub: { a: 1.3, b: 1.3 },
  mul: { a: 1.15, b: 1.2 },
  // Division compounds twice over — the dividend is the product of both bands —
  // so it grows more slowly or the top of the ladder stops being mental at all.
  div: { a: 1.12, b: 1.1 },
};

const BASE_CEILING = 9;

/**
 * Above this level the operands stop compounding at full rate. Unchecked, a
 * level-30 multiplication is 513 × 1800, which is not mental arithmetic by any
 * definition — it is long multiplication with no paper. The ladder still climbs
 * past here, just more slowly, so the high levels a teacher can now pin stay
 * work a child can actually do in their head.
 */
const TAPER_FROM = 15;
const TAPER_RATE = 0.4;

/**
 * Levels reach this module from a database column, a jsonb blob and a teacher's
 * dropdown. A NaN or a fraction anywhere in that chain used to propagate all the
 * way into the operands and hand the student `NaN + NaN`, so every level is
 * squared up here rather than trusted.
 */
function safeLevel(level: number): number {
  if (!Number.isFinite(level)) return 1;
  return Math.max(1, Math.round(level));
}

/** Effective compounding steps for a level, after the high-end taper. */
function growthSteps(level: number): number {
  const steps = Math.max(0, safeLevel(level) - 1);
  const full = TAPER_FROM - 1;
  return steps <= full ? steps : full + (steps - full) * TAPER_RATE;
}

function ceilingFor(area: Area, level: number, side: 'a' | 'b'): number {
  const growth = GROWTH[area][side];
  return Math.max(BASE_CEILING, Math.round(BASE_CEILING * growth ** growthSteps(level)));
}

/**
 * What a level actually serves, so a teacher pinning one can see it rather than
 * guess. Addition and multiplication between them bracket the whole range.
 */
export function describeLevel(level: number): string {
  const add = ceilingFor('add', level, 'a');
  const mulA = ceilingFor('mul', level, 'a');
  const mulB = ceilingFor('mul', level, 'b');
  return `to ${add} + ${add}, ${mulA} × ${mulB}`;
}

/** Keep the low end within reach of the ceiling so a level-12 student isn't handed 3 + 4. */
function floorFor(ceiling: number): number {
  return Math.max(2, Math.round(ceiling / 4));
}

function rnd(a: number, b: number): number {
  if (b < a) return a;
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

function build(area: Area, level: number): Question {
  if (area === 'add') {
    const hi = ceilingFor('add', level, 'a');
    const lo = floorFor(hi);
    const a = rnd(lo, hi);
    const b = rnd(lo, hi);
    return { a, b, area, answer: a + b };
  }

  if (area === 'sub') {
    const hi = ceilingFor('sub', level, 'a');
    const lo = floorFor(hi);
    // Draw the minuend first, then a subtrahend strictly below it. The
    // subtrahend is held inside the same magnitude band, otherwise a level-8
    // student gets handed 47 − 2 and the ladder stops meaning anything.
    const a = rnd(Math.max(lo, 3), hi);
    const b = rnd(Math.min(lo, a - 1), a - 1);
    return { a, b, area, answer: a - b };
  }

  if (area === 'mul') {
    const aHi = ceilingFor('mul', level, 'a');
    const bHi = ceilingFor('mul', level, 'b');
    const a = rnd(floorFor(aHi), aHi);
    const b = rnd(floorFor(bHi), bHi);
    return { a, b, area, answer: a * b };
  }

  // Division is the inverse of the multiplication band: pick the factors, then
  // present the product. This keeps every quotient exact at any level.
  const qHi = ceilingFor('div', level, 'a');
  const dHi = ceilingFor('div', level, 'b');
  const quotient = rnd(floorFor(qHi), qHi);
  const divisor = rnd(Math.max(2, floorFor(dHi)), dHi);
  return { a: quotient * divisor, b: divisor, area, answer: quotient };
}

export function questionKey(q: Pick<Question, 'area' | 'a' | 'b'>): string {
  return `${q.area}:${q.a}:${q.b}`;
}

/** How many recent questions to remember per area before repeats are allowed again. */
export const RECENT_LIMIT = 24;
const MAX_ATTEMPTS = 40;

/**
 * Generate a question the student has not just seen. At level 1 the pool is
 * small enough that a repeat is eventually unavoidable, so this gives up after
 * a bounded number of attempts rather than looping forever.
 */
export function generate(area: Area, level = 1, recent: string[] = []): Question {
  const seen = new Set(recent);
  let fallback: Question | null = null;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const q = build(area, level);
    if (!seen.has(questionKey(q))) return q;
    fallback ??= q;
  }
  return fallback ?? build(area, level);
}

export function rememberQuestion(recent: string[], q: Question): string[] {
  return [questionKey(q), ...recent.filter((k) => k !== questionKey(q))].slice(0, RECENT_LIMIT);
}

// ── Method tips ──────────────────────────────────────────────────────────────

/** Split a number into its place-value parts: 3406 → [3000, 400, 6]. */
function placeParts(n: number): number[] {
  const parts: number[] = [];
  let place = 1;
  let rest = Math.abs(n);
  while (rest > 0) {
    const digit = rest % 10;
    if (digit) parts.unshift(digit * place);
    rest = Math.floor(rest / 10);
    place *= 10;
  }
  return parts;
}

/**
 * Nearest round number worth compensating to, or null when n already is one.
 * Largest unit first, so 199 becomes "200 − 1" rather than "200 − 1" at the
 * tens. The correction has to stay small or the compensation is no easier than
 * the original sum.
 */
function nearRound(n: number): { round: number; diff: number } | null {
  for (const unit of [1000, 100, 10]) {
    if (n <= unit) continue;
    const rounded = Math.round(n / unit) * unit;
    const diff = rounded - n;
    if (diff !== 0 && Math.abs(diff) <= Math.max(2, unit * 0.05) && rounded > 0) {
      return { round: rounded, diff };
    }
  }
  return null;
}

/**
 * Factor pair for splitting a division into two easy steps. The smaller factor
 * must be a times-table fact — 403 = 13 × 31 is a true factorisation but no
 * help at all to a student.
 */
const MAX_TABLE_FACTOR = 12;

function factorPair(n: number): [number, number] | null {
  let best: [number, number] | null = null;
  for (let p = 2; p * p <= n; p++) {
    if (n % p) continue;
    const q = n / p;
    if (p > MAX_TABLE_FACTOR) break;
    if (!best || Math.abs(p - q) < Math.abs(best[0] - best[1])) best = [p, q];
  }
  return best;
}

function runningSum(a: number, parts: number[]): string {
  let acc = a;
  return parts.map((p) => `+ ${p} = ${(acc += p)}`).join(' ');
}

function runningDiff(a: number, parts: number[]): string {
  let acc = a;
  return parts.map((p) => `− ${p} = ${(acc -= p)}`).join(' ');
}

function addTip(a: number, b: number, answer: number): string {
  const near = nearRound(b);
  if (near) {
    const { round, diff } = near;
    const back = diff > 0 ? `take back ${diff}` : `add the extra ${-diff}`;
    return `Round ${b} to ${round}: ${a} + ${round} = ${a + round}, then ${back} → ${answer}.`;
  }
  const parts = placeParts(b);
  if (parts.length === 1) return `Straight recall: ${a} + ${b} = ${answer}.`;
  return `Add ${b} one place at a time: start at ${a}, ${runningSum(a, parts)}.`;
}

function subTip(a: number, b: number, answer: number): string {
  const near = nearRound(b);
  // Rounding the subtrahend *up* past the minuend produces a negative middle
  // step: 69 − 68 became "round 68 to 70: 69 − 70 = -1, then add back 2". Every
  // question this app generates has a non-negative answer on purpose, so a
  // method that walks through minus one is not one to teach a nine-year-old.
  if (near && a - near.round >= 0) {
    const { round, diff } = near;
    const back = diff > 0 ? `add back ${diff}` : `take off another ${-diff}`;
    return `Round ${b} to ${round}: ${a} − ${round} = ${a - round}, then ${back} → ${answer}.`;
  }
  // Close-together numbers are far quicker to bridge than to decompose.
  if (a - b <= Math.max(20, a * 0.15)) {
    return `They're close — count up from ${b} to ${a}. That gap is ${answer}.`;
  }
  const parts = placeParts(b);
  if (parts.length === 1) return `Straight recall: ${a} − ${b} = ${answer}.`;
  return `Take ${b} away one place at a time: start at ${a}, ${runningDiff(a, parts)}.`;
}

function mulTip(a: number, b: number, answer: number): string {
  // Decompose the smaller operand — fewer partial products to hold.
  const [big, small] = a >= b ? [a, b] : [b, a];

  // Inside the times tables there is nothing to decompose.
  if (big <= 12 && small <= 12) return `Times-table fact: ${a} × ${b} = ${answer}.`;

  const near = nearRound(small);
  if (near && near.round !== small) {
    const { round, diff } = near;
    const correction = big * Math.abs(diff);
    const verb = diff > 0 ? 'subtract' : 'add';
    return `Use ${round}: ${big} × ${round} = ${big * round}, then ${verb} ${big}×${Math.abs(diff)} = ${correction} → ${answer}.`;
  }

  if (small % 10 !== 0 && small % 5 === 0) {
    return `${small} is half of ${small * 2}: ${big} × ${small * 2} = ${big * small * 2}, then halve → ${answer}.`;
  }

  // Only worth halving while the result stays inside the tables — turning
  // 146 × 124 into 292 × 62 is no easier than where you started.
  if (small % 2 === 0 && small > 4 && small <= 20) {
    const half = small / 2;
    return `Halve and double: ${big} × ${small} = ${big * 2} × ${half} = ${answer}.`;
  }

  const parts = placeParts(small);
  if (parts.length === 1) return `Recall your ${small}× facts: ${big} × ${small} = ${answer}.`;
  const products = parts.map((p) => `${big}×${p} = ${big * p}`).join(', ');
  return `Split ${small} into ${parts.join(' + ')}: ${products}. Add them → ${answer}.`;
}

function divTip(a: number, b: number, answer: number): string {
  const pair = factorPair(b);
  if (pair) {
    const [p, q] = pair;
    return `Break ${b} into ${p} × ${q}: ${a} ÷ ${p} = ${a / p}, then ÷ ${q} → ${answer}.`;
  }

  // Overshoot to a round multiple and step back — far quicker than counting up
  // nine times when the quotient sits just under a ten.
  const roundUp = Math.ceil(answer / 10) * 10;
  const overshoot = roundUp - answer;
  if (overshoot > 0 && overshoot <= 3 && roundUp >= 10) {
    const over = b * roundUp;
    return `${b} × ${roundUp} = ${over}, which overshoots ${a} by ${over - a}. That's ${overshoot} group${overshoot > 1 ? 's' : ''} of ${b} too many → ${answer}.`;
  }

  // Prime divisor — chip away in whole tens, the standard partial-quotient move.
  const chunk = Math.floor(answer / 10) * 10;
  if (chunk >= 10) {
    const taken = b * chunk;
    return `${b} × ${chunk} = ${taken}, leaving ${a - taken}. Since ${b} × ${answer - chunk} = ${a - taken}, that's ${chunk} + ${answer - chunk} → ${answer}.`;
  }

  return `Count up in ${b}s: ${b}, ${b * 2}, ${b * 3}… you land on ${a} at step ${answer}.`;
}

export function methodTip(state: Pick<PracticeState, 'a' | 'b' | 'area' | 'answer'>): string {
  const { a, b, area, answer } = state;
  switch (area) {
    case 'add': return addTip(a, b, answer);
    case 'sub': return subTip(a, b, answer);
    case 'mul': return mulTip(a, b, answer);
    case 'div': return divTip(a, b, answer);
  }
}

// ── Input ────────────────────────────────────────────────────────────────────

/** Answers can reach seven digits at the top of the ladder (e.g. 899 × 1287). */
export const MAX_INPUT_LENGTH = 8;

export function sanitizeInput(raw: string): string {
  return raw.replace(/[^0-9]/g, '').slice(0, MAX_INPUT_LENGTH);
}

// ── Answer checking ──────────────────────────────────────────────────────────

export function check(state: PracticeState, input: string, now = Date.now()): CheckResult {
  // A question that has not been begun has no clock, so there is nothing to
  // score against. Unreachable through the UI — the operands are masked until
  // the student starts — but the rule belongs here rather than in a component.
  if (state.status !== 'idle' || input === '' || state.startedAt === null) {
    return { correct: false, state };
  }

  const elapsedMs = Math.max(0, now - state.startedAt);
  const guessed = parseInt(input, 10);
  const correct = guessed === state.answer;

  if (!correct) {
    return {
      correct: false,
      state: { ...state, input, status: 'wrong', streak: 0, elapsedMs, lastSolve: null },
    };
  }

  const area = state.area;
  const levelBefore = skillLevelFromXp(state.skillXp[area]);
  const streak = state.streak + 1;
  // Reward against the difficulty actually served: on a pinned assignment a
  // level-2 student answering level-8 work deserves the level-8 time budget.
  const award = awardXp(area, effectiveLevel(state, area), elapsedMs, streak);

  const skillXp: SkillXp = { ...state.skillXp, [area]: state.skillXp[area] + award.xp };
  const counts: Counts = { ...state.counts, [area]: (state.counts[area] || 0) + 1 };
  const levelAfter = skillLevelFromXp(skillXp[area]);

  return {
    correct: true,
    state: {
      ...state,
      input,
      status: 'correct',
      elapsedMs,
      xp: state.xp + award.xp,
      streak,
      solved: state.solved + 1,
      counts,
      skillXp,
      bestStreak: Math.max(state.bestStreak, streak),
      lightningSolves: state.lightningSolves + (award.speed === 'lightning' ? 1 : 0),
      lastSolve: {
        xp: award.xp,
        base: award.base,
        speed: award.speed,
        speedMultiplier: award.speedMultiplier,
        streakMultiplier: award.streakMultiplier,
        elapsedMs,
        targetMs: award.targetMs,
        levelUp: levelAfter > levelBefore ? levelAfter : null,
      },
    },
  };
}

// ── State transitions ────────────────────────────────────────────────────────

/** The level a question is built at: the pinned one if set, else this area's ladder. */
function effectiveLevel(
  state: Pick<PracticeState, 'skillXp' | 'levelOverride'>,
  area: Area
): number {
  return state.levelOverride ?? skillLevelFromXp(state.skillXp[area]);
}

/**
 * The next question in a run the student is already inside. They asked for it by
 * pressing Next, so it is timed from the moment it appears — the clock and the
 * question arrive together, which is what "next question" means.
 *
 * `area` lets an assignment drive the sequence without going through
 * `switchArea`, which is for navigation and deliberately stops the clock.
 */
export function nextQuestion(
  state: PracticeState,
  now = Date.now(),
  area: Area = state.area
): PracticeState {
  const q = generate(area, effectiveLevel(state, area), state.recent);
  return {
    ...state,
    ...q,
    input: '',
    status: 'idle',
    startedAt: now,
    elapsedMs: 0,
    recent: rememberQuestion(state.recent, q),
    lastSolve: null,
  };
}

/**
 * Changing skill is navigation, so the question that comes back is **waiting**:
 * masked, and not timed until the student begins it. Landing mid-clock on a
 * question you have not read yet is the thing this prevents.
 */
export function switchArea(state: PracticeState, area: Area, now = Date.now()): PracticeState {
  return { ...nextQuestion(state, now, area), startedAt: null };
}

/**
 * Reveal a waiting question and start its clock. This is the commit: nothing is
 * timed, and nothing can be answered, before it.
 */
export function beginQuestion(state: PracticeState, now = Date.now()): PracticeState {
  if (state.status !== 'idle' || state.startedAt !== null) return state;
  return { ...state, startedAt: now, elapsedMs: 0 };
}

const EMPTY_COUNTS: Counts = { add: 0, sub: 0, mul: 0, div: 0 };

/**
 * Seed carries the student's persisted progress only — never a question. The
 * question is always generated fresh so a reload can't re-serve the exact
 * problem the student was mid-way through.
 */
export type ProgressSeed = Partial<{
  xp: number;
  streak: number;
  solved: number;
  counts: Counts;
  skillXp: SkillXp;
  bestStreak: number;
  lightningSolves: number;
  recent: string[];
  levelOverride: number | null;
}>;

/**
 * There is no `now` parameter: a fresh state is never running, so there is no
 * clock to set. Call `beginQuestion` when the student commits.
 */
export function freshState(area: Area, seed?: ProgressSeed): PracticeState {
  const skillXp: SkillXp = seed?.skillXp ?? { ...EMPTY_COUNTS };
  const recent = seed?.recent ?? [];
  const levelOverride = seed?.levelOverride ?? null;
  const q = generate(area, effectiveLevel({ skillXp, levelOverride }, area), recent);
  return {
    ...q,
    input: '',
    status: 'idle',
    // Waiting, not running: opening a screen is not the same as agreeing to be
    // timed on the question that happens to be on it.
    startedAt: null,
    elapsedMs: 0,
    xp: seed?.xp ?? 0,
    streak: seed?.streak ?? 0,
    solved: seed?.solved ?? 0,
    counts: seed?.counts ?? { ...EMPTY_COUNTS },
    skillXp,
    // The seeded streak is the one in progress; the record is at least as high.
    bestStreak: Math.max(seed?.bestStreak ?? 0, seed?.streak ?? 0),
    lightningSolves: seed?.lightningSolves ?? 0,
    recent: rememberQuestion(recent, q),
    levelOverride,
    lastSolve: null,
  };
}

// ── Display helpers ──────────────────────────────────────────────────────────

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatElapsed(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}
