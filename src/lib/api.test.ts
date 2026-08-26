import { describe, it, expect } from 'vitest';
import { recentDays, rollPracticeDay, toDailySeries, today } from './api';

/**
 * `rollPracticeDay` is spread *last* over a progress row, so what it returns is
 * what wins. That makes "returns only the two day fields" a correctness
 * requirement rather than a stylistic one.
 */
describe('rollPracticeDay', () => {
  const base = { daysPractised: 3, lastPracticeDay: '2026-08-03' };

  it('counts a new day once', () => {
    expect(rollPracticeDay(base, '2026-08-04')).toEqual({
      daysPractised: 4,
      lastPracticeDay: '2026-08-04',
    });
  });

  it('counts the first ever day', () => {
    expect(rollPracticeDay({ daysPractised: 0, lastPracticeDay: null }, '2026-08-03')).toEqual({
      daysPractised: 1,
      lastPracticeDay: '2026-08-03',
    });
  });

  it('does not count the same day twice', () => {
    expect(rollPracticeDay(base, '2026-08-03')).toEqual({
      daysPractised: 3,
      lastPracticeDay: '2026-08-03',
    });
  });

  it('returns only the two day fields, never the row it was given', () => {
    // The bug this guards: on a repeat day it used to return `current` whole.
    // Spread last over the new progress, that put the entire pre-existing row
    // back on top — so every save after the first of any day silently wrote the
    // values the session started with, and a day's practice vanished on reload.
    const row = { ...base, xp: 1614, solved: 48 };
    expect(Object.keys(rollPracticeDay(row, '2026-08-03')).sort()).toEqual([
      'daysPractised',
      'lastPracticeDay',
    ]);
  });

  it('lets a later snapshot survive the merge on a day already counted', () => {
    const current = { ...base, xp: 1614, solved: 48 };
    const snapshot = { xp: 1637, solved: 49 };
    const merged = { ...current, ...snapshot, ...rollPracticeDay(current, '2026-08-03') };
    expect(merged.xp).toBe(1637);
    expect(merged.solved).toBe(49);
    expect(merged.daysPractised).toBe(3);
  });
});

describe('today', () => {
  it('reports the local calendar date, not UTC', () => {
    // 00:30 local on the 4th is still the 3rd in UTC for a positive offset; the
    // student's day is the one that counts.
    const local = new Date(2026, 7, 4, 0, 30);
    expect(today(local)).toBe('2026-08-04');
  });

  it('formats as yyyy-mm-dd', () => {
    expect(today(new Date(2026, 0, 9, 12))).toBe('2026-01-09');
  });
});

/** The window the XP history is read and drawn over. */
describe('recentDays', () => {
  it('ends on today and runs oldest first', () => {
    const days = recentDays(7, new Date(2026, 7, 8, 12));
    expect(days).toEqual([
      '2026-08-02',
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
      '2026-08-06',
      '2026-08-07',
      '2026-08-08',
    ]);
  });

  it('crosses a month boundary', () => {
    expect(recentDays(3, new Date(2026, 8, 1, 12))).toEqual([
      '2026-08-30',
      '2026-08-31',
      '2026-09-01',
    ]);
  });

  it('crosses a year boundary', () => {
    expect(recentDays(2, new Date(2026, 0, 1, 12))).toEqual(['2025-12-31', '2026-01-01']);
  });

  it('stays on local days near midnight', () => {
    // The same trap `today` guards: 00:30 must not report yesterday's window.
    expect(recentDays(2, new Date(2026, 7, 8, 0, 30))).toEqual(['2026-08-07', '2026-08-08']);
  });
});

describe('toDailySeries', () => {
  const days = ['2026-08-06', '2026-08-07', '2026-08-08'];

  it('lines rows up with the window', () => {
    expect(toDailySeries([{ day: '2026-08-07', xp: 90 }], days)).toEqual([0, 90, 0]);
  });

  it('reads a day with no row as nothing earned, not as missing', () => {
    expect(toDailySeries([], days)).toEqual([0, 0, 0]);
  });

  it('ignores days outside the window', () => {
    const rows = [
      { day: '2026-07-01', xp: 500 },
      { day: '2026-08-08', xp: 40 },
    ];
    expect(toDailySeries(rows, days)).toEqual([0, 0, 40]);
  });

  it('always returns one number per day asked for', () => {
    expect(toDailySeries([{ day: '2026-08-06', xp: 10 }], days)).toHaveLength(days.length);
  });
});
