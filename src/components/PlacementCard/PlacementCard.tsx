import { Link } from 'react-router-dom';
import type { Level } from '../../types';
import { LEVEL_LABEL, MAX_BENCHMARK_SCORE } from '../../engine/benchmarkEngine';
import s from './PlacementCard.module.css';

const LEVEL_BADGE_COLOR: Record<Level, string> = {
  beginner: 'var(--color-amber)',
  intermediate: 'var(--color-success)',
  expert: 'var(--color-primary)',
  master: 'var(--color-skill-div)',
};

interface PlacementCardProps {
  /** Null when the student hasn't taken the placement assessment. */
  placement: { level: Level; score: number } | null;
  /**
   * Benchmark placement is hidden inside a class unless a teacher has turned it
   * on. Outside a class there is nobody to withhold it, so it shows.
   */
  showPlacement: boolean;
  /** Whether this student belongs to any class at all. */
  hasClass: boolean;
}

/**
 * The assessment result, compact enough to live in the rail footer.
 *
 * Three different situations, and only one of them involves a teacher. A student
 * learning on their own must not be told their result is "with your teacher"
 * when they have no teacher and no result.
 */
export function PlacementCard({ placement, showPlacement, hasClass }: PlacementCardProps) {
  if (!placement) {
    return (
      <div className={s.card}>
        <div className={s.label}>No assessment yet</div>
        <p className={s.text}>
          Your skill levels are climbing from what you practise. The short
          assessment would pitch all four to where you already are.
        </p>
        <Link to="/benchmark" className={s.cta}>
          Take the assessment
        </Link>
      </div>
    );
  }

  if (showPlacement) {
    const scorePct = Math.min(100, (placement.score / MAX_BENCHMARK_SCORE) * 100);
    return (
      <div className={s.card}>
        <span
          className={s.levelBadge}
          style={{ background: LEVEL_BADGE_COLOR[placement.level] }}
        >
          {LEVEL_LABEL[placement.level]}
        </span>
        <div className={s.label}>Benchmark placement</div>
        <div className={s.scoreRow}>
          <span className={s.scoreValue}>{placement.score}</span>
          <span className={s.scoreTotal}>/ {MAX_BENCHMARK_SCORE}</span>
        </div>
        <div className={s.bar}>
          <div
            className={s.fill}
            style={{ width: `${scorePct}%` }}
            role="progressbar"
            aria-valuenow={placement.score}
            aria-valuemin={0}
            aria-valuemax={MAX_BENCHMARK_SCORE}
            aria-label="Benchmark score"
          />
        </div>
      </div>
    );
  }

  if (!hasClass) return null;

  return (
    <div className={s.card}>
      <div className={s.label}>Benchmark placement</div>
      <p className={s.text}>
        Your assessment is with your teacher. Keep practising — your skill
        levels below are what move you forward.
      </p>
    </div>
  );
}

export default PlacementCard;
