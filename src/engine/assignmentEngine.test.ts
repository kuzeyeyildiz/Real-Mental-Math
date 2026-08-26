import { describe, it, expect } from 'vitest';
import {
  assignmentSequence,
  assignmentStatus,
  accuracy,
  summariseSubmissions,
  formatDue,
  formatAgo,
  formatBytes,
} from './assignmentEngine';
import { analyseClass, type AnalyticsStudent } from './analytics';
import { skillXpThreshold } from './skillLadder';
import { freshState, beginQuestion, check, switchArea } from './practiceEngine';
import type { Area } from '../types';

describe('assignmentSequence', () => {
  it('serves exactly the requested number of questions', () => {
    for (const count of [1, 5, 10, 37, 100]) {
      expect(assignmentSequence(['add', 'sub'], count)).toHaveLength(count);
    }
  });

  it('only serves areas the assignment asked for', () => {
    const seq = assignmentSequence(['mul', 'div'], 40);
    expect(seq.every((a) => a === 'mul' || a === 'div')).toBe(true);
  });

  it('spreads areas evenly rather than clustering one at the end', () => {
    const seq = assignmentSequence(['add', 'sub', 'mul', 'div'], 40);
    const counts = seq.reduce<Record<string, number>>((acc, a) => {
      acc[a] = (acc[a] ?? 0) + 1;
      return acc;
    }, {});
    for (const area of ['add', 'sub', 'mul', 'div']) {
      expect(counts[area]).toBe(10);
    }
  });

  it('shuffles within a cycle so the order is not predictable', () => {
    // A generator pinned to 0 always swaps toward index 0, which walks
    // [add, sub, mul, div] to exactly this permutation — proof the shuffle
    // runs, and that it permutes rather than drops.
    const seq = assignmentSequence(['add', 'sub', 'mul', 'div'], 4, () => 0);
    expect(seq).toEqual(['sub', 'mul', 'div', 'add']);
  });

  it('returns nothing for a degenerate assignment', () => {
    expect(assignmentSequence([], 10)).toEqual([]);
    expect(assignmentSequence(['add'], 0)).toEqual([]);
  });
});

describe('assignmentStatus', () => {
  const now = Date.parse('2026-07-25T12:00:00Z');
  const sub = { submitted_at: '2026-07-24T00:00:00Z' };

  it('treats handed-in work as done even when the deadline has passed', () => {
    const past = { due_at: '2026-07-01T00:00:00Z' };
    expect(assignmentStatus(past, sub, now)).toBe('done');
  });

  it('flags a missed deadline', () => {
    expect(assignmentStatus({ due_at: '2026-07-24T00:00:00Z' }, null, now)).toBe('overdue');
  });

  it('warns inside the last two days', () => {
    expect(assignmentStatus({ due_at: '2026-07-26T12:00:00Z' }, null, now)).toBe('due-soon');
  });

  it('leaves distant and open-ended work alone', () => {
    expect(assignmentStatus({ due_at: '2026-08-30T00:00:00Z' }, null, now)).toBe('open');
    expect(assignmentStatus({ due_at: null }, null, now)).toBe('open');
  });

  it('does not treat an unparseable deadline as overdue', () => {
    expect(assignmentStatus({ due_at: 'not a date' }, null, now)).toBe('open');
  });
});

describe('accuracy and summaries', () => {
  it('never divides by zero', () => {
    expect(accuracy(0, 0)).toBe(0);
  });

  it('rounds to whole percentages', () => {
    expect(accuracy(2, 3)).toBe(67);
    expect(accuracy(10, 10)).toBe(100);
  });

  it('averages accuracy over submissions only, not over the whole class', () => {
    const result = summariseSubmissions(10, [
      { correct: 10, total: 10 },
      { correct: 5, total: 10 },
    ]);
    expect(result).toEqual({ assigned: 10, handedIn: 2, averageAccuracy: 75 });
  });

  it('reports an untouched assignment without inventing a score', () => {
    expect(summariseSubmissions(6, [])).toEqual({
      assigned: 6,
      handedIn: 0,
      averageAccuracy: 0,
    });
  });
});

describe('formatting', () => {
  const now = Date.parse('2026-07-25T12:00:00Z');

  it('describes deadlines in the terms a student thinks in', () => {
    expect(formatDue(null, now)).toBe('No deadline');
    expect(formatDue('2026-07-25T18:00:00Z', now)).toBe('Due today');
    expect(formatDue('2026-07-26T14:00:00Z', now)).toBe('Due tomorrow');
    expect(formatDue('2026-07-30T12:00:00Z', now)).toBe('Due in 5 days');
    expect(formatDue('2026-07-22T12:00:00Z', now)).toBe('3 days overdue');
  });

  it('describes recency without a clock', () => {
    expect(formatAgo(null, now)).toBe('never');
    expect(formatAgo('2026-07-25T11:59:30Z', now)).toBe('just now');
    expect(formatAgo('2026-07-25T11:30:00Z', now)).toBe('30 min ago');
    expect(formatAgo('2026-07-25T09:00:00Z', now)).toBe('3 hours ago');
    expect(formatAgo('2026-07-23T12:00:00Z', now)).toBe('2 days ago');
  });

  it('formats file sizes', () => {
    expect(formatBytes(null)).toBe('');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});

describe('analyseClass', () => {
  const student = (over: Partial<AnalyticsStudent>): AnalyticsStudent => ({
    id: 'a',
    name: 'A',
    xp: 0,
    solved: 0,
    skillXp: { add: 0, sub: 0, mul: 0, div: 0 },
    lastActive: null,
    ...over,
  });

  it('returns an empty shape rather than NaN for a class with no students', () => {
    const result = analyseClass([], Date.parse('2026-07-25T12:00:00Z'));
    expect(result.students).toBe(0);
    expect(result.averageXp).toBe(0);
    expect(result.weakestAreas).toEqual([]);
    expect(result.areas).toHaveLength(4);
  });

  it('names no weakest area when every skill is level with the others', () => {
    // Otherwise a brand-new class is told its weakest skill is whichever one
    // happens to be first in the list.
    const result = analyseClass([student({ id: '1' }), student({ id: '2' })], Date.now());
    expect(result.weakestAreas).toEqual([]);
  });

  it('finds the area the class is weakest at', () => {
    const now = Date.parse('2026-07-25T12:00:00Z');
    const strong = skillXpThreshold(6);
    const result = analyseClass(
      [
        student({
          id: '1',
          skillXp: { add: strong, sub: strong, mul: strong, div: 0 },
          lastActive: '2026-07-25T11:00:00Z',
        }),
      ],
      now
    );
    expect(result.weakestAreas).toEqual(['div']);
  });

  it('lists every area tied at the bottom rather than picking one', () => {
    const now = Date.parse('2026-07-25T12:00:00Z');
    const strong = skillXpThreshold(6);
    const result = analyseClass(
      [student({ id: '1', skillXp: { add: 0, sub: 0, mul: strong, div: 0 } })],
      now
    );
    expect(result.weakestAreas).toEqual(['add', 'sub', 'div']);
  });

  it('counts only the past week as active', () => {
    const now = Date.parse('2026-07-25T12:00:00Z');
    const result = analyseClass(
      [
        student({ id: '1', lastActive: '2026-07-24T12:00:00Z', solved: 5 }),
        student({ id: '2', lastActive: '2026-06-01T12:00:00Z', solved: 3 }),
        student({ id: '3', lastActive: null }),
      ],
      now
    );
    expect(result.activeThisWeek).toBe(1);
    expect(result.needsAttention.map((s) => s.id)).toEqual(['3', '2']);
  });
});

describe('pinned assignment difficulty', () => {
  /** A run in progress: the student has begun the question, so it is timed. */
  const started = (seed: Parameters<typeof freshState>[1]) =>
    beginQuestion(freshState('add', seed), 0);

  it('builds questions at the override rather than the student ladder', () => {
    // A level-1 addition ladder pinned to 12 must serve level-12 operands.
    const pinned = freshState('add', { levelOverride: 12 });
    const adaptive = freshState('add', {});
    expect(Math.max(pinned.a, pinned.b)).toBeGreaterThan(Math.max(adaptive.a, adaptive.b));
  });

  it('keeps the override in force across area switches', () => {
    let state = freshState('add', { levelOverride: 10 });
    for (const area of ['sub', 'mul', 'div'] as Area[]) {
      state = switchArea(state, area, 0);
      expect(state.levelOverride).toBe(10);
      expect(Math.max(state.a, state.b)).toBeGreaterThan(9);
    }
  });

  it('scores against the pinned difficulty, so hard work gets a fair clock', () => {
    // 20 seconds is slow for level-1 addition but comfortably on time at 12.
    const pinned = started({ levelOverride: 12 });
    const adaptive = started({});
    const pinnedSolve = check(pinned, String(pinned.answer), 20_000).state.lastSolve;
    const adaptiveSolve = check(adaptive, String(adaptive.answer), 20_000).state.lastSolve;
    expect(pinnedSolve!.targetMs).toBeGreaterThan(adaptiveSolve!.targetMs);
    expect(pinnedSolve!.xp).toBeGreaterThan(adaptiveSolve!.xp);
  });

  it('still advances the real ladder, not the pinned one', () => {
    const state = started({ levelOverride: 12, skillXp: { add: 0, sub: 0, mul: 0, div: 0 } });
    const after = check(state, String(state.answer), 1_000).state;
    expect(after.skillXp.add).toBeGreaterThan(0);
    expect(after.levelOverride).toBe(12);
  });
});
