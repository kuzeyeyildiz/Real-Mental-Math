import { describe, it, expect } from 'vitest';
import {
  buildFeed,
  dayLabel,
  feedCounts,
  feedDayKey,
  groupFeedByDay,
  FEED_LIMIT,
} from './feed';
import type { Assignment, Material, Post, StudySession } from '../types';

const NOW = new Date('2026-03-18T14:00:00').getTime();
const at = (iso: string) => new Date(iso).toISOString();

const post = (over: Partial<Post> = {}): Post => ({
  id: 'p1',
  classroom_id: 'c1',
  author_id: 't1',
  body: 'Bring your times tables tomorrow.',
  created_at: at('2026-03-18T09:00:00'),
  ...over,
});

const assignment = (over: Partial<Assignment> = {}): Assignment => ({
  id: 'a1',
  classroom_id: 'c1',
  teacher_id: 't1',
  title: 'Times tables warm-up',
  instructions: null,
  video_url: null,
  kind: 'generated',
  areas: ['mul'],
  question_count: 10,
  level_override: null,
  due_at: null,
  created_at: at('2026-03-18T10:00:00'),
  ...over,
});

const material = (over: Partial<Material> = {}): Material => ({
  id: 'm1',
  classroom_id: 'c1',
  teacher_id: 't1',
  title: 'Doubling and halving',
  description: null,
  kind: 'note',
  category: 'strategy',
  visibility: 'class',
  storage_path: null,
  file_name: null,
  file_size: null,
  url: null,
  body: 'Halve one, double the other.',
  created_at: at('2026-03-17T10:00:00'),
  ...over,
});

const session = (over: Partial<StudySession> = {}): StudySession => ({
  id: 's1',
  classroom_id: 'c1',
  host_id: 'st1',
  title: 'Revision together',
  note: null,
  areas: ['add'],
  scheduled_at: at('2026-03-20T16:00:00'),
  created_at: at('2026-03-16T10:00:00'),
  ...over,
});

describe('buildFeed', () => {
  it('puts the newest thing first, whatever table it came from', () => {
    const items = buildFeed([post()], [assignment()], [material()], [session()], { now: NOW });
    expect(items.map((i) => i.kind)).toEqual(['assignment', 'post', 'material', 'session']);
  });

  it('describes an assignment by what a student needs to know about it', () => {
    const [item] = buildFeed(
      [],
      [assignment({ due_at: at('2026-03-19T09:00:00'), video_url: 'https://youtu.be/abc' })],
      [],
      [],
      { now: NOW }
    );
    expect(item.title).toBe('Times tables warm-up');
    expect(item.facts).toContain('10 questions');
    expect(item.facts).toContain('due tomorrow');
    expect(item.facts).toContain('has a video');
  });

  it('says who wrote a custom set and calls a mixed one mixed', () => {
    const custom = buildFeed([], [assignment({ kind: 'custom' })], [], [], { now: NOW });
    expect(custom[0].facts).toContain('written by the teacher');

    const mixed = buildFeed([], [assignment({ kind: 'mixed' })], [], [], { now: NOW });
    expect(mixed[0].facts).toContain('mixed exercises');
  });

  it('reports a past deadline as past rather than as a countdown', () => {
    const [item] = buildFeed(
      [],
      [assignment({ due_at: at('2026-03-16T09:00:00') })],
      [],
      [],
      { now: NOW }
    );
    expect(item.facts.some((f) => f.startsWith('was due '))).toBe(true);
    expect(item.facts.some((f) => f === 'due today' || f.startsWith('due in'))).toBe(false);
  });

  it('labels material by medium and topic', () => {
    const [item] = buildFeed([], [], [material({ kind: 'video' })], [], {
      now: NOW,
      categoryLabel: () => 'Method & strategy',
    });
    expect(item.facts).toEqual(['A video', 'Method & strategy']);
  });

  it('counts who is coming to a session, and stays quiet when nobody is', () => {
    const going = buildFeed([], [], [], [session()], {
      now: NOW,
      sessionMembers: () => 3,
    });
    expect(going[0].facts).toContain('3 going');

    const empty = buildFeed([], [], [], [session()], { now: NOW });
    expect(empty[0].facts.some((f) => f.includes('going'))).toBe(false);
  });

  it('bounds what it returns, so a long-running class still renders one screen', () => {
    const many = Array.from({ length: 200 }, (_, i) =>
      post({ id: `p${i}`, created_at: at(`2026-03-${String((i % 28) + 1).padStart(2, '0')}T09:00:00`) })
    );
    expect(buildFeed(many, [], [], [], { now: NOW })).toHaveLength(FEED_LIMIT);
  });
});

describe('grouping by day', () => {
  it('groups by calendar day, not by a rolling 24 hours', () => {
    // 11pm yesterday and 1am today are two hours apart but different days, and a
    // student reading at 2pm expects to see them under different headings.
    const late = post({ id: 'late', created_at: at('2026-03-17T23:00:00') });
    const early = post({ id: 'early', created_at: at('2026-03-18T01:00:00') });
    const days = groupFeedByDay(buildFeed([late, early], [], [], [], { now: NOW }), NOW);
    expect(days).toHaveLength(2);
    expect(days[0].label).toBe('Today');
    expect(days[1].label).toBe('Yesterday');
  });

  it('keeps every item exactly once', () => {
    const items = buildFeed([post()], [assignment()], [material()], [session()], { now: NOW });
    const grouped = groupFeedByDay(items, NOW).flatMap((d) => d.items);
    expect(grouped).toHaveLength(items.length);
    expect(new Set(grouped.map((i) => `${i.kind}-${i.id}`)).size).toBe(items.length);
  });

  it('names older days rather than counting backwards forever', () => {
    const key = feedDayKey(at('2026-03-10T10:00:00'), NOW);
    const label = dayLabel(key, NOW);
    expect(label).not.toBe('Today');
    expect(label).not.toBe('Yesterday');
    expect(label.length).toBeGreaterThan(4);
  });

  it('handles an empty feed without inventing a day', () => {
    expect(groupFeedByDay([], NOW)).toEqual([]);
  });
});

describe('feedCounts', () => {
  it('counts every kind, including the ones with nothing in them', () => {
    const items = buildFeed([post()], [assignment()], [], [], { now: NOW });
    expect(feedCounts(items)).toEqual({ post: 1, assignment: 1, material: 0, session: 0 });
  });
});
