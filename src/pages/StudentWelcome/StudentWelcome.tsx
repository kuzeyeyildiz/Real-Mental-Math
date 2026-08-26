import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../../components/Logo/Logo';
import { JoinClassCard } from '../../components/JoinClassCard/JoinClassCard';
import { useAuth } from '../../auth/AuthProvider';
import { setPlacementDeclined } from '../../lib/api';
import {
  BENCHMARK_QUESTIONS,
  BENCHMARK_TIME_BUDGET_S,
  TIER_COUNTS,
  TIER_LABEL,
  TIER_ORDER,
  PART_LABELS,
  AREA_ORDER,
} from '../../data/benchmarkTest';
import s from './StudentWelcome.module.css';

const PER_SKILL = BENCHMARK_QUESTIONS.length / AREA_ORDER.length;

/**
 * Landing for a student who has not been placed yet. The assessment used to
 * start the instant they signed in, which gave them no chance to check who they
 * are, join their class, or know what they were walking into.
 *
 * It is also a genuine choice rather than a gate. Sixty questions is a lot to
 * face on your first minute in an app, and a student who is made to do it before
 * anything else works may simply never come back. Skipping only costs them the
 * head start: their ladders open at level 1 and climb from what they practise.
 */
export function StudentWelcome() {
  const { profile, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [skipping, setSkipping] = useState(false);
  const [skipError, setSkipError] = useState<string | null>(null);

  async function handleSkip() {
    if (!profile) return;
    setSkipping(true);
    setSkipError(null);
    const { error } = await setPlacementDeclined(profile.id, true);
    if (error) {
      setSkipError(error);
      setSkipping(false);
      return;
    }
    // The gate reads the profile, so it has to see the new value before it will
    // let them through. Leave `skipping` set — this screen is about to unmount.
    await refreshProfile();
  }

  const name = profile?.full_name?.trim() || 'there';
  const firstName = name.split(' ')[0];
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const minutes = Math.round(BENCHMARK_TIME_BUDGET_S / 60);

  return (
    <div className={s.page}>
      <div className={s.wrap}>
        <header className={s.head}>
          <Logo size={38} showWordmark />
          <button type="button" className={s.signOut} onClick={signOut}>
            Sign out
          </button>
        </header>

        <section className={s.hero}>
          <div className={s.avatar} aria-hidden="true">{initials || '?'}</div>
          <div className={s.heroText}>
            <h1 className={s.title}>Hello, {firstName}</h1>
            <p className={s.subtitle}>
              A short assessment tells Numo where to pitch each skill. It’s the
              best way to start — but it’s your choice, and you can take it later.
            </p>
          </div>
        </section>

        <section className={s.card} aria-labelledby="profile-heading">
          <h2 id="profile-heading" className={s.cardTitle}>Your details</h2>
          <dl className={s.detailGrid}>
            <div className={s.detail}>
              <dt>Name</dt>
              <dd>{profile?.full_name || '—'}</dd>
            </div>
            <div className={s.detail}>
              <dt>Grade</dt>
              <dd>{profile?.grade || 'Not set'}</dd>
            </div>
            <div className={s.detail}>
              <dt>Account</dt>
              <dd className={s.capitalize}>{profile?.role || '—'}</dd>
            </div>
          </dl>
          <p className={s.detailNote}>
            Something wrong? Sign out and register again with the right details —
            your assessment result is tied to this account.
          </p>
        </section>

        <section className={s.card} aria-labelledby="assessment-heading">
          <span className={s.recommend}>
            <span aria-hidden="true">★</span>
            Strongly recommended
          </span>
          <h2 id="assessment-heading" className={s.cardTitle}>What the assessment looks like</h2>

          <div className={s.stats}>
            <div className={s.stat}>
              <span className={s.statValue}>{BENCHMARK_QUESTIONS.length}</span>
              <span className={s.statLabel}>questions</span>
            </div>
            <div className={s.stat}>
              <span className={s.statValue}>{AREA_ORDER.length}</span>
              <span className={s.statLabel}>skills</span>
            </div>
            <div className={s.stat}>
              <span className={s.statValue}>~{minutes}</span>
              <span className={s.statLabel}>minutes max</span>
            </div>
          </div>

          <p className={s.body}>
            {PER_SKILL} questions on each of {AREA_ORDER.map((a) => PART_LABELS[a].toLowerCase()).join(', ')},
            climbing in difficulty. Every question is timed on its own — when the
            clock runs out it moves on, so answer what you can and don't dwell.
          </p>

          <ul className={s.tierList}>
            {TIER_ORDER.map((tier) => (
              <li key={tier} className={s.tierRow}>
                <span className={s.tierName}>{TIER_LABEL[tier]}</span>
                <span className={s.tierCount}>{TIER_COUNTS[tier]} per skill</span>
              </li>
            ))}
          </ul>

          <p className={s.privacyNote}>
            If you're in a class, your result goes to your teacher. You'll see your
            skill levels rise as you practise, and your teacher can share the
            placement with you if they'd like to.
          </p>

          <div className={s.choice}>
            <button
              type="button"
              className={s.startBtn}
              onClick={() => navigate('/benchmark')}
              disabled={skipping}
            >
              I'm ready — start the assessment
            </button>
            <button
              type="button"
              className={s.skipBtn}
              onClick={() => void handleSkip()}
              disabled={skipping}
            >
              {skipping ? 'One moment…' : 'Skip for now — start practising'}
            </button>
            <p className={s.skipNote}>
              Skip and every skill opens at level 1 and climbs from what you
              practise. You can take the assessment whenever you like — it's
              waiting on your profile.
            </p>
          </div>

          {skipError && (
            <p className={s.error} role="alert">
              {skipError}
            </p>
          )}
        </section>

        <JoinClassCard />
      </div>
    </div>
  );
}

export default StudentWelcome;
