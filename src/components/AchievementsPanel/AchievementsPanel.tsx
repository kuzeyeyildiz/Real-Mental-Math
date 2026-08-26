import { useMemo, type CSSProperties } from 'react';
import {
  BADGES,
  GROUP_LABEL,
  TIER_LABEL,
  badgeProgress,
  type BadgeGroup,
  type BadgeProgress,
  type BadgeStats,
  type BadgeTier,
} from '../../engine/badges';
import { formatAgo } from '../../engine/assignmentEngine';
import type { EarnedBadge } from '../../lib/gamificationApi';
import p from '../panels/panels.module.css';
import s from './AchievementsPanel.module.css';

const GROUP_ORDER: BadgeGroup[] = ['practice', 'skill', 'speed', 'challenge', 'class'];

const TIER_CLASS: Record<BadgeTier, string> = {
  bronze: s.tierBronze,
  silver: s.tierSilver,
  gold: s.tierGold,
  legend: s.tierLegend,
};

const TIER_ORDER: BadgeTier[] = ['bronze', 'silver', 'gold', 'legend'];

interface AchievementsPanelProps {
  stats: BadgeStats;
  earned: EarnedBadge[];
  /**
   * Won since the app opened. The corner celebration is gone by the time a
   * student comes looking, so the card it was about points itself out.
   */
  highlightIds?: string[];
}

/** Whole numbers read better than "1,000" mid-sentence at this size. */
const fmt = (n: number) => (n >= 1000 ? n.toLocaleString() : String(n));

export function AchievementsPanel({ stats, earned, highlightIds }: AchievementsPanelProps) {
  const earnedAt = useMemo(
    () => new Map(earned.map((e) => [e.badgeId, e.earnedAt])),
    [earned]
  );
  const highlight = useMemo(() => new Set(highlightIds ?? []), [highlightIds]);
  const earnedIds = useMemo(() => earned.map((e) => e.badgeId), [earned]);

  const all = useMemo(() => badgeProgress(stats, earnedIds), [stats, earnedIds]);
  const earnedCount = all.filter((b) => b.earned).length;
  const tierCounts = useMemo(() => {
    const counts: Record<BadgeTier, number> = { bronze: 0, silver: 0, gold: 0, legend: 0 };
    for (const entry of all) if (entry.earned) counts[entry.badge.tier]++;
    return counts;
  }, [all]);

  const byGroup = useMemo(() => {
    const map = new Map<BadgeGroup, BadgeProgress[]>();
    for (const entry of all) {
      const list = map.get(entry.badge.group) ?? [];
      // Earned first, then whatever is closest — so the top of each group is
      // either something won or something nearly won.
      list.push(entry);
      map.set(entry.badge.group, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        if (a.earned !== b.earned) return a.earned ? -1 : 1;
        return b.pct - a.pct;
      });
    }
    return map;
  }, [all]);

  return (
    <div className={p.panel}>
      {/* The header is a card of its own: the ring says how far through the
          catalogue this student is, the tiles say what kind of badges they are
          winning. "Closest to unlocking" now lives in the Studio, next to the
          practice that moves it. */}
      <div className={s.head}>
        <div
          className={s.ring}
          style={{ '--ring': `${(earnedCount / BADGES.length) * 100}%` } as CSSProperties}
          role="progressbar"
          aria-valuenow={earnedCount}
          aria-valuemin={0}
          aria-valuemax={BADGES.length}
          aria-label="Badges earned"
        >
          <div className={s.ringFace}>
            <span className={s.ringValue}>{earnedCount}</span>
            <span className={s.ringUnit}>of {BADGES.length}</span>
          </div>
        </div>

        <div className={s.headText}>
          <h2 className={p.panelTitle}>Achievements</h2>
          <p className={p.panelSub}>
            Every badge shows how close you are, so there is always something to aim at.
          </p>
        </div>

        <div className={s.counters}>
          {TIER_ORDER.map((tier) => (
            <div key={tier} className={`${s.counter} ${TIER_CLASS[tier]}`}>
              <span className={s.counterValue}>{tierCounts[tier]}</span>
              <span className={s.counterLabel}>{TIER_LABEL[tier]}</span>
            </div>
          ))}
        </div>
      </div>

      {GROUP_ORDER.map((group) => {
        const list = byGroup.get(group) ?? [];
        if (list.length === 0) return null;
        return (
          <section key={group} className={s.group}>
            <h3 className={s.groupTitle}>{GROUP_LABEL[group]}</h3>
            <div className={s.grid}>
              {list.map(({ badge, have, goal, earned: won, pct }) => {
                const when = earnedAt.get(badge.id);
                const isNew = won && highlight.has(badge.id);
                return (
                  <article
                    key={badge.id}
                    className={`${s.badge} ${won ? '' : s.locked} ${isNew ? s.justEarned : ''}`}
                    aria-label={`${badge.name}, ${won ? 'earned' : `${have} of ${goal}`}`}
                  >
                    <div className={s.badgeTop}>
                      <span className={s.icon} aria-hidden="true">
                        {badge.icon}
                      </span>
                      <span className={`${s.tier} ${TIER_CLASS[badge.tier]}`}>
                        {TIER_LABEL[badge.tier]}
                      </span>
                    </div>

                    <div>
                      <div className={s.name}>{badge.name}</div>
                      <div className={s.desc}>{badge.description}</div>
                    </div>

                    <div className={s.progressRow}>
                      <span className={s.track}>
                        <span
                          className={`${s.fill} ${won ? s.fillDone : ''}`}
                          style={{ width: `${pct}%` }}
                          role="progressbar"
                          aria-valuenow={Math.round(pct)}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`${badge.name} progress`}
                        />
                      </span>
                      <span className={`${s.progressText} ${won ? s.earnedAt : ''}`}>
                        {won
                          ? when
                            ? `Earned ${formatAgo(when)}`
                            : 'Earned'
                          : `${fmt(have)} / ${fmt(goal)}`}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export default AchievementsPanel;
