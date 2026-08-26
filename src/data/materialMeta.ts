import type { MaterialCategory, MaterialKind, MaterialVisibility } from '../types';

/**
 * One source of truth for how learning material is labelled. The keys match the
 * database check constraints exactly, so adding a category means editing both —
 * which is the point: a category students can filter by is a promise that the
 * value in the column is one of a known set.
 */

export const MATERIAL_CATEGORIES: readonly MaterialCategory[] = [
  'strategy',
  'worksheet',
  'reference',
  'practice',
  'exam',
  'enrichment',
  'other',
];

export const CATEGORY_META: Record<
  MaterialCategory,
  { label: string; icon: string; hint: string }
> = {
  strategy: {
    label: 'Method & strategy',
    icon: '🧠',
    hint: 'How to do it in your head — doubling, compensating, splitting.',
  },
  worksheet: {
    label: 'Worksheet',
    icon: '📄',
    hint: 'Something to print or work through.',
  },
  reference: {
    label: 'Reference',
    icon: '📐',
    hint: 'Times tables, number facts, anything to look up.',
  },
  practice: {
    label: 'Extra practice',
    icon: '🔁',
    hint: 'More of the same, for anyone who wants it.',
  },
  exam: {
    label: 'Exam prep',
    icon: '📝',
    hint: 'Past papers, revision lists, what to expect.',
  },
  enrichment: {
    label: 'Puzzles & enrichment',
    icon: '🧩',
    hint: 'Going further than the lesson needs.',
  },
  other: {
    label: 'Other',
    icon: '📎',
    hint: 'Anything that does not fit the rest.',
  },
};

export const MATERIAL_KINDS: readonly MaterialKind[] = ['file', 'link', 'note', 'video'];

export const KIND_META: Record<MaterialKind, { label: string; icon: string }> = {
  file: { label: 'File', icon: '📁' },
  link: { label: 'Link', icon: '🔗' },
  note: { label: 'Note', icon: '🗒️' },
  video: { label: 'Video', icon: '🎬' },
};

export const VISIBILITY_META: Record<
  MaterialVisibility,
  { label: string; short: string; hint: string }
> = {
  class: {
    label: 'Public to the class',
    short: 'Class',
    hint: 'Everyone in this classroom can open it.',
  },
  private: {
    label: 'Private to you',
    short: 'Private',
    hint: 'Only you can see it. Use this while you are still preparing something.',
  },
};
