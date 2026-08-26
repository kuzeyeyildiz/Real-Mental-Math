/**
 * Leagues turn total XP into a standing, and this week's XP into a race.
 *
 * Two separate ideas, deliberately:
 *
 * - **Tier** is where you sit among everyone, by lifetime XP. It moves slowly.
 * - **Cohort** is a weekly table of about thirty people in your tier, ranked by
 *   the XP earned *this week*. Top of the table promotes, bottom demotes.
 *
 * The number of tiers in play scales with how many people use the app. Spreading
 * forty students across seven leagues would mean six empty rooms, so tiers
 * unlock as the population grows and a Gold badge keeps meaning something.
 */

export type LeagueTier = 'bronze' | 'silver' | 'gold' | 'sapphire' | 'ruby' | 'diamond' | 'legend';

/** Lowest first. Index into this is the tier's rank. */
export const LEAGUE_TIERS: LeagueTier[] = [
  'bronze',
  'silver',
  'gold',
  'sapphire',
  'ruby',
  'diamond',
  'legend',
];

export const TIER_META: Record<LeagueTier, { label: string; icon: string; color: string }> = {
  bronze: { label: 'Bronze', icon: '🥉', color: '#a86b3c' },
  silver: { label: 'Silver', icon: '🥈', color: '#7d8896' },
  gold: { label: 'Gold', icon: '🥇', color: '#d9a121' },
  sapphire: { label: 'Sapphire', icon: '💎', color: '#2f7fd4' },
  ruby: { label: 'Ruby', icon: '❤️‍🔥', color: '#cc2b52' },
  diamond: { label: 'Diamond', icon: '🔷', color: '#00a2b8' },
  legend: { label: 'Legend', icon: '👑', color: '#6b46e5' },
};

/** A league table you can read in one screen. */
export const COHORT_SIZE = 30;

/** Places promoted and relegated at the end of each weekly cycle. */
export const PROMOTE_COUNT = 7;
export const DEMOTE_COUNT = 5;

/**
 * Roughly how many players each new tier needs before it is worth opening.
 * Doubling each time keeps the pyramid honest: the top tier stays rare.
 */
const TIER_UNLOCK_AT = [0, 60, 150, 400, 1000, 2500, 6000];

/** How many tiers the current population supports, always at least one. */
export function activeTierCount(users: number): number {
  let count = 1;
  for (let i = 1; i < TIER_UNLOCK_AT.length; i++) {
    if (users >= TIER_UNLOCK_AT[i]) count = i + 1;
  }
  return Math.min(LEAGUE_TIERS.length, count);
}

/**
 * Share of the population each active tier holds, lowest tier first. Every step
 * up is half the size of the one below, so the shape is a pyramid rather than a
 * ladder of equal rungs.
 */
export function tierShares(activeTiers: number): number[] {
  const weights = Array.from({ length: activeTiers }, (_, i) => 1 / 2 ** i);
  const total = weights.reduce((sum, w) => sum + w, 0);
  return weights.map((w) => w / total);
}

/**
 * The tier a player sits in, from their rank by total XP. Rank 1 is the best
 * player in the app; an unranked player (rank 0 or worse than the population)
 * falls to the bottom tier.
 */
export function tierForRank(rank: number, totalUsers: number): LeagueTier {
  const activeTiers = activeTierCount(totalUsers);
  if (rank <= 0 || totalUsers <= 0) return LEAGUE_TIERS[0];

  const shares = tierShares(activeTiers);
  // Walk down from the top tier, accumulating how many players it holds.
  let ceiling = 0;
  for (let i = activeTiers - 1; i > 0; i--) {
    ceiling += Math.max(1, Math.round(totalUsers * shares[i]));
    if (rank <= ceiling) return LEAGUE_TIERS[i];
  }
  return LEAGUE_TIERS[0];
}

export type LeagueZone = 'promotion' | 'safe' | 'demotion';

/**
 * Where a position in the weekly table lands. The top tier has nowhere to be
 * promoted to and the bottom tier has nowhere to fall, so those zones collapse
 * to `safe` rather than promising a move that cannot happen.
 */
export function zoneForPosition(
  position: number,
  cohortSize: number,
  tier: LeagueTier,
  activeTiers: number
): LeagueZone {
  const index = LEAGUE_TIERS.indexOf(tier);
  const topIndex = Math.min(activeTiers, LEAGUE_TIERS.length) - 1;

  // A cohort too small to have distinct top and bottom bands would mark the
  // same player as both promoted and relegated.
  const canSplit = cohortSize > PROMOTE_COUNT + DEMOTE_COUNT;

  if (position <= PROMOTE_COUNT && index < topIndex) return 'promotion';
  if (canSplit && position > cohortSize - DEMOTE_COUNT && index > 0) return 'demotion';
  return 'safe';
}

export const ZONE_LABEL: Record<LeagueZone, string> = {
  promotion: 'Promotion zone',
  safe: 'Holding',
  demotion: 'Relegation zone',
};

// ── Weekly cycle ─────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

/**
 * Monday of the week a date falls in, as `yyyy-mm-dd`. Weeks are keyed by local
 * date so a cycle turns over at the student's midnight, not UTC's.
 */
export function weekStart(now: Date = new Date()): string {
  const local = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // getDay() is 0 for Sunday; shift so Monday is the first day.
  const offset = (local.getDay() + 6) % 7;
  local.setDate(local.getDate() - offset);
  const month = String(local.getMonth() + 1).padStart(2, '0');
  const day = String(local.getDate()).padStart(2, '0');
  return `${local.getFullYear()}-${month}-${day}`;
}

/** Milliseconds until the current cycle ends, for the countdown. */
export function msUntilWeekEnd(now: Date = new Date()): number {
  const [y, m, d] = weekStart(now).split('-').map(Number);
  const start = new Date(y, m - 1, d).getTime();
  return Math.max(0, start + 7 * DAY_MS - now.getTime());
}

export function formatCountdown(ms: number): string {
  const days = Math.floor(ms / DAY_MS);
  const hours = Math.floor((ms % DAY_MS) / 3_600_000);
  if (days > 0) return `${days}d ${hours}h left`;
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}

// ── Standings ────────────────────────────────────────────────────────────────

export interface StandingInput {
  studentId: string;
  name: string;
  weeklyXp: number;
}

export interface Standing extends StandingInput {
  position: number;
  zone: LeagueZone;
  isMe: boolean;
}

/**
 * Rank a cohort by weekly XP. Ties share a position — two students on the same
 * XP have not out-performed each other, and showing one above the other would
 * be reporting sort order as a result.
 */
export function rankCohort(
  entries: StandingInput[],
  meId: string,
  tier: LeagueTier,
  activeTiers: number
): Standing[] {
  const sorted = [...entries].sort(
    (a, b) => b.weeklyXp - a.weeklyXp || a.name.localeCompare(b.name)
  );

  let position = 0;
  let lastXp: number | null = null;
  return sorted.map((entry, index) => {
    if (lastXp === null || entry.weeklyXp !== lastXp) {
      position = index + 1;
      lastXp = entry.weeklyXp;
    }
    return {
      ...entry,
      position,
      zone: zoneForPosition(position, sorted.length, tier, activeTiers),
      isMe: entry.studentId === meId,
    };
  });
}

/** "1st", "22nd", "113th" — and an honest word when there is no rank at all. */
export function ordinal(n: number): string {
  if (n <= 0) return 'unranked';
  // The teens are the exception: 11th, 12th and 13th, not 11st.
  const teen = n % 100;
  if (teen >= 11 && teen <= 13) return `${n}th`;
  const suffix = ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix}`;
}

/**
 * XP needed to reach the promotion zone, or null when already in it.
 *
 * The cutoff is the *lowest* score still inside the zone, not whoever happens to
 * sit at position 7. Ties share a position, so a table where eight students are
 * level on 100 XP has no position 7 at all — looking one up by number found
 * nobody and told the student chasing them nothing.
 */
export function xpToPromotion(standings: Standing[], meId: string): number | null {
  const me = standings.find((s) => s.studentId === meId);
  if (!me || me.zone === 'promotion') return null;
  const promoted = standings.filter((s) => s.zone === 'promotion');
  if (promoted.length === 0) return null;
  const cutoff = Math.min(...promoted.map((s) => s.weeklyXp));
  const gap = cutoff - me.weeklyXp;
  return gap > 0 ? gap : null;
}
