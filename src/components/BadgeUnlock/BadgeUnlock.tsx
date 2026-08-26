import { useEffect, useState, type CSSProperties } from 'react';
import { TIER_LABEL, type BadgeDef, type BadgeTier } from '../../engine/badges';
import s from './BadgeUnlock.module.css';

export interface Unlock {
  /** Monotonic, so the same badge re-celebrated later gets its own card. */
  key: number;
  badge: BadgeDef;
}

/**
 * How long each tier holds before it clears itself. A Legend has usually been
 * months in the making and is worth looking at; a Bronze is a pat on the back.
 */
const HOLD_MS: Record<BadgeTier, number> = {
  bronze: 4200,
  silver: 4800,
  gold: 5600,
  legend: 7200,
};

/** Escalating flourish, so the tiers are told apart without reading the word. */
const FLOURISH: Record<BadgeTier, { rays: boolean; shine: number; sparks: number }> = {
  bronze: { rays: false, shine: 0, sparks: 0 },
  silver: { rays: false, shine: 1, sparks: 0 },
  gold: { rays: true, shine: 1, sparks: 5 },
  legend: { rays: true, shine: 2, sparks: 9 },
};

const TIER_CLASS: Record<BadgeTier, string> = {
  bronze: s.bronze,
  silver: s.silver,
  gold: s.gold,
  legend: s.legend,
};

/** Varied on purpose: evenly spaced sparks of equal length read as a cog. */
const SPARK_DISTANCE = [34, 27, 39, 30, 36, 25, 41, 32, 28];
const SPARK_DELAY = [0, 60, 30, 90, 15, 75, 45, 105, 20];

const STAGGER_MS = 140;
/** Must match the exit animation in the stylesheet. */
const EXIT_MS = 320;

/**
 * Opening the app after a catalogue update can qualify a student for a dozen
 * badges at once. They all get their moment, four at a time, rather than a
 * column of cards taller than the window.
 */
const MAX_VISIBLE = 4;

interface BadgeUnlockStackProps {
  unlocks: Unlock[];
  onDone: (key: number) => void;
}

/**
 * The celebration for a badge that just unlocked.
 *
 * Deliberately a corner stack rather than a dialog: badges unlock mid-practice,
 * where the student is typing an answer against a clock. Anything that takes
 * focus would eat the digits they are in the middle of and cost them the very
 * question that earned it.
 */
export function BadgeUnlockStack({ unlocks, onDone }: BadgeUnlockStackProps) {
  return (
    // Always mounted, so the live region below is present before it has
    // anything to say — a region inserted at the same moment as its text is
    // unreliably announced.
    <div className={s.stack}>
      <p className={s.live} role="status" aria-live="polite">
        {announce(unlocks)}
      </p>
      {unlocks.slice(0, MAX_VISIBLE).map((unlock, i) => (
        <UnlockCard key={unlock.key} unlock={unlock} index={i} onDone={onDone} />
      ))}
    </div>
  );
}

function announce(unlocks: Unlock[]): string {
  if (unlocks.length === 0) return '';
  if (unlocks.length === 1) {
    const { badge } = unlocks[0];
    return `Badge unlocked: ${badge.name}. ${badge.description}`;
  }
  return `${unlocks.length} badges unlocked: ${unlocks.map((u) => u.badge.name).join(', ')}.`;
}

interface UnlockCardProps {
  unlock: Unlock;
  index: number;
  onDone: (key: number) => void;
}

function UnlockCard({ unlock, index, onDone }: UnlockCardProps) {
  const { key, badge } = unlock;
  const [leaving, setLeaving] = useState(false);
  /** Pointer or keyboard focus on the card: nothing times out under someone. */
  const [held, setHeld] = useState(false);

  const flourish = FLOURISH[badge.tier];
  const delay = index * STAGGER_MS;

  useEffect(() => {
    if (held || leaving) return;
    const timer = setTimeout(() => setLeaving(true), HOLD_MS[badge.tier] + delay);
    return () => clearTimeout(timer);
  }, [held, leaving, badge.tier, delay]);

  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => onDone(key), EXIT_MS);
    return () => clearTimeout(timer);
  }, [leaving, onDone, key]);

  return (
    <article
      className={`${s.card} ${TIER_CLASS[badge.tier]} ${leaving ? s.leaving : ''}`}
      style={{ '--delay': `${delay}ms` } as CSSProperties}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      {Array.from({ length: flourish.shine }, (_, i) => (
        <span key={i} className={s.shine} style={{ '--pass': i } as CSSProperties} aria-hidden="true" />
      ))}

      <div className={s.iconWrap}>
        {flourish.rays && <span className={s.rays} aria-hidden="true" />}
        <span className={s.halo} aria-hidden="true" />
        <span className={s.icon} aria-hidden="true">
          {badge.icon}
        </span>
        {Array.from({ length: flourish.sparks }, (_, i) => (
          <span
            key={i}
            className={s.spark}
            aria-hidden="true"
            style={
              {
                '--angle': `${(360 / flourish.sparks) * i}deg`,
                '--distance': `${SPARK_DISTANCE[i]}px`,
                '--spark-delay': `${SPARK_DELAY[i]}ms`,
              } as CSSProperties
            }
          />
        ))}
      </div>

      <div className={s.body}>
        <div className={s.eyebrow}>{TIER_LABEL[badge.tier]} badge unlocked</div>
        <div className={s.name}>{badge.name}</div>
        <div className={s.desc}>{badge.description}</div>
      </div>

      <button
        type="button"
        className={s.close}
        onClick={() => setLeaving(true)}
        aria-label={`Dismiss ${badge.name}`}
      >
        <span aria-hidden="true">×</span>
      </button>
    </article>
  );
}

export default BadgeUnlockStack;
