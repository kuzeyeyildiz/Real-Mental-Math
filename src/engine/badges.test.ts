import { describe, it, expect } from 'vitest';
import {
  BADGES,
  BADGE_BY_ID,
  EMPTY_BADGE_STATS,
  TIER_RANK,
  badgeProgress,
  badgesByIds,
  newlyEarned,
  nextUp,
  type BadgeStats,
} from './badges';
import { skillXpThreshold } from './skillLadder';

const stats = (over: Partial<BadgeStats> = {}): BadgeStats => ({ ...EMPTY_BADGE_STATS, ...over });

describe('catalogue', () => {
  it('has no duplicate ids', () => {
    expect(BADGE_BY_ID.size).toBe(BADGES.length);
  });

  it('asks for something achievable from every badge', () => {
    for (const badge of BADGES) {
      expect(badge.goal).toBeGreaterThan(0);
      expect(badge.name.length).toBeGreaterThan(0);
      expect(badge.description.length).toBeGreaterThan(0);
    }
  });

  it('awards nothing to a brand-new student', () => {
    expect(badgeProgress(stats()).filter((p) => p.earned)).toEqual([]);
  });
});

describe('progress', () => {
  it('reports how close an unearned badge is', () => {
    const p = badgeProgress(stats({ solved: 50 })).find((x) => x.badge.id === 'hundred-club')!;
    expect(p.earned).toBe(false);
    expect(p.have).toBe(50);
    expect(p.pct).toBe(50);
  });

  it('caps the bar at 100 rather than overflowing', () => {
    const p = badgeProgress(stats({ solved: 900 })).find((x) => x.badge.id === 'first-steps')!;
    expect(p.earned).toBe(true);
    expect(p.pct).toBe(100);
  });

  it('keeps a recorded badge earned even if the measure later reads lower', () => {
    // Progress can be reset or recomputed; an achievement is a thing that
    // happened, so a stored badge must not un-earn itself.
    const p = badgeProgress(stats(), ['thousand-strong']).find(
      (x) => x.badge.id === 'thousand-strong'
    )!;
    expect(p.earned).toBe(true);
    expect(p.pct).toBe(100);
  });
});

describe('skill badges', () => {
  it('reads levels off the xp ladder, not raw xp', () => {
    const at5 = skillXpThreshold(5);
    const earned = badgeProgress(stats({ skillXp: { add: at5, sub: 0, mul: 0, div: 0 } }))
      .filter((p) => p.earned)
      .map((p) => p.badge.id);
    expect(earned).toContain('adder');
    expect(earned).not.toContain('subtractor');
    expect(earned).not.toContain('all-rounder');
  });

  it('only awards the all-rounder when the weakest skill qualifies', () => {
    const at5 = skillXpThreshold(5);
    const three = badgeProgress(stats({ skillXp: { add: at5, sub: at5, mul: at5, div: 0 } })).find(
      (p) => p.badge.id === 'all-rounder'
    )!;
    expect(three.earned).toBe(false);

    const four = badgeProgress(
      stats({ skillXp: { add: at5, sub: at5, mul: at5, div: at5 } })
    ).find((p) => p.badge.id === 'all-rounder')!;
    expect(four.earned).toBe(true);
  });
});

describe('newlyEarned', () => {
  it('returns only badges that are not already recorded', () => {
    const s = stats({ solved: 120 });
    const first = newlyEarned(s, []).map((b) => b.id);
    expect(first).toContain('first-steps');
    expect(first).toContain('hundred-club');

    const second = newlyEarned(s, first).map((b) => b.id);
    expect(second).toEqual([]);
  });

  it('finds nothing for a student who has just started', () => {
    expect(newlyEarned(stats({ solved: 3 }), [])).toEqual([]);
  });
});

describe('nextUp', () => {
  it('suggests the closest badges the student has actually begun', () => {
    const suggestions = nextUp(stats({ solved: 90, bestStreak: 9 }), []);
    const ids = suggestions.map((p) => p.badge.id);
    expect(ids).toContain('hundred-club');
    expect(ids).toContain('on-a-roll');
    // Nothing at zero progress: "0 of 10,000 solved" is not a nudge.
    expect(suggestions.every((p) => p.started)).toBe(true);
  });

  it('does not count the level-1 floor as progress toward a skill badge', () => {
    // Every ladder starts at level 1, so "Reach level 5 in Addition" must read
    // as untouched — not as 20% done — before the student answers anything.
    const p = badgeProgress(stats()).find((x) => x.badge.id === 'adder')!;
    expect(p.started).toBe(false);
    expect(p.pct).toBe(0);
  });

  it('returns nothing to chase when the student has done nothing yet', () => {
    expect(nextUp(stats(), [])).toEqual([]);
  });

  it('is ordered by how close each one is', () => {
    const suggestions = nextUp(stats({ solved: 90, challengeBestCombo: 2 }), [], 5);
    const pcts = suggestions.map((p) => p.pct);
    expect([...pcts].sort((a, b) => b - a)).toEqual(pcts);
  });
});

/** What the unlock celebration reads to turn stored ids back into cards. */
describe('badgesByIds', () => {
  it('resolves ids to their definitions', () => {
    expect(badgesByIds(['first-steps']).map((b) => b.name)).toEqual(['First Steps']);
  });

  it('drops an id the catalogue no longer has', () => {
    // A badge retired in a later release leaves its id behind on every student
    // who earned it. That has to be a non-event, not a blank card or a crash.
    expect(badgesByIds(['first-steps', 'badge-that-was-removed'])).toHaveLength(1);
  });

  it('returns each badge once however many times it is asked for', () => {
    expect(badgesByIds(['first-steps', 'first-steps'])).toHaveLength(1);
  });

  it('leads with the best tier', () => {
    // Several can land on one answer. A Legend arriving underneath a Bronze
    // buries the one the student actually worked for.
    const ids = ['first-steps', 'flawless', 'hundred-club'];
    expect(badgesByIds(ids).map((b) => b.tier)).toEqual(['legend', 'silver', 'bronze']);
  });

  it('returns nothing for nothing', () => {
    expect(badgesByIds([])).toEqual([]);
  });

  it('ranks every tier the catalogue uses', () => {
    for (const badge of BADGES) expect(TIER_RANK[badge.tier]).toBeTypeOf('number');
  });
});
