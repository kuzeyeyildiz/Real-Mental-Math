import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  createLinkMaterial,
  createNoteMaterial,
  createVideoMaterial,
  deleteMaterial,
  getMaterialDownloadUrl,
  getMaterials,
  setMaterialVisibility,
  uploadFileMaterial,
  MAX_MATERIAL_BYTES,
  type MaterialMeta,
} from '../../lib/classroomApi';
import { useFetched } from '../../lib/useFetched';
import { PanelError, PanelLoading } from '../panels/PanelState';
import { VideoEmbed } from '../VideoEmbed/VideoEmbed';
import { formatAgo, formatBytes } from '../../engine/assignmentEngine';
import { isEmbeddableVideo, VIDEO_HOSTS_HINT } from '../../engine/videoEmbed';
import {
  CATEGORY_META,
  KIND_META,
  MATERIAL_CATEGORIES,
  MATERIAL_KINDS,
  VISIBILITY_META,
} from '../../data/materialMeta';
import type { Material, MaterialCategory, MaterialKind, MaterialVisibility } from '../../types';
import p from '../panels/panels.module.css';
import s from './MaterialsPanel.module.css';

interface MaterialsPanelProps {
  classroomId: string;
  /** Required to add material; students pass null and get a read-only view. */
  teacherId: string | null;
  canManage: boolean;
}

/** `null` is the "everything" pill rather than a category of its own. */
type Filter = MaterialCategory | null;

const NO_MATERIALS: Material[] = [];

export function MaterialsPanel({ classroomId, teacherId, canManage }: MaterialsPanelProps) {
  const load = useCallback(() => getMaterials(classroomId), [classroomId]);
  const { state, reload } = useFetched<Material[]>(load, classroomId);

  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<MaterialKind>('file');
  const [category, setCategory] = useState<MaterialCategory>('strategy');
  const [visibility, setVisibility] = useState<MaterialVisibility>('class');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [filter, setFilter] = useState<Filter>(null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // A shared empty array, so the memo below isn't invalidated by a fresh `[]`
  // on every render while the panel is still loading.
  const items = state.status === 'ready' ? state.data : NO_MATERIALS;

  /** Only offer a category pill when something is actually filed under it. */
  const present = useMemo(() => {
    const counts = new Map<MaterialCategory, number>();
    for (const item of items) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    return MATERIAL_CATEGORIES.filter((c) => counts.has(c)).map((c) => ({
      category: c,
      count: counts.get(c) ?? 0,
    }));
  }, [items]);

  const visible = filter ? items.filter((m) => m.category === filter) : items;

  function resetForm() {
    setTitle('');
    setDescription('');
    setUrl('');
    setBody('');
    setFile(null);
    setCategory('strategy');
    setVisibility('class');
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!teacherId || !title.trim()) return;

    // Refusing here rather than after the write: a video whose host cannot be
    // framed would be saved and then silently render as a bare link.
    if (kind === 'video' && !isEmbeddableVideo(url)) {
      setError(`That link can’t be embedded. ${VIDEO_HOSTS_HINT}`);
      return;
    }

    setBusy(true);
    setError(null);
    const meta: MaterialMeta = {
      classroomId,
      teacherId,
      title: title.trim(),
      description: description.trim() || null,
      category,
      visibility,
    };

    let result: { error: string | null };
    if (kind === 'file') {
      if (!file) {
        setBusy(false);
        setError('Choose a file to upload.');
        return;
      }
      result = await uploadFileMaterial(meta, file);
    } else if (kind === 'link') {
      result = await createLinkMaterial(meta, url.trim());
    } else if (kind === 'video') {
      result = await createVideoMaterial(meta, url.trim());
    } else {
      result = await createNoteMaterial(meta, body.trim());
    }

    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    resetForm();
    setOpen(false);
    void reload();
  }

  async function handleOpenFile(material: Material) {
    if (!material.storage_path) return;
    setError(null);
    const res = await getMaterialDownloadUrl(material.storage_path);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    window.open(res.data, '_blank', 'noopener,noreferrer');
  }

  async function handleDelete(material: Material) {
    setError(null);
    setBusyId(material.id);
    const { error: err } = await deleteMaterial(material);
    setBusyId(null);
    if (err) {
      setError(err);
      return;
    }
    void reload();
  }

  async function handleToggleVisibility(material: Material) {
    setError(null);
    setBusyId(material.id);
    const next: MaterialVisibility = material.visibility === 'class' ? 'private' : 'class';
    const { error: err } = await setMaterialVisibility(material.id, next);
    setBusyId(null);
    if (err) {
      setError(err);
      return;
    }
    void reload();
  }

  if (state.status === 'loading') return <PanelLoading label="Loading learning material…" />;
  if (state.status === 'error') {
    return (
      <PanelError
        title="Couldn't load learning material"
        message={state.message}
        onRetry={() => void reload()}
      />
    );
  }

  return (
    <div className={p.panel}>
      <div className={p.panelHead}>
        <div>
          <h2 className={p.panelTitle}>Learning material</h2>
          <p className={p.panelSub}>
            {canManage
              ? 'Worksheets, videos, links and method notes. Everything is filed under a topic, and a draft stays private to you until you publish it.'
              : 'Worksheets, videos, links and notes your teacher has shared with this class.'}
          </p>
        </div>
        {canManage && (
          <button type="button" className={p.btn} onClick={() => setOpen((v) => !v)}>
            {open ? 'Cancel' : 'Add material'}
          </button>
        )}
      </div>

      {error && <div className={p.error} role="alert">{error}</div>}

      {canManage && open && (
        <form className={p.form} onSubmit={handleAdd}>
          <div className={p.field}>
            <span className={p.label} id="material-kind-label">Type</span>
            <div className={p.chips} role="group" aria-labelledby="material-kind-label">
              {MATERIAL_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`${p.chip} ${kind === k ? p.chipOn : ''}`}
                  onClick={() => setKind(k)}
                  aria-pressed={kind === k}
                >
                  <span aria-hidden="true">{KIND_META[k].icon}</span>
                  {KIND_META[k].label}
                </button>
              ))}
            </div>
          </div>

          <div className={p.field}>
            <label className={p.label} htmlFor="material-category">Topic</label>
            <select
              id="material-category"
              className={p.select}
              value={category}
              onChange={(e) => setCategory(e.target.value as MaterialCategory)}
            >
              {MATERIAL_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_META[c].icon} {CATEGORY_META[c].label}
                </option>
              ))}
            </select>
            <span className={p.hint}>{CATEGORY_META[category].hint}</span>
          </div>

          <div className={p.field}>
            <span className={p.label} id="material-visibility-label">Who can see it</span>
            <div className={p.chips} role="group" aria-labelledby="material-visibility-label">
              {(['class', 'private'] as MaterialVisibility[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`${p.chip} ${visibility === v ? p.chipOn : ''}`}
                  onClick={() => setVisibility(v)}
                  aria-pressed={visibility === v}
                >
                  {VISIBILITY_META[v].label}
                </button>
              ))}
            </div>
            <span className={p.hint}>{VISIBILITY_META[visibility].hint}</span>
          </div>

          <div className={p.field}>
            <label className={p.label} htmlFor="material-title">Title</label>
            <input
              id="material-title"
              className={p.input}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Doubling and halving worksheet"
              maxLength={140}
              required
            />
          </div>

          <div className={p.field}>
            <label className={p.label} htmlFor="material-description">Description (optional)</label>
            <input
              id="material-description"
              className={p.input}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
            />
          </div>

          {kind === 'file' && (
            <div className={p.field}>
              <label className={p.label} htmlFor="material-file">File</label>
              <input
                id="material-file"
                ref={fileRef}
                className={p.input}
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <span className={p.hint}>Up to {formatBytes(MAX_MATERIAL_BYTES)} per file.</span>
            </div>
          )}

          {(kind === 'link' || kind === 'video') && (
            <div className={p.field}>
              <label className={p.label} htmlFor="material-url">
                {kind === 'video' ? 'Video link' : 'Link'}
              </label>
              <input
                id="material-url"
                className={p.input}
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
                required
              />
              {kind === 'video' && (
                <span className={p.hint}>
                  {VIDEO_HOSTS_HINT} Students watch it inside Numo, without leaving for the
                  video site.
                </span>
              )}
            </div>
          )}

          {kind === 'note' && (
            <div className={p.field}>
              <label className={p.label} htmlFor="material-body">Note</label>
              <textarea
                id="material-body"
                className={p.textarea}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write the method out in your own words."
                maxLength={2000}
                required
              />
            </div>
          )}

          <button type="submit" className={p.btn} disabled={busy || !title.trim()}>
            {busy ? 'Saving…' : 'Add material'}
          </button>
        </form>
      )}

      {items.length === 0 && !open && (
        <div className={p.empty}>
          {canManage
            ? 'Nothing shared yet. Add a worksheet, a video, a link or a note.'
            : 'Your teacher hasn’t shared anything with this class yet.'}
        </div>
      )}

      {present.length > 1 && (
        <nav className={s.filters} aria-label="Filter by topic">
          <button
            type="button"
            className={`${s.filter} ${filter === null ? s.filterOn : ''}`}
            onClick={() => setFilter(null)}
            aria-pressed={filter === null}
          >
            Everything <span className={s.filterCount}>{items.length}</span>
          </button>
          {present.map(({ category: c, count }) => (
            <button
              key={c}
              type="button"
              className={`${s.filter} ${filter === c ? s.filterOn : ''}`}
              onClick={() => setFilter(c)}
              aria-pressed={filter === c}
            >
              <span aria-hidden="true">{CATEGORY_META[c].icon}</span>
              {CATEGORY_META[c].label}
              <span className={s.filterCount}>{count}</span>
            </button>
          ))}
        </nav>
      )}

      <div className={p.list}>
        {visible.map((material) => (
          <div key={material.id} className={p.card}>
            <div className={p.cardHead}>
              <div>
                <div className={p.cardTitle}>{material.title}</div>
                <div className={p.cardMeta}>
                  <span className={`${p.pill} ${p.pillInfo}`}>
                    <span aria-hidden="true">{CATEGORY_META[material.category].icon}</span>{' '}
                    {CATEGORY_META[material.category].label}
                  </span>
                  <span>
                    {KIND_META[material.kind].icon} {KIND_META[material.kind].label}
                  </span>
                  {material.kind === 'file' && material.file_size != null && (
                    <span>· {formatBytes(material.file_size)}</span>
                  )}
                  <span>· added {formatAgo(material.created_at)}</span>
                  {material.visibility === 'private' && (
                    <span className={`${p.pill} ${p.pillWarn}`}>Private draft</span>
                  )}
                </div>
              </div>
              {canManage && (
                <div className={s.cardActions}>
                  <button
                    type="button"
                    className={p.btnQuiet}
                    disabled={busyId === material.id}
                    onClick={() => void handleToggleVisibility(material)}
                  >
                    {material.visibility === 'class' ? 'Make private' : 'Publish to class'}
                  </button>
                  <button
                    type="button"
                    className={`${p.btnQuiet} ${p.btnDanger}`}
                    disabled={busyId === material.id}
                    onClick={() => void handleDelete(material)}
                    aria-label={`Delete ${material.title}`}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>

            {material.description && <div className={p.cardBody}>{material.description}</div>}
            {material.kind === 'note' && material.body && (
              <div className={p.cardBody}>{material.body}</div>
            )}

            {material.kind === 'video' && (
              <VideoEmbed url={material.url} title={material.title} />
            )}

            {material.kind === 'file' && (
              <button
                type="button"
                className={`${p.btn} ${p.btnGhost} ${p.cardAction}`}
                onClick={() => void handleOpenFile(material)}
              >
                Open {material.file_name ?? 'file'}
              </button>
            )}

            {material.kind === 'link' && material.url && (
              <a
                className={`${p.btn} ${p.btnGhost} ${p.cardAction}`}
                href={material.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open link
              </a>
            )}
          </div>
        ))}
      </div>

      {items.length > 0 && visible.length === 0 && (
        <div className={p.empty}>Nothing filed under that topic.</div>
      )}
    </div>
  );
}

export default MaterialsPanel;
