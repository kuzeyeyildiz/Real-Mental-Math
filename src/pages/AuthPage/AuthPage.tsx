import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../../components/Logo/Logo';
import { useAuth } from '../../auth/AuthProvider';
import { joinClassroom } from '../../lib/api';
import { PENDING_CLASS_CODE_KEY } from '../../lib/pendingClassCode';
import type { Role } from '../../types';
import s from './AuthPage.module.css';

type Mode = 'login' | 'signup';

const GRADES = ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8'];

export function AuthPage({ initialMode = 'login' }: { initialMode?: Mode }) {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>(initialMode);
  const [role, setRole] = useState<Role>('student');
  const [fullName, setFullName] = useState('');
  const [grade, setGrade] = useState(GRADES[5]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [classCode, setClassCode] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmationNeeded, setConfirmationNeeded] = useState(false);

  const friendlyError = (raw: string): string => {
    if (raw.includes('rate limit')) {
      return 'Too many sign-up emails were sent recently. Wait a bit and try again — or ask your admin to turn off email confirmation in Supabase for instant access.';
    }
    if (raw.toLowerCase().includes('invalid login')) return 'Wrong email or password.';
    if (raw.toLowerCase().includes('already registered')) return 'That email already has an account. Try logging in.';
    if (raw.toLowerCase().includes('email') && raw.toLowerCase().includes('invalid')) {
      return 'That email address looks invalid. Use a real address.';
    }
    return raw;
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    try {
      if (mode === 'login') {
        const { error } = await signIn(email.trim(), password);
        if (error) {
          setError(friendlyError(error));
          return;
        }
        navigate('/');
        return;
      }

      // signup
      if (!fullName.trim()) {
        setError('Please enter your name.');
        return;
      }
      const { error, signedIn, needsConfirmation } = await signUp({
        email: email.trim(),
        password,
        fullName: fullName.trim(),
        role,
        grade: role === 'student' ? grade : undefined,
      });
      if (error) {
        setError(friendlyError(error));
        return;
      }
      if (needsConfirmation) {
        setConfirmationNeeded(true);
        return;
      }
      if (signedIn) {
        // Student joining a class via code (optional). This page unmounts as
        // soon as the session lands, so a failure is handed to the Studio's
        // join card rather than being dropped.
        if (role === 'student' && classCode.trim()) {
          const code = classCode.trim().toUpperCase();
          const { error: joinError } = await joinClassroom(code);
          if (joinError) sessionStorage.setItem(PENDING_CLASS_CODE_KEY, code);
        }
        navigate('/');
      }
    } finally {
      setBusy(false);
    }
  }

  /**
   * The dark half. Three lines lifted from the README's "A few things that are
   * deliberate" — the parts a teacher deciding whether to trust this with a
   * class would actually want to know.
   */
  const marketing = (
    <aside className={s.pitch}>
      <div className={s.pitchLogo}>
        <Logo size={38} showWordmark variant="on-dark" />
      </div>
      <div>
        <h1 className={s.pitchTitle}>Mental maths<br />for classrooms.</h1>
        <p className={s.pitchBody}>
          Students climb a per-skill level ladder by answering timed arithmetic.
          Teachers run classrooms, set homework, share material and watch progress.
        </p>
      </div>
      <ul className={s.points}>
        {[
          'The clock starts when the student asks for the question, not when the screen appears.',
          'Levels get gradually more expensive, so there is no sugar rush at the bottom and no wall at the top.',
          'Access rules live in the database, not the interface — hiding something is never the only thing stopping it.',
        ].map((line) => (
          <li key={line} className={s.point}>
            <span className={s.tick} aria-hidden="true">✓</span>
            {line}
          </li>
        ))}
      </ul>
    </aside>
  );

  if (confirmationNeeded) {
    return (
      <div className={s.page}>
        {marketing}
        <div className={s.formPane}>
          <div className={s.card}>
            <div className={s.notice}>
              <span className={s.noticeTitle}>Check your email</span>
              We sent a confirmation link to <strong>{email}</strong>. Click it, then come back and log in.
            </div>
            <div className={s.footHint}>
              <button className={s.linkBtn} onClick={() => { setConfirmationNeeded(false); setMode('login'); }}>
                Back to log in
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={s.page}>
      {marketing}

      <div className={s.formPane}>
      <form className={s.card} onSubmit={handleSubmit}>
        {/* Only visible once the dark half has dropped, so the page never
            arrives without saying whose it is. */}
        <div className={s.cardLogo}><Logo size={34} showWordmark /></div>

        <div className={s.tabs} role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'login'}
            className={`${s.tab} ${mode === 'login' ? s.tabActive : ''}`}
            onClick={() => { setMode('login'); setError(null); }}>
            Log in
          </button>
          <button type="button" role="tab" aria-selected={mode === 'signup'}
            className={`${s.tab} ${mode === 'signup' ? s.tabActive : ''}`}
            onClick={() => { setMode('signup'); setError(null); }}>
            Sign up
          </button>
        </div>

        {error && <div className={s.error} role="alert">{error}</div>}

        {mode === 'signup' && (
          <>
            <div className={s.roleRow}>
              <button type="button" className={`${s.roleBtn} ${role === 'student' ? s.roleBtnActive : ''}`}
                onClick={() => setRole('student')} aria-pressed={role === 'student'}>
                <span className={s.roleLabel}>Student</span>
                <span className={s.roleHint}>Practice & level up</span>
              </button>
              <button type="button" className={`${s.roleBtn} ${role === 'teacher' ? s.roleBtnActive : ''}`}
                onClick={() => setRole('teacher')} aria-pressed={role === 'teacher'}>
                <span className={s.roleLabel}>Teacher</span>
                <span className={s.roleHint}>Create a classroom</span>
              </button>
            </div>

            <div className={s.field}>
              <label className={s.label} htmlFor="fullName">Full name</label>
              <input id="fullName" className={s.input} value={fullName}
                onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Aylin Yılmaz" required
                autoComplete="name" />
            </div>

            {role === 'student' && (
              <div className={s.field}>
                <label className={s.label} htmlFor="grade">Grade</label>
                <select id="grade" className={s.select} value={grade} onChange={(e) => setGrade(e.target.value)}>
                  {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
            )}
          </>
        )}

        <div className={s.field}>
          <label className={s.label} htmlFor="email">Email</label>
          <input id="email" type="email" className={s.input} value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required autoComplete="email" />
        </div>

        <div className={s.field}>
          <label className={s.label} htmlFor="password">Password</label>
          <input id="password" type="password" className={s.input} value={password}
            onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required
            minLength={6} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        </div>

        {mode === 'signup' && role === 'student' && (
          <div className={s.field}>
            <label className={s.label} htmlFor="classCode">Class code <span style={{ color: 'var(--color-muted)', fontWeight: 500 }}>(optional)</span></label>
            <input id="classCode" className={s.input} value={classCode}
              onChange={(e) => setClassCode(e.target.value.toUpperCase())}
              placeholder="Join your teacher's class" maxLength={6} style={{ textTransform: 'uppercase' }} />
          </div>
        )}

        <button type="submit" className={s.submit} disabled={busy}>
          {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
        </button>

        <div className={s.footHint}>
          {mode === 'login' ? (
            <>New here? <button type="button" className={s.linkBtn} onClick={() => setMode('signup')}>Create an account</button></>
          ) : (
            <>Already have an account? <button type="button" className={s.linkBtn} onClick={() => setMode('login')}>Log in</button></>
          )}
        </div>
      </form>
      </div>
    </div>
  );
}

export default AuthPage;
