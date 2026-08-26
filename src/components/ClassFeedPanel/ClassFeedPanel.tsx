import React, { useCallback, useMemo, useState } from 'react';
import {
  createPost,
  deletePost,
  getClassroomFeed,
  type FeedSources,
} from '../../lib/classroomApi';
import { useFetched } from '../../lib/useFetched';
import { PanelError, PanelLoading } from '../panels/PanelState';
import { VideoEmbed } from '../VideoEmbed/VideoEmbed';
import {
  buildFeed,
  feedCounts,
  groupFeedByDay,
  FEED_META,
  type FeedItem,
  type FeedKind,
} from '../../engine/feed';
import { timeAgo } from '../../engine/notifications';
import { CATEGORY_META } from '../../data/materialMeta';
import type { Assignment, Material } from '../../types';
import p from '../panels/panels.module.css';
import s from './ClassFeedPanel.module.css';

interface ClassFeedPanelProps {
  classroomId: string;
  userId: string;
  /** Posting is teacher-only; students read the feed. */
  canPost: boolean;
}

/** `null` is the "everything" pill rather than a kind of its own. */
type Filter = FeedKind | null;

const KIND_ORDER: FeedKind[] = ['post', 'assignment', 'material', 'session'];

export function ClassFeedPanel({ classroomId, userId, canPost }: ClassFeedPanelProps) {
  const load = useCallback(() => getClassroomFeed(classroomId), [classroomId]);
  const { state, reload } = useFetched<FeedSources>(load, classroomId);

  const [body, setBody] = useState('');
  const [filter, setFilter] = useState<Filter>(null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sources = state.status === 'ready' ? state.data : null;

  const items = useMemo(
    () =>
      sources
        ? buildFeed(sources.posts, sources.assignments, sources.materials, sources.sessions, {
            categoryLabel: (c) => CATEGORY_META[c].label,
            sessionMembers: (id) => sources.sessionMembers[id] ?? 0,
          })
        : [],
    [sources]
  );

  const counts = useMemo(() => feedCounts(items), [items]);
  const visible = filter ? items.filter((item) => item.kind === filter) : items;
  const days = useMemo(() => groupFeedByDay(visible), [visible]);

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    const { error: err } = await createPost(classroomId, userId, body.trim());
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setBody('');
    void reload();
  }

  async function handleDeletePost(postId: string) {
    setError(null);
    setBusyId(postId);
    const { error: err } = await deletePost(postId);
    setBusyId(null);
    if (err) {
      setError(err);
      return;
    }
    void reload();
  }

  if (state.status === 'loading') return <PanelLoading label="Loading the class feed…" />;
  if (state.status === 'error') {
    return (
      <PanelError
        title="Couldn't load the class feed"
        message={state.message}
        onRetry={() => void reload()}
      />
    );
  }

  return (
    <div className={p.panel}>
      <div className={p.panelHead}>
        <div>
          <h2 className={p.panelTitle}>Class feed</h2>
          <p className={p.panelSub}>
            Everything that has happened in this class, newest first — announcements, homework,
            material and study sessions.
          </p>
        </div>
      </div>

      {error && <div className={p.error} role="alert">{error}</div>}

      {canPost && (
        <form className={p.form} onSubmit={handlePost}>
          <div className={p.field}>
            <label className={p.label} htmlFor="feed-post">Post an announcement</label>
            <textarea
              id="feed-post"
              className={p.textarea}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Something the whole class should see."
              maxLength={2000}
            />
          </div>
          <button type="submit" className={p.btn} disabled={busy || !body.trim()}>
            {busy ? 'Posting…' : 'Post to class'}
          </button>
        </form>
      )}

      {items.length === 0 ? (
        <div className={p.empty}>
          Nothing here yet.{' '}
          {canPost
            ? 'Post an announcement, or set an assignment — both show up here.'
            : 'Check back once your teacher has posted something.'}
        </div>
      ) : (
        <>
          <nav className={s.filters} aria-label="Filter the feed">
            <button
              type="button"
              className={`${s.filter} ${filter === null ? s.filterOn : ''}`}
              onClick={() => setFilter(null)}
              aria-pressed={filter === null}
            >
              Everything <span className={s.filterCount}>{items.length}</span>
            </button>
            {KIND_ORDER.filter((kind) => counts[kind] > 0).map((kind) => (
              <button
                key={kind}
                type="button"
                className={`${s.filter} ${filter === kind ? s.filterOn : ''}`}
                onClick={() => setFilter(kind)}
                aria-pressed={filter === kind}
              >
                <span aria-hidden="true">{FEED_META[kind].icon}</span>
                {FEED_META[kind].label}
                <span className={s.filterCount}>{counts[kind]}</span>
              </button>
            ))}
          </nav>

          {days.map((day) => (
            <section key={day.bucket} className={s.day}>
              <h3 className={s.dayHeading}>{day.label}</h3>
              {/* A single rail down the column, so a day reads as one run of
                  events rather than a stack of unrelated cards. */}
              <ol className={s.timeline}>
                {day.items.map((item) => (
                  <li key={`${item.kind}-${item.id}`} className={s.entry}>
                    <span className={`${s.marker} ${s[item.kind]}`} aria-hidden="true">
                      {FEED_META[item.kind].icon}
                    </span>
                    <div className={s.card}>
                      <div className={s.cardHead}>
                        <div className={s.cardHeading}>
                          <span className={s.kind}>{FEED_META[item.kind].label}</span>
                          <span className={s.when}>{timeAgo(item.at)}</span>
                        </div>
                        {canPost && item.kind === 'post' && (
                          <button
                            type="button"
                            className={`${p.btnQuiet} ${p.btnDanger}`}
                            disabled={busyId === item.id}
                            onClick={() => void handleDeletePost(item.id)}
                            aria-label="Delete this announcement"
                          >
                            Delete
                          </button>
                        )}
                      </div>

                      {/* An announcement's body is the whole point of it, so it
                          reads as the title rather than as a subtitle. */}
                      {item.kind !== 'post' && <div className={s.title}>{item.title}</div>}
                      {item.body && <p className={s.body}>{item.body}</p>}

                      {item.facts.length > 0 && (
                        <div className={s.facts}>
                          {item.facts.map((fact) => (
                            <span key={fact} className={s.fact}>{fact}</span>
                          ))}
                        </div>
                      )}

                      <FeedMedia item={item} />
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ))}

          {visible.length === 0 && <div className={p.empty}>Nothing of that kind yet.</div>}
        </>
      )}
    </div>
  );
}

/** A video attached to whatever this entry came from, framed in place. */
function FeedMedia({ item }: { item: FeedItem }) {
  if (item.kind === 'assignment') {
    const assignment = item.source as Assignment;
    return assignment.video_url ? (
      <VideoEmbed url={assignment.video_url} title={`Video for ${assignment.title}`} />
    ) : null;
  }
  if (item.kind === 'material') {
    const material = item.source as Material;
    return material.kind === 'video' ? (
      <VideoEmbed url={material.url} title={material.title} />
    ) : null;
  }
  return null;
}

export default ClassFeedPanel;
