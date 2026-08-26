import { describe, it, expect } from 'vitest';
import {
  generate,
  questionKey,
  rememberQuestion,
  RECENT_LIMIT,
  methodTip,
  sanitizeInput,
  MAX_INPUT_LENGTH,
  check,
  nextQuestion,
  switchArea,
  beginQuestion,
  freshState,
  describeLevel,
  formatTime,
  formatElapsed,
} from './practiceEngine';
import {
  skillXpThreshold,
  skillXpStep,
  skillLevelFromXp,
  skillProgress,
  seedSkillXp,
  awardXp,
  rateSpeed,
  targetSeconds,
  streakMultiplier,
  BASE_XP,
  MAX_SKILL_LEVEL,
  AREAS,
} from './skillLadder';
import type { Area, PracticeState } from '../types';

const evaluate = (a: number, b: number, area: Area): number => {
  switch (area) {
    case 'add': return a + b;
    case 'sub': return a - b;
    case 'mul': return a * b;
    case 'div': return a / b;
  }
};

describe('generate', () => {
  it('produces arithmetically correct questions at every level', () => {
    for (const area of AREAS) {
      for (const level of [1, 3, 5, 10, 20]) {
        for (let i = 0; i < 40; i++) {
          const q = generate(area, level);
          expect(q.area).toBe(area);
          expect(q.answer).toBe(evaluate(q.a, q.b, area));
        }
      }
    }
  });

  it('never produces a negative subtraction or a fractional division', () => {
    for (const level of [1, 2, 6, 15]) {
      for (let i = 0; i < 100; i++) {
        const sub = generate('sub', level);
        expect(sub.answer).toBeGreaterThan(0);

        const div = generate('div', level);
        expect(div.b).toBeGreaterThan(1);
        expect(Number.isInteger(div.answer)).toBe(true);
        expect(div.a % div.b).toBe(0);
      }
    }
  });

  it('starts at single digits and grows without a ceiling', () => {
    const maxOperand = (area: Area, level: number) =>
      Math.max(...Array.from({ length: 200 }, () => {
        const q = generate(area, level);
        return Math.max(q.a, q.b);
      }));

    for (const area of AREAS) {
      // Level 1 addition/subtraction stay inside single digits.
      if (area === 'add' || area === 'sub') expect(maxOperand(area, 1)).toBeLessThanOrEqual(9);
      expect(maxOperand(area, 12)).toBeGreaterThan(maxOperand(area, 4));
      expect(maxOperand(area, 25)).toBeGreaterThan(maxOperand(area, 12));
    }
  });

  it('avoids questions it was told are recent', () => {
    // Level 8 has a wide enough pool that a fresh question is always findable.
    let current: string[] = [];
    for (let i = 0; i < RECENT_LIMIT; i++) {
      const q = generate('mul', 8, current);
      expect(current).not.toContain(questionKey(q));
      current = rememberQuestion(current, q);
    }
  });

  it('terminates even when every possible question is already recent', () => {
    // Level 1 subtraction has a tiny pool; exhaust it and confirm no hang.
    let recent: string[] = [];
    for (let i = 0; i < 200; i++) {
      recent = rememberQuestion(recent, generate('sub', 1, recent));
    }
    expect(recent.length).toBe(RECENT_LIMIT);
  });
});

describe('rememberQuestion', () => {
  it('caps the history and never duplicates an entry', () => {
    let recent: string[] = [];
    for (let i = 0; i < RECENT_LIMIT + 10; i++) {
      recent = rememberQuestion(recent, { a: i, b: 1, area: 'add', answer: i + 1 });
    }
    expect(recent).toHaveLength(RECENT_LIMIT);
    expect(new Set(recent).size).toBe(RECENT_LIMIT);

    recent = rememberQuestion(recent, { a: 30, b: 1, area: 'add', answer: 31 });
    expect(recent[0]).toBe('add:30:1');
    expect(new Set(recent).size).toBe(recent.length);
  });
});

describe('skill ladder', () => {
  it('starts at level 1 and climbs monotonically', () => {
    expect(skillLevelFromXp(0)).toBe(1);
    expect(skillLevelFromXp(-5)).toBe(1);
    let last = 1;
    for (let xp = 0; xp < 20000; xp += 37) {
      const level = skillLevelFromXp(xp);
      expect(level).toBeGreaterThanOrEqual(last);
      last = level;
    }
  });

  it('agrees exactly with its own thresholds', () => {
    for (let level = 1; level <= 40; level++) {
      const threshold = skillXpThreshold(level);
      expect(skillLevelFromXp(threshold)).toBe(level);
      if (level > 1) expect(skillLevelFromXp(threshold - 1)).toBe(level - 1);
    }
  });

  it('gets progressively harder to level up', () => {
    let previousSpan = 0;
    for (let level = 2; level <= 15; level++) {
      const span = skillXpThreshold(level + 1) - skillXpThreshold(level);
      expect(span).toBeGreaterThan(previousSpan);
      previousSpan = span;
    }
  });

  it('makes the first level cost real work rather than four answers', () => {
    // The old curve opened level 2 for 60 XP — about four correct answers, which
    // made the level number close to meaningless at the bottom.
    expect(skillXpStep(1)).toBe(100);
    expect(skillXpThreshold(2)).toBe(100);
  });

  it('grows each level by a fixed proportion until the cap, then flattens', () => {
    for (let level = 1; level < 19; level++) {
      const ratio = skillXpStep(level + 1) / skillXpStep(level);
      expect(ratio).toBeCloseTo(1.16, 1);
    }
    // Uncapped geometric growth reaches thousands of XP for a single level, which
    // is a wall rather than a challenge. Past the cap every level costs the same.
    expect(skillXpStep(40)).toBe(skillXpStep(100));
    expect(skillXpStep(40)).toBe(1500);
  });

  it('never demotes a student the old polynomial curve had already promoted', () => {
    // Anyone mid-ladder when this changed keeps the level they were shown. Only
    // the first two rungs cost more than before — bands 60–99 and 209–215 XP —
    // and no stored skill total fell inside either when the curve was replaced.
    const oldThreshold = (level: number) => (level <= 1 ? 0 : Math.round(60 * (level - 1) ** 1.8));
    for (let level = 4; level <= 25; level++) {
      expect(skillXpThreshold(level)).toBeLessThanOrEqual(oldThreshold(level));
    }
  });

  it('bounds the level search so a corrupt XP value cannot spin it', () => {
    expect(skillLevelFromXp(Number.MAX_SAFE_INTEGER)).toBe(MAX_SKILL_LEVEL);
    expect(skillLevelFromXp(Number.NaN)).toBe(1);
  });

  it('reports progress within the current level', () => {
    const atLevel3 = skillXpThreshold(3);
    const p = skillProgress(atLevel3);
    expect(p.level).toBe(3);
    expect(p.into).toBe(0);
    expect(p.pct).toBe(0);
    expect(p.toNext).toBe(skillXpThreshold(4) - atLevel3);

    const mid = skillProgress(atLevel3 + Math.floor(p.span / 2));
    expect(mid.level).toBe(3);
    expect(mid.pct).toBeGreaterThan(40);
    expect(mid.pct).toBeLessThan(60);
  });

  it('seeds opening XP from a benchmark breakdown', () => {
    const perfect = seedSkillXp({
      add: { correct: 15, total: 15 },
      sub: { correct: 15, total: 15 },
      mul: { correct: 15, total: 15 },
      div: { correct: 15, total: 15 },
    });
    for (const area of AREAS) expect(skillLevelFromXp(perfect[area])).toBe(5);

    const blank = seedSkillXp(null);
    for (const area of AREAS) expect(blank[area]).toBe(0);

    const partial = seedSkillXp({
      add: { correct: 15, total: 15 },
      sub: { correct: 0, total: 15 },
      mul: { correct: 7, total: 15 },
      div: { correct: 0, total: 0 },
    });
    expect(partial.add).toBeGreaterThan(partial.mul);
    expect(partial.sub).toBe(0);
    expect(partial.div).toBe(0);
  });
});

describe('timed XP', () => {
  it('rates speed against the target for the area and level', () => {
    const target = 10_000;
    expect(rateSpeed(2_000, target)).toBe('lightning');
    expect(rateSpeed(6_000, target)).toBe('quick');
    expect(rateSpeed(9_000, target)).toBe('onTime');
    expect(rateSpeed(15_000, target)).toBe('steady');
    expect(rateSpeed(30_000, target)).toBe('slow');
  });

  it('allows more time for harder operations and higher levels', () => {
    expect(targetSeconds('div', 1)).toBeGreaterThan(targetSeconds('add', 1));
    expect(targetSeconds('add', 10)).toBeGreaterThan(targetSeconds('add', 1));
  });

  it('pays more for a faster solve', () => {
    const fast = awardXp('add', 1, 1_000, 1).xp;
    const ok = awardXp('add', 1, 5_000, 1).xp;
    const slow = awardXp('add', 1, 60_000, 1).xp;
    expect(fast).toBeGreaterThan(ok);
    expect(ok).toBeGreaterThan(slow);
    expect(slow).toBeGreaterThanOrEqual(1);
  });

  it('caps the streak bonus so a long run cannot run away', () => {
    expect(streakMultiplier(0)).toBe(1);
    expect(streakMultiplier(10)).toBeCloseTo(1.5);
    expect(streakMultiplier(500)).toBeCloseTo(1.5);
  });

  it('never awards zero for a correct answer', () => {
    for (const area of AREAS) {
      expect(awardXp(area, 1, 10 ** 7, 0).xp).toBeGreaterThan(0);
    }
  });
});

describe('sanitizeInput', () => {
  it('strips non-digits and caps length', () => {
    expect(sanitizeInput('12a3')).toBe('123');
    expect(sanitizeInput('-45')).toBe('45');
    expect(sanitizeInput('9'.repeat(20))).toHaveLength(MAX_INPUT_LENGTH);
    expect(sanitizeInput('')).toBe('');
  });

  it('accepts answers as large as the top of the ladder produces', () => {
    // Seven-digit products are reachable high on the multiplication ladder;
    // the cap must not truncate a legitimate answer.
    expect(sanitizeInput('1157013')).toBe('1157013');
  });
});

describe('check', () => {
  const base = (over: Partial<PracticeState> = {}): PracticeState => ({
    ...beginQuestion(freshState('add', {}), 0),
    a: 12,
    b: 13,
    area: 'add',
    answer: 25,
    startedAt: 0,
    ...over,
  });

  it('awards XP, streak and per-skill XP on a correct answer', () => {
    const result = check(base(), '25', 3_000);
    expect(result.correct).toBe(true);
    expect(result.state.status).toBe('correct');
    expect(result.state.solved).toBe(1);
    expect(result.state.streak).toBe(1);
    expect(result.state.counts.add).toBe(1);
    expect(result.state.skillXp.add).toBe(result.state.xp);
    expect(result.state.lastSolve?.xp).toBe(result.state.xp);
  });

  it('scores the same answer higher when it arrives faster', () => {
    const fast = check(base(), '25', 1_000).state.xp;
    const slow = check(base(), '25', 40_000).state.xp;
    expect(fast).toBeGreaterThan(slow);
  });

  it('records elapsed time and resets the streak on a wrong answer', () => {
    const result = check(base({ streak: 7 }), '99', 4_000);
    expect(result.correct).toBe(false);
    expect(result.state.status).toBe('wrong');
    expect(result.state.streak).toBe(0);
    expect(result.state.elapsedMs).toBe(4_000);
    expect(result.state.lastSolve).toBeNull();
    expect(result.state.solved).toBe(0);
  });

  it('reports a level-up exactly when the ladder advances', () => {
    const justBelow = skillXpThreshold(2) - 1;
    const result = check(base({ skillXp: { add: justBelow, sub: 0, mul: 0, div: 0 } }), '25', 1_000);
    expect(result.state.lastSolve?.levelUp).toBe(2);

    const settled = check(base({ skillXp: { add: 0, sub: 0, mul: 0, div: 0 } }), '25', 1_000);
    expect(settled.state.lastSolve?.levelUp).toBeNull();
  });

  it('ignores empty input and already-answered questions', () => {
    const state = base();
    expect(check(state, '').state).toBe(state);
    const answered = check(state, '25', 1_000).state;
    expect(check(answered, '25', 1_000).state).toBe(answered);
  });

  it('beats the base rate for an instant answer', () => {
    const result = check(base(), '25', 0);
    expect(result.state.xp).toBeGreaterThan(BASE_XP);
  });
});

describe('state transitions', () => {
  it('nextQuestion clears the answer and restarts the clock', () => {
    const answered = check(beginQuestion(freshState('add', {}), 0), '999999', 5_000).state;
    const next = nextQuestion(answered, 9_000);
    expect(next.input).toBe('');
    expect(next.status).toBe('idle');
    expect(next.startedAt).toBe(9_000);
    expect(next.elapsedMs).toBe(0);
    expect(next.lastSolve).toBeNull();
  });

  it('nextQuestion keeps progress and records the served question', () => {
    const state = freshState('mul', { xp: 40, solved: 4, skillXp: { add: 0, sub: 0, mul: 300, div: 0 } });
    const next = nextQuestion(state, 1_000);
    expect(next.xp).toBe(40);
    expect(next.solved).toBe(4);
    expect(next.skillXp.mul).toBe(300);
    expect(next.recent).toContain(questionKey(next));
  });

  it("switchArea changes area and uses that area's own level", () => {
    const state = freshState('add', { skillXp: { add: 0, sub: 0, mul: 0, div: 0 } });
    const switched = switchArea(state, 'div', 500);
    expect(switched.area).toBe('div');
    expect(switched.status).toBe('idle');
    expect(switched.answer).toBe(switched.a / switched.b);
  });

  it('freshState seeds progress without inheriting a stale question', () => {
    const state = freshState('add', {
      xp: 120,
      streak: 3,
      solved: 12,
      counts: { add: 5, sub: 3, mul: 2, div: 2 },
    });
    expect(state.xp).toBe(120);
    expect(state.streak).toBe(3);
    expect(state.counts.add).toBe(5);
    expect(state.status).toBe('idle');
    expect(state.input).toBe('');
    expect(state.answer).toBe(evaluate(state.a, state.b, 'add'));
  });
});

describe('the question clock', () => {
  it('arrives stopped, so opening a screen does not start timing you', () => {
    expect(freshState('add', {}).startedAt).toBeNull();
    // Changing skill is navigation too — you have not read the new question yet.
    expect(switchArea(freshState('add', {}), 'div', 500).startedAt).toBeNull();
  });

  it('runs from the moment the student asks to see the question', () => {
    const begun = beginQuestion(freshState('add', {}), 4_000);
    expect(begun.startedAt).toBe(4_000);
    expect(begun.elapsedMs).toBe(0);
  });

  it('cannot be restarted, so a second press cannot buy more time', () => {
    const begun = beginQuestion(freshState('add', {}), 4_000);
    expect(beginQuestion(begun, 9_000).startedAt).toBe(4_000);
  });

  it('refuses to score a question that was never begun', () => {
    const waiting = { ...freshState('add', {}), a: 12, b: 13, answer: 25 };
    const result = check(waiting, '25', 1_000);
    expect(result.correct).toBe(false);
    expect(result.state).toBe(waiting);
    expect(result.state.xp).toBe(0);
  });

  it('keeps the clock running for the next question in a run', () => {
    // Pressing Next is a request for the question, so it is timed on arrival —
    // only arriving at a screen is untimed.
    const answered = check(beginQuestion(freshState('add', {}), 0), '999999', 5_000).state;
    expect(nextQuestion(answered, 9_000).startedAt).toBe(9_000);
  });
});

describe('describeLevel', () => {
  it('names the operand range a teacher is pinning', () => {
    expect(describeLevel(1)).toBe('to 9 + 9, 9 × 9');
    expect(describeLevel(10)).toMatch(/^to \d+ \+ \d+, \d+ × \d+$/);
  });

  it('tapers at the top so a high level is still mental arithmetic', () => {
    const ceiling = (label: string) => Number(label.match(/to (\d+)/)![1]);
    const lowStep = ceiling(describeLevel(15)) - ceiling(describeLevel(14));
    const highStep = ceiling(describeLevel(30)) - ceiling(describeLevel(29));
    // Without the taper, geometric growth makes each step at the top far bigger
    // than the last; the whole point is that it stops doing that.
    expect(highStep).toBeLessThan(lowStep * 3);
  });
});

describe('methodTip', () => {
  it('always describes a strategy that reaches the stated answer', () => {
    for (const area of AREAS) {
      for (const level of [1, 4, 8, 14]) {
        for (let i = 0; i < 30; i++) {
          const q = generate(area, level);
          const tip = methodTip(q);
          expect(tip.length).toBeGreaterThan(10);
          expect(tip).toContain(String(q.answer));
          // No stray NaN/Infinity leaking out of a decomposition.
          expect(tip).not.toMatch(/NaN|Infinity|undefined/);
        }
      }
    }
  });

  it('uses compensation when an operand sits just under a round number', () => {
    expect(methodTip({ a: 347, b: 199, area: 'add', answer: 546 })).toContain('200');
    expect(methodTip({ a: 764, b: 328, area: 'sub', answer: 436 })).toContain('330');
  });

  it('breaks a composite divisor into factors', () => {
    const tip = methodTip({ a: 384, b: 24, area: 'div', answer: 16 });
    expect(tip).toMatch(/4 × 6|6 × 4/);
    expect(tip).toContain('16');
  });

  it('gives a prime divisor a countable strategy rather than restating the question', () => {
    const tip = methodTip({ a: 91, b: 7, area: 'div', answer: 13 });
    expect(tip).toContain('13');
    expect(tip.toLowerCase()).toMatch(/count|×/);
  });
});

describe('formatting', () => {
  it('formats minutes and seconds', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(9)).toBe('0:09');
    expect(formatTime(75)).toBe('1:15');
    expect(formatTime(600)).toBe('10:00');
  });

  it('formats elapsed milliseconds to a tenth', () => {
    expect(formatElapsed(1_500)).toBe('1.5s');
    expect(formatElapsed(0)).toBe('0.0s');
  });
});
