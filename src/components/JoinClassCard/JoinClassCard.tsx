import React, { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { getStudentClassrooms, joinClassroom } from '../../lib/api';
import { takePendingClassCode } from '../../lib/pendingClassCode';
import { useCopy } from '../../lib/useCopy';
import type { Classroom } from '../../types';
import s from './JoinClassCard.module.css';

interface JoinClassCardProps {
  /**
   * Fired after a successful join. Whether a student is in a class changes what
   * the app shows them — Homework appears, the placement stops being theirs to
   * see — so the page above has to hear about it, not wait for a reload.
   */
  onJoined?: () => void;
}

export function JoinClassCard({ onJoined }: JoinClassCardProps = {}) {
  const { session } = useAuth();
  const userId = session!.user.id;

  const [classes, setClasses] = useState<Classroom[]>([]);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const { copied, copy } = useCopy();

  const reload = async () => {
    const res = await getStudentClassrooms(userId);
    if (res.ok) setClasses(res.data);
  };

  useEffect(() => { void reload(); }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const pending = takePendingClassCode();
    if (!pending) return;
    setCode(pending);
    setMsg({
      kind: 'err',
      text: `We couldn’t join class ${pending} during sign-up. Check the code and try again.`,
    });
  }, []);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setMsg(null);
    const { classroom, error } = await joinClassroom(code.trim().toUpperCase());
    setBusy(false);
    if (error) {
      setMsg({ kind: 'err', text: error.includes('No classroom') ? 'No class found with that code.' : error });
      return;
    }
    setMsg({ kind: 'ok', text: `Joined ${classroom?.name}!` });
    setCode('');
    void reload();
    onJoined?.();
  }

  async function handleCopy(joinCode: string) {
    if (await copy(joinCode)) return;
    setMsg({ kind: 'err', text: `Couldn’t copy automatically — the code is ${joinCode}.` });
  }

  return (
    <div className={s.card}>
      <div className={s.title}>Your classes</div>
      {classes.length === 0 && <div className={s.empty}>You haven’t joined a class yet.</div>}

      {classes.length > 0 && (
        <div className={s.chips}>
          {classes.map((c) => (
            <span key={c.id} className={s.chip}>
              {c.name} · <span className={s.chipCode}>{c.join_code}</span>
              <button
                type="button"
                className={s.copyBtn}
                onClick={() => void handleCopy(c.join_code)}
                aria-label={`Copy the join code for ${c.name}`}
              >
                {copied === c.join_code ? 'Copied!' : 'Copy'}
              </button>
            </span>
          ))}
        </div>
      )}

      <form onSubmit={handleJoin} className={s.form}>
        <input
          className={s.input}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Enter class code"
          maxLength={6}
          aria-label="Class code"
        />
        <button type="submit" className={s.joinBtn} disabled={busy}>
          {busy ? 'Joining…' : 'Join class'}
        </button>
      </form>

      {msg && (
        <div className={`${s.msg} ${msg.kind === 'ok' ? s.msgOk : s.msgErr}`} role="status">
          {msg.text}
        </div>
      )}
    </div>
  );
}

export default JoinClassCard;
