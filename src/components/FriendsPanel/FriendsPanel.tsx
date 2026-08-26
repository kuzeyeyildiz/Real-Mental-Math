import { useCallback, useState } from 'react';
import { PanelError, PanelLoading } from '../panels/PanelState';
import { useFetched } from '../../lib/useFetched';
import {
  cancelFriendRequest,
  getClassmates,
  getFriends,
  removeFriend,
  respondFriendRequest,
  sendFriendRequest,
} from '../../lib/socialApi';
import { getMyWeeklyXp } from '../../lib/leagueApi';
import { filterClassmates, friendBoard, type Classmate, type Friend } from '../../engine/friends';
import type { Written } from '../../lib/result';
import p from '../panels/panels.module.css';
import s from './FriendsPanel.module.css';

interface FriendsPanelProps {
  studentId: string;
  myName: string;
  myXp: number;
  /** Lets the header bell pick up an invitation the student just answered. */
  onSocialChange?: () => void;
}

const MEDALS = ['🥇', '🥈', '🥉'];

export function FriendsPanel({ studentId, myName, myXp, onSocialChange }: FriendsPanelProps) {
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [mates, friends, weekly] = await Promise.all([
      getClassmates(),
      getFriends(),
      getMyWeeklyXp(myXp),
    ]);
    if (!mates.ok) return mates;
    if (!friends.ok) return friends;
    if (!weekly.ok) return weekly;
    return {
      ok: true as const,
      data: { mates: mates.data, friends: friends.data, myWeeklyXp: weekly.data },
    };
  }, [myXp]);

  const { state, reload } = useFetched(load, studentId);

  /** Every action is the same shape: run it, surface the reason, re-read. */
  const act = useCallback(
    async (id: string, run: () => Promise<Written>) => {
      setBusyId(id);
      setError(null);
      const { error: err } = await run();
      setBusyId(null);
      if (err) {
        setError(err);
        return;
      }
      await reload();
      onSocialChange?.();
    },
    [reload, onSocialChange]
  );

  if (state.status === 'loading') return <PanelLoading label="Loading your friends…" />;
  if (state.status === 'error') {
    return (
      <PanelError title="Couldn’t load your friends" message={state.message} onRetry={() => void reload()} />
    );
  }

  const { mates, friends, myWeeklyXp } = state.data;
  // A pending row always carries its request id; requiring it here means the
  // Accept button can never be rendered without something to accept.
  const pending = (relation: Classmate['relation']) =>
    mates.flatMap((m) =>
      m.relation === relation && m.requestId ? [{ ...m, requestId: m.requestId }] : []
    );
  const incoming = pending('incoming');
  const outgoing = pending('outgoing');
  const addable = filterClassmates(
    mates.filter((m) => m.relation === 'none'),
    query
  );
  const board = friendBoard(friends, { id: studentId, name: myName, xp: myXp, weeklyXp: myWeeklyXp });
  const hidden = friends.filter((f) => !f.ranked).length;

  return (
    <div className={p.panel}>
      <div className={p.panelHead}>
        <div>
          <h2 className={p.panelTitle}>Friends</h2>
          <p className={p.panelSub}>
            You can add anyone in your classes. Numo has no way to search for people
            outside them.
          </p>
        </div>
      </div>

      {error && <div className={p.error} role="alert">{error}</div>}

      {incoming.length > 0 && (
        <section>
          <h3 className={s.heading}>Waiting for your answer</h3>
          <ul className={s.list}>
            {incoming.map((mate) => (
              <li key={mate.id} className={s.row}>
                <Avatar name={mate.fullName} />
                <div className={s.who}>
                  <span className={s.name}>{mate.fullName}</span>
                  <span className={s.meta}>would like to be friends</span>
                </div>
                <div className={s.actions}>
                  <button
                    type="button"
                    className={p.btn}
                    disabled={busyId === mate.id}
                    onClick={() =>
                      void act(mate.id, () => respondFriendRequest(mate.requestId, true))
                    }
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className={p.btnQuiet}
                    disabled={busyId === mate.id}
                    onClick={() =>
                      void act(mate.id, () => respondFriendRequest(mate.requestId, false))
                    }
                  >
                    No thanks
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className={s.heading}>
          Your friends {friends.length > 0 && <span className={s.count}>{friends.length}</span>}
        </h3>

        {friends.length === 0 ? (
          <div className={p.empty}>
            No friends yet. Find a classmate below and send them an invitation.
          </div>
        ) : (
          <>
            <ol className={s.board}>
              {board.map((row) => (
                <li key={row.id} className={`${s.boardRow} ${row.isMe ? s.boardMe : ''}`}>
                  <span className={s.position}>
                    {/* A podium place has to be earned — before anyone has scored
                        this week everyone is tied on zero. */}
                    {row.position <= 3 && row.weeklyXp > 0 ? MEDALS[row.position - 1] : row.position}
                  </span>
                  <Avatar name={row.name} />
                  <span className={s.name}>
                    {row.name}
                    {row.isMe && <span className={s.youTag}>you</span>}
                  </span>
                  <span className={s.xp}>{row.weeklyXp} XP</span>
                </li>
              ))}
            </ol>
            {hidden > 0 && (
              <p className={p.hint}>
                {hidden === 1 ? 'One friend is' : `${hidden} friends are`} not shown in the table —
                their teacher has class rankings switched off.
              </p>
            )}

            <ul className={s.list}>
              {friends.map((friend) => (
                <FriendRow
                  key={friend.id}
                  friend={friend}
                  busy={busyId === friend.id}
                  onRemove={() => void act(friend.id, () => removeFriend(studentId, friend.id))}
                />
              ))}
            </ul>
          </>
        )}
      </section>

      {outgoing.length > 0 && (
        <section>
          <h3 className={s.heading}>Invitations you sent</h3>
          <ul className={s.list}>
            {outgoing.map((mate) => (
              <li key={mate.id} className={s.row}>
                <Avatar name={mate.fullName} />
                <div className={s.who}>
                  <span className={s.name}>{mate.fullName}</span>
                  <span className={s.meta}>waiting for an answer</span>
                </div>
                <button
                  type="button"
                  className={p.btnQuiet}
                  disabled={busyId === mate.id}
                  onClick={() => void act(mate.id, () => cancelFriendRequest(mate.requestId))}
                >
                  Take back
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className={s.heading}>Add a classmate</h3>
        {mates.length === 0 ? (
          <div className={p.empty}>
            You aren’t in a class with anyone else yet. Join a class with the code your
            teacher gave you, and your classmates will appear here.
          </div>
        ) : (
          <>
            <label className={p.srOnly} htmlFor="friend-search">
              Search your classmates by name
            </label>
            <input
              id="friend-search"
              className={p.input}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your classmates"
              autoComplete="off"
            />
            {addable.length === 0 ? (
              <p className={p.hint}>
                {query.trim()
                  ? 'Nobody in your classes goes by that name.'
                  : 'You have already added everyone in your classes.'}
              </p>
            ) : (
              <ul className={s.list}>
                {addable.map((mate) => (
                  <li key={mate.id} className={s.row}>
                    <Avatar name={mate.fullName} />
                    <div className={s.who}>
                      <span className={s.name}>{mate.fullName}</span>
                      {mate.grade && <span className={s.meta}>Grade {mate.grade}</span>}
                    </div>
                    <button
                      type="button"
                      className={p.btnGhost}
                      disabled={busyId === mate.id}
                      onClick={() => void act(mate.id, () => sendFriendRequest(mate.id))}
                    >
                      {busyId === mate.id ? 'Sending…' : 'Add friend'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function FriendRow({
  friend,
  busy,
  onRemove,
}: {
  friend: Friend;
  busy: boolean;
  onRemove: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <li className={s.row}>
      <Avatar name={friend.fullName} />
      <div className={s.who}>
        <span className={s.name}>{friend.fullName}</span>
        <span className={s.meta}>
          {friend.ranked ? `${friend.xp} XP all time` : 'Rankings off in your class'}
        </span>
      </div>
      {confirming ? (
        <div className={s.actions}>
          <button type="button" className={p.btnDanger} disabled={busy} onClick={onRemove}>
            Remove
          </button>
          <button type="button" className={p.btnQuiet} onClick={() => setConfirming(false)}>
            Keep
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={p.btnQuiet}
          onClick={() => setConfirming(true)}
          aria-label={`Remove ${friend.fullName} from your friends`}
        >
          Remove
        </button>
      )}
    </li>
  );
}

/** Initials rather than a photo: nothing here should carry a picture of a child. */
function Avatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((word) => word[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <span className={s.avatar} aria-hidden="true">
      {initials || '?'}
    </span>
  );
}

export default FriendsPanel;
