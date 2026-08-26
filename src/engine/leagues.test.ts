import { describe, it, expect } from 'vitest';
import {
  COHORT_SIZE,
  DEMOTE_COUNT,
  LEAGUE_TIERS,
  PROMOTE_COUNT,
  activeTierCount,
  formatCountdown,
  msUntilWeekEnd,
  ordinal,
  rankCohort,
  tierForRank,
  tierShares,
  weekStart,
  xpToPromotion,
  zoneForPosition,
  type StandingInput,
} from './leagues';
import {
  insideTurkiye,
  nearestProvince,
  reduceToRegion,
  regionFromTimeZone,
} from './regionReduce';
import { cohortWindow, tierRankRange } from '../lib/leagueApi';
import { TR_PROVINCES } from '../data/regions';

describe('tier population scaling', () => {
  it('opens a single tier for a tiny app rather than seven empty rooms', () => {
    expect(activeTierCount(0)).toBe(1);
    expect(activeTierCount(40)).toBe(1);
  });

  it('unlocks tiers as the population grows, and stops at the last one', () => {
    expect(activeTierCount(60)).toBe(2);
    expect(activeTierCount(150)).toBe(3);
    expect(activeTierCount(1000)).toBe(5);
    expect(activeTierCount(6000)).toBe(7);
    expect(activeTierCount(10_000_000)).toBe(LEAGUE_TIERS.length);
  });

  it('shares out the population as a pyramid, not equal rungs', () => {
    const shares = tierShares(3);
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    // Bottom tier is the biggest, and each step up is half the one below.
    expect(shares[0]).toBeGreaterThan(shares[1]);
    expect(shares[1]).toBeCloseTo(shares[0] / 2);
    expect(shares[2]).toBeCloseTo(shares[1] / 2);
  });
});

describe('tierForRank', () => {
  it('puts everyone in bronze while only one tier is open', () => {
    for (const rank of [1, 10, 40]) expect(tierForRank(rank, 40)).toBe('bronze');
  });

  it('gives the top rank the highest active tier', () => {
    expect(tierForRank(1, 200)).toBe('gold');
    expect(tierForRank(1, 10_000)).toBe('legend');
  });

  it('drops the bottom rank to bronze', () => {
    expect(tierForRank(200, 200)).toBe('bronze');
    expect(tierForRank(10_000, 10_000)).toBe('bronze');
  });

  it('never skips a tier as rank worsens', () => {
    const seen = [...Array(200)].map((_, i) => LEAGUE_TIERS.indexOf(tierForRank(i + 1, 200)));
    for (let i = 1; i < seen.length; i++) {
      // Walking down the ranks, the tier index only ever falls, and by one.
      expect(seen[i]).toBeLessThanOrEqual(seen[i - 1]);
      expect(seen[i - 1] - seen[i]).toBeLessThanOrEqual(1);
    }
  });

  it('treats an unranked player as bottom tier rather than crashing', () => {
    expect(tierForRank(0, 500)).toBe('bronze');
    expect(tierForRank(5, 0)).toBe('bronze');
  });
});

describe('tier rank ranges', () => {
  it('agrees with tierForRank for every rank in the population', () => {
    // tierRankRange re-derives the same pyramid as tierForRank. If the two ever
    // disagree, students get shown a cohort from a tier they are not in.
    for (const total of [1, 12, 60, 149, 150, 401, 1200, 3000, 8000]) {
      for (let rank = 1; rank <= Math.min(total, 400); rank++) {
        const tier = tierForRank(rank, total);
        const range = tierRankRange(tier, total);
        expect({ total, rank, tier, range }).toMatchObject({
          range: { from: expect.any(Number), to: expect.any(Number) },
        });
        expect(rank).toBeGreaterThanOrEqual(range.from);
        expect(rank).toBeLessThanOrEqual(range.to);
      }
    }
  });

  it('cuts a wide tier into consecutive cohorts that contain the student', () => {
    const total = 8000;
    for (const rank of [1, 30, 31, 250, 4000, 7999]) {
      const tier = tierForRank(rank, total);
      const window = cohortWindow(rank, tier, total);
      expect(rank).toBeGreaterThanOrEqual(window.from);
      expect(rank).toBeLessThanOrEqual(window.to);
      expect(window.to - window.from).toBeLessThan(COHORT_SIZE);
    }
  });

  it('keeps a cohort inside its own tier', () => {
    const total = 1200;
    for (let rank = 1; rank <= total; rank += 7) {
      const tier = tierForRank(rank, total);
      const range = tierRankRange(tier, total);
      const window = cohortWindow(rank, tier, total);
      expect(window.from).toBeGreaterThanOrEqual(range.from);
      expect(window.to).toBeLessThanOrEqual(range.to);
    }
  });
});

describe('promotion and relegation zones', () => {
  it('marks the top places for promotion', () => {
    expect(zoneForPosition(1, COHORT_SIZE, 'bronze', 3)).toBe('promotion');
    expect(zoneForPosition(PROMOTE_COUNT, COHORT_SIZE, 'bronze', 3)).toBe('promotion');
    expect(zoneForPosition(PROMOTE_COUNT + 1, COHORT_SIZE, 'bronze', 3)).toBe('safe');
  });

  it('marks the bottom places for relegation', () => {
    expect(zoneForPosition(COHORT_SIZE, COHORT_SIZE, 'silver', 3)).toBe('demotion');
    expect(zoneForPosition(COHORT_SIZE - DEMOTE_COUNT, COHORT_SIZE, 'silver', 3)).toBe('safe');
  });

  it('does not promise promotion out of the top tier', () => {
    expect(zoneForPosition(1, COHORT_SIZE, 'gold', 3)).toBe('safe');
  });

  it('does not threaten relegation out of the bottom tier', () => {
    expect(zoneForPosition(COHORT_SIZE, COHORT_SIZE, 'bronze', 3)).toBe('safe');
  });

  it('never marks one player as both promoted and relegated in a small cohort', () => {
    // Eight players, with 7 promoting and 5 relegating, would otherwise overlap.
    for (let position = 1; position <= 8; position++) {
      expect(zoneForPosition(position, 8, 'silver', 3)).not.toBe('demotion');
    }
  });
});

describe('rankCohort', () => {
  const entry = (id: string, name: string, weeklyXp: number): StandingInput => ({
    studentId: id,
    name,
    weeklyXp,
  });

  it('orders by weekly xp, best first', () => {
    const ranked = rankCohort(
      [entry('a', 'Ada', 10), entry('b', 'Bo', 90), entry('c', 'Cem', 50)],
      'a',
      'bronze',
      3
    );
    expect(ranked.map((r) => r.name)).toEqual(['Bo', 'Cem', 'Ada']);
    expect(ranked.map((r) => r.position)).toEqual([1, 2, 3]);
  });

  it('gives tied students the same position', () => {
    // Two students on the same XP have not out-performed each other; showing
    // one above the other would be reporting sort order as a result.
    const ranked = rankCohort(
      [entry('a', 'Ada', 50), entry('b', 'Bo', 50), entry('c', 'Cem', 10)],
      'a',
      'bronze',
      3
    );
    expect(ranked.map((r) => r.position)).toEqual([1, 1, 3]);
  });

  it('flags the caller', () => {
    const ranked = rankCohort([entry('a', 'Ada', 10), entry('b', 'Bo', 90)], 'a', 'bronze', 3);
    expect(ranked.find((r) => r.isMe)?.name).toBe('Ada');
    expect(ranked.filter((r) => r.isMe)).toHaveLength(1);
  });

  it('handles an empty cohort', () => {
    expect(rankCohort([], 'a', 'bronze', 3)).toEqual([]);
  });
});

describe('xpToPromotion', () => {
  const cohort = (xps: number[]) =>
    rankCohort(
      xps.map((xp, i) => ({ studentId: `s${i}`, name: `S${i}`, weeklyXp: xp })),
      's9',
      'bronze',
      3
    );

  it('reports the gap to the last promotion place', () => {
    const standings = cohort([100, 95, 90, 85, 80, 75, 70, 65, 60, 40]);
    // s9 has 40; seventh place has 70.
    expect(xpToPromotion(standings, 's9')).toBe(30);
  });

  it('says nothing when already promoting', () => {
    const standings = cohort([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    expect(xpToPromotion(standings, 's9')).toBeNull();
  });

  it('says nothing when the cohort is too small to have a cutoff', () => {
    const standings = cohort([50, 40]);
    expect(xpToPromotion(standings, 's9')).toBeNull();
  });
});

describe('ordinal', () => {
  it('handles the teens, which are the whole reason this needs a function', () => {
    expect([11, 12, 13, 111, 112, 113].map(ordinal)).toEqual([
      '11th', '12th', '13th', '111th', '112th', '113th',
    ]);
  });

  it('handles the ordinary cases', () => {
    expect([1, 2, 3, 4, 21, 22, 23, 24, 100, 101].map(ordinal)).toEqual([
      '1st', '2nd', '3rd', '4th', '21st', '22nd', '23rd', '24th', '100th', '101st',
    ]);
  });

  it('says so when there is no rank', () => {
    expect(ordinal(0)).toBe('unranked');
    expect(ordinal(-3)).toBe('unranked');
  });
});

describe('weekly cycle', () => {
  it('starts weeks on Monday', () => {
    // 2026-07-26 is a Sunday, so its week began Monday the 20th.
    expect(weekStart(new Date(2026, 6, 26))).toBe('2026-07-20');
    expect(weekStart(new Date(2026, 6, 20))).toBe('2026-07-20');
    expect(weekStart(new Date(2026, 6, 21))).toBe('2026-07-20');
    expect(weekStart(new Date(2026, 6, 27))).toBe('2026-07-27');
  });

  it('rolls the week over across a month boundary', () => {
    expect(weekStart(new Date(2026, 7, 1))).toBe('2026-07-27');
  });

  it('counts down to the end of the cycle', () => {
    const sunday = new Date(2026, 6, 26, 12, 0, 0);
    const ms = msUntilWeekEnd(sunday);
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(7 * 86_400_000);
    expect(formatCountdown(ms)).toBe('12h 0m left');
  });

  it('formats a countdown at each scale', () => {
    expect(formatCountdown(3 * 86_400_000 + 3_600_000)).toBe('3d 1h left');
    expect(formatCountdown(90 * 60_000)).toBe('1h 30m left');
    expect(formatCountdown(5 * 60_000)).toBe('5m left');
  });
});

describe('region reduction', () => {
  it('recognises coordinates inside and outside Türkiye', () => {
    expect(insideTurkiye(41.01, 28.98)).toBe(true);
    expect(insideTurkiye(48.86, 2.35)).toBe(false);
  });

  it('snaps a coordinate to the province it sits in', () => {
    expect(nearestProvince(41.01, 28.98)).toBe('İstanbul');
    expect(nearestProvince(39.93, 32.86)).toBe('Ankara');
    expect(nearestProvince(38.42, 27.14)).toBe('İzmir');
    expect(nearestProvince(36.9, 30.7)).toBe('Antalya');
  });

  it('returns each province for its own centroid', () => {
    // A table entry that can never be selected is a typo, not a region.
    for (const province of TR_PROVINCES) {
      expect(nearestProvince(province.lat, province.lon)).toBe(province.name);
    }
  });

  it('falls back to the time zone outside the bundled table', () => {
    expect(reduceToRegion(48.86, 2.35, 'Europe/Paris')).toBe('Paris');
    expect(reduceToRegion(40.71, -74.0, 'America/New_York')).toBe('New York');
  });

  it('stores nothing rather than a meaningless label', () => {
    expect(regionFromTimeZone('UTC')).toBeNull();
    expect(regionFromTimeZone('Etc/GMT+3')).toBeNull();
    expect(regionFromTimeZone(undefined)).toBeNull();
    expect(reduceToRegion(48.86, 2.35, undefined)).toBeNull();
  });

  it('refuses a coordinate that isn’t one', () => {
    expect(reduceToRegion(NaN, 10, 'Europe/Paris')).toBeNull();
    expect(reduceToRegion(Infinity, 10, 'Europe/Paris')).toBeNull();
  });
});
