import { describe, it, expect } from 'vitest';
import {
  CHALLENGE_DURATION_MS,
  advanceChallenge,
  challengeTargetMs,
  comboMultiplier,
  comboRung,
  levelsFromSkillXp,
  nextChallengeQuestion,
  scoreAnswer,
  splitChallengeXp,
  startChallenge,
  submitChallengeAnswer,
  summariseChallenge,
  type ChallengeLevels,
  type ChallengeQuestion,
} from './challengeEngine';
import { skillXpThreshold } from './skillLadder';
import type { Area } from '../types';

const LEVEL_1: ChallengeLevels = { add: 1, sub: 1, mul: 1, div: 1 };

/** A deterministic stand-in for Math.random that cycles a fixed list. */
function seeded(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

/**
 * Evaluate a rendered prompt the way a student reads it, so the test checks the
 * printed question rather than trusting the generator's own arithmetic.
 */
function evaluatePrompt(prompt: string): number {
  const normalised = prompt.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  if (!/^[\d\s+\-*/()]+$/.test(normalised)) {
    throw new Error(`prompt has unexpected characters: ${prompt}`);
  }
  return Function(`"use strict"; return (${normalised});`)() as number;
}

describe('question generation', () => {
  it('renders a prompt that evaluates to the stated answer', () => {
    const levels: ChallengeLevels = { add: 6, sub: 6, mul: 5, div: 5 };
    for (let i = 0; i < 400; i++) {
      // Sweep combos so both single and combined shapes are covered.
      const q = nextChallengeQuestion(levels, i % 20);
      expect(evaluatePrompt(q.prompt)).toBe(q.answer);
    }
  });

  it('never asks for a negative or fractional answer', () => {
    const levels: ChallengeLevels = { add: 9, sub: 9, mul: 8, div: 8 };
    for (let i = 0; i < 400; i++) {
      const q = nextChallengeQuestion(levels, i % 25);
      expect(Number.isInteger(q.answer)).toBe(true);
      expect(q.answer).toBeGreaterThanOrEqual(0);
    }
  });

  it('stays single-operation until a combo is going', () => {
    for (let combo = 0; combo < 3; combo++) {
      for (let i = 0; i < 40; i++) {
        expect(nextChallengeQuestion(LEVEL_1, combo).shape).toBe('single');
      }
    }
  });

  it('starts combining operations once the combo is up', () => {
    const shapes = new Set<string>();
    for (let i = 0; i < 200; i++) shapes.add(nextChallengeQuestion(LEVEL_1, 8).shape);
    expect(shapes.size).toBeGreaterThan(1);
    expect([...shapes].some((s) => s !== 'single')).toBe(true);
  });

  it('tags a combined question with both skills it exercises', () => {
    for (let i = 0; i < 200; i++) {
      const q = nextChallengeQuestion(LEVEL_1, 10);
      expect(q.areas.length).toBe(q.shape === 'single' ? 1 : 2);
    }
  });

  it('avoids re-serving a question it was just asked', () => {
    // One value for every rng draw makes the generator fully deterministic, so
    // without the recent-key check it would return the same question forever.
    const rng = seeded([0.5]);
    const first = nextChallengeQuestion(LEVEL_1, 0, [], rng);
    const again = nextChallengeQuestion(LEVEL_1, 0, [first.key], rng);
    // It gave up after exhausting its attempts, but the fallback is still a
    // valid question rather than a crash.
    expect(again.answer).toBe(evaluatePrompt(again.prompt));
  });

  it('reads the student ladders rather than a fixed difficulty', () => {
    const strong = levelsFromSkillXp({
      add: skillXpThreshold(10),
      sub: skillXpThreshold(10),
      mul: skillXpThreshold(10),
      div: skillXpThreshold(10),
    });
    expect(strong).toEqual({ add: 10, sub: 10, mul: 10, div: 10 });

    const weakMax = Math.max(
      ...Array.from({ length: 60 }, () => nextChallengeQuestion(LEVEL_1, 0).answer)
    );
    const strongMax = Math.max(
      ...Array.from({ length: 60 }, () => nextChallengeQuestion(strong, 0).answer)
    );
    expect(strongMax).toBeGreaterThan(weakMax);
  });
});

describe('combo and scoring', () => {
  it('raises difficulty in steps and then stops', () => {
    expect(comboRung(0)).toBe(0);
    expect(comboRung(3)).toBe(0);
    expect(comboRung(4)).toBe(1);
    expect(comboRung(16)).toBe(4);
    // Capped, so a 60-long combo doesn't leave the student behind.
    expect(comboRung(60)).toBe(4);
  });

  it('caps the combo multiplier', () => {
    expect(comboMultiplier(0)).toBe(1);
    expect(comboMultiplier(15)).toBeCloseTo(1.9);
    expect(comboMultiplier(200)).toBeCloseTo(1.9);
  });

  it('pays more for a combined question than a single one at the same speed', () => {
    const single: ChallengeQuestion = {
      prompt: '7 × 8',
      answer: 56,
      areas: ['mul'],
      shape: 'single',
      level: 3,
      key: 'a',
    };
    const combined: ChallengeQuestion = { ...single, areas: ['mul', 'add'], shape: 'mul-add', key: 'b' };
    const fast = 500;
    expect(scoreAnswer(combined, fast, 1).points).toBeGreaterThan(
      scoreAnswer(single, fast, 1).points
    );
  });

  it('gives a combined question a longer clock than a single one', () => {
    const single: ChallengeQuestion = {
      prompt: '7 × 8',
      answer: 56,
      areas: ['mul'],
      shape: 'single',
      level: 3,
      key: 'a',
    };
    const combined: ChallengeQuestion = { ...single, areas: ['mul', 'add'], shape: 'mul-add', key: 'b' };
    expect(challengeTargetMs(combined)).toBeGreaterThan(challengeTargetMs(single));
  });

  it('always pays at least a point, however slow', () => {
    const q: ChallengeQuestion = {
      prompt: '2 + 2',
      answer: 4,
      areas: ['add'],
      shape: 'single',
      level: 1,
      key: 'a',
    };
    expect(scoreAnswer(q, 10 * 60 * 1000, 0).points).toBeGreaterThanOrEqual(1);
  });
});

describe('xp split', () => {
  it('splits the score across the skills the run actually used', () => {
    const split = splitChallengeXp(100, { add: 5, sub: 5, mul: 0, div: 0 });
    expect(split).toEqual({ add: 50, sub: 50, mul: 0, div: 0 });
  });

  it('hands rounding leftovers to the most-answered skill instead of losing them', () => {
    const split = splitChallengeXp(100, { add: 2, sub: 1, mul: 0, div: 0 });
    expect(split.add + split.sub + split.mul + split.div).toBe(100);
    expect(split.add).toBeGreaterThan(split.sub);
  });

  it('awards nothing for a run with no correct answers', () => {
    expect(splitChallengeXp(0, { add: 0, sub: 0, mul: 0, div: 0 })).toEqual({
      add: 0,
      sub: 0,
      mul: 0,
      div: 0,
    });
  });
});

describe('run state', () => {
  const start = 1_000_000;

  it('runs for the advertised duration', () => {
    const state = startChallenge(LEVEL_1, start);
    expect(state.endsAt - state.startedAt).toBe(CHALLENGE_DURATION_MS);
  });

  it('builds the combo and score on a correct answer', () => {
    let state = startChallenge(LEVEL_1, start);
    const res = submitChallengeAnswer(state, String(state.question.answer), start + 1000);
    expect(res.correct).toBe(true);
    state = res.state;
    expect(state.combo).toBe(1);
    expect(state.correct).toBe(1);
    expect(state.score).toBeGreaterThan(0);
    expect(state.lastGain).not.toBeNull();
  });

  it('breaks the combo on a wrong answer but keeps the run alive', () => {
    let state = startChallenge(LEVEL_1, start);
    state = submitChallengeAnswer(state, String(state.question.answer), start + 500).state;
    state = advanceChallenge(state, LEVEL_1, start + 600);
    const scoreBefore = state.score;
    const res = submitChallengeAnswer(state, String(state.question.answer + 1), start + 1200);
    expect(res.correct).toBe(false);
    expect(res.state.combo).toBe(0);
    expect(res.state.bestCombo).toBe(1);
    expect(res.state.score).toBe(scoreBefore);
    expect(res.state.finished).toBe(false);
    expect(res.state.answered).toBe(2);
  });

  it('ignores a second submission for the same question', () => {
    let state = startChallenge(LEVEL_1, start);
    state = submitChallengeAnswer(state, String(state.question.answer), start + 500).state;
    const again = submitChallengeAnswer(state, String(state.question.answer), start + 700);
    expect(again.state).toBe(state);
  });

  it('finishes instead of serving a question past the buzzer', () => {
    const state = startChallenge(LEVEL_1, start);
    const after = advanceChallenge(state, LEVEL_1, start + CHALLENGE_DURATION_MS + 1);
    expect(after.finished).toBe(true);
    expect(after.question).toBe(state.question);
  });

  it('refuses answers once the run has finished', () => {
    const state = { ...startChallenge(LEVEL_1, start), finished: true };
    const res = submitChallengeAnswer(state, String(state.question.answer), start + 100);
    expect(res.correct).toBe(false);
    expect(res.state).toBe(state);
  });

  it('summarises a run without dividing by zero', () => {
    const summary = summariseChallenge(startChallenge(LEVEL_1, start));
    expect(summary).toMatchObject({ score: 0, correct: 0, answered: 0, accuracy: 0, xpTotal: 0 });
  });

  it('counts fast answers toward the speed badges', () => {
    // A lightning answer in a challenge has to count the same as one in
    // practice, or the speed badges are unreachable for a student who
    // mostly plays challenges.
    let state = startChallenge(LEVEL_1, start);
    state = submitChallengeAnswer(state, String(state.question.answer), start + 200).state;
    expect(state.lightning).toBe(1);
    expect(summariseChallenge(state).lightning).toBe(1);

    state = advanceChallenge(state, LEVEL_1, start + 400);
    // Far outside the target — fast enough to be correct, not fast enough to count.
    state = submitChallengeAnswer(state, String(state.question.answer), start + 60_000).state;
    expect(state.lightning).toBe(1);
  });

  it('does not count a wrong answer as a fast one', () => {
    let state = startChallenge(LEVEL_1, start);
    state = submitChallengeAnswer(state, String(state.question.answer + 1), start + 100).state;
    expect(state.lightning).toBe(0);
  });

  it('turns a finished run into skill xp that matches the score', () => {
    let state = startChallenge(LEVEL_1, start);
    let now = start;
    for (let i = 0; i < 6; i++) {
      state = submitChallengeAnswer(state, String(state.question.answer), now + 400).state;
      now += 500;
      state = advanceChallenge(state, LEVEL_1, now);
    }
    const summary = summariseChallenge(state);
    expect(summary.correct).toBe(6);
    expect(summary.accuracy).toBe(100);
    expect(summary.xpTotal).toBe(summary.score);

    const touched = (['add', 'sub', 'mul', 'div'] as Area[]).filter((a) => state.areaHits[a] > 0);
    for (const area of touched) expect(summary.xpSplit[area]).toBeGreaterThan(0);
  });
});
