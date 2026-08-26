import { describe, it, expect } from 'vitest';
import { resolveVideo, isEmbeddableVideo } from './videoEmbed';
import {
  advanceRun,
  beginRunQuestion,
  buildRun,
  checkRunAnswer,
  currentQuestion,
  isLastQuestion,
  questionTargetMs,
  runProgress,
  startRun,
  type RunQuestion,
} from './runner';
import { mixedSequence } from './challengeEngine';
import { skillLevelFromXp } from './skillLadder';
import type { AssignmentQuestion, SkillXp, StudentProgress } from '../types';

const SEED: StudentProgress = {
  xp: 0,
  streak: 0,
  solved: 0,
  counts: { add: 0, sub: 0, mul: 0, div: 0 },
  skillXp: { add: 0, sub: 0, mul: 0, div: 0 },
  bestStreak: 0,
  lightningSolves: 0,
};

const LEVEL_5: SkillXp = { add: 600, sub: 600, mul: 600, div: 600 };

const written = (rows: [string, number, AssignmentQuestion['area']][]): AssignmentQuestion[] =>
  rows.map(([prompt, answer, area], i) => ({
    id: `q${i}`,
    assignment_id: 'a1',
    position: i,
    prompt,
    answer,
    area,
  }));

describe('videoEmbed', () => {
  it('accepts every shape a YouTube link arrives in', () => {
    const ids = [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=42s',
    ].map((url) => resolveVideo(url)?.id);
    expect(new Set(ids)).toEqual(new Set(['dQw4w9WgXcQ']));
  });

  it('sends YouTube through the no-cookie host', () => {
    // The viewers are children, so nothing is written until they press play.
    const embed = resolveVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(embed?.embedUrl).toContain('youtube-nocookie.com');
    expect(embed?.embedUrl).not.toContain('www.youtube.com/embed');
  });

  it('accepts Vimeo, by page or player URL', () => {
    expect(resolveVideo('https://vimeo.com/76979871')?.id).toBe('76979871');
    expect(resolveVideo('https://player.vimeo.com/video/76979871')?.id).toBe('76979871');
    expect(resolveVideo('https://vimeo.com/not-a-number')).toBeNull();
  });

  it('refuses anything not on the list, which is the whole point', () => {
    for (const url of [
      'https://example.com/video.mp4',
      'https://evil.example/youtube.com/watch?v=abc',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'not a url at all',
      '',
      null,
      undefined,
    ]) {
      expect(isEmbeddableVideo(url)).toBe(false);
    }
  });

  it('refuses a host that merely contains an allowed one', () => {
    // youtube.com.evil.example must not pass for youtube.com.
    expect(resolveVideo('https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ')).toBeNull();
  });

  it('keeps ids to characters that are safe in a URL', () => {
    expect(resolveVideo('https://www.youtube.com/watch?v=../../etc/passwd')).toBeNull();
    expect(resolveVideo('https://youtu.be/abc"onload="x')).toBeNull();
  });
});

describe('buildRun', () => {
  it('serves a teacher’s questions in the order they wrote them', () => {
    const questions = buildRun(
      { kind: 'custom', areas: ['add'], question_count: 3, level_override: null },
      SEED.skillXp,
      // Deliberately out of order, as a database read could return them.
      [...written([['First', 1, 'add'], ['Second', 2, 'sub'], ['Third', 3, 'mul']])].reverse()
    );
    expect(questions.map((q) => q.prompt)).toEqual(['First', 'Second', 'Third']);
    expect(questions.map((q) => q.areas[0])).toEqual(['add', 'sub', 'mul']);
  });

  it('credits a written question to the skill the teacher chose', () => {
    const [question] = buildRun(
      { kind: 'custom', areas: ['add'], question_count: 1, level_override: null },
      SEED.skillXp,
      written([['Three buses of 42 children — how many?', 126, 'mul']])
    );
    expect(question.areas).toEqual(['mul']);
    // No decomposition can be derived from a sentence, so no method is claimed.
    expect(question.tip).toBeNull();
  });

  it('generates exactly the requested number for every kind', () => {
    for (const kind of ['generated', 'mixed'] as const) {
      const questions = buildRun(
        { kind, areas: ['add', 'mul'], question_count: 12, level_override: null },
        LEVEL_5
      );
      expect(questions).toHaveLength(12);
      for (const q of questions) {
        expect(q.prompt.length).toBeGreaterThan(0);
        expect(Number.isFinite(q.answer)).toBe(true);
        expect(q.areas.length).toBeGreaterThan(0);
      }
    }
  });

  it('takes the count from the questions that exist, not the stored number', () => {
    // A custom assignment whose question_count disagrees with its rows must serve
    // the rows — a progress bar that promises ten of three would never finish.
    const questions = buildRun(
      { kind: 'custom', areas: ['add'], question_count: 10, level_override: null },
      SEED.skillXp,
      written([['One', 1, 'add'], ['Two', 2, 'add']])
    );
    expect(questions).toHaveLength(2);
  });

  it('honours a pinned level over the student’s own ladder', () => {
    const pinned = buildRun(
      { kind: 'generated', areas: ['add'], question_count: 6, level_override: 14 },
      SEED.skillXp
    );
    for (const q of pinned) expect(q.level).toBe(14);

    const adaptive = buildRun(
      { kind: 'generated', areas: ['add'], question_count: 6, level_override: null },
      LEVEL_5
    );
    for (const q of adaptive) expect(q.level).toBe(skillLevelFromXp(LEVEL_5.add));
  });

  it('gives a two-step question a budget for both steps', () => {
    const single: RunQuestion = { prompt: '4 + 5', answer: 9, areas: ['add'], level: 3, tip: null };
    const combined: RunQuestion = {
      prompt: '(4 + 5) × 3',
      answer: 27,
      areas: ['add', 'mul'],
      level: 3,
      tip: null,
    };
    expect(questionTargetMs(combined)).toBeGreaterThan(questionTargetMs(single));
  });
});

describe('mixedSequence', () => {
  it('works up from single questions to combined ones', () => {
    const levels = { add: 6, sub: 6, mul: 6, div: 6 };
    const set = mixedSequence(levels, 40);
    expect(set).toHaveLength(40);

    const firstHalf = set.slice(0, 20).filter((q) => q.areas.length > 1).length;
    const secondHalf = set.slice(20).filter((q) => q.areas.length > 1).length;
    expect(secondHalf).toBeGreaterThan(firstHalf);
  });

  it('always opens with something single-step', () => {
    for (let i = 0; i < 20; i++) {
      const [first] = mixedSequence({ add: 4, sub: 4, mul: 4, div: 4 }, 10);
      expect(first.areas).toHaveLength(1);
    }
  });

  it('produces arithmetically correct prompts', () => {
    for (const q of mixedSequence({ add: 5, sub: 5, mul: 5, div: 5 }, 60)) {
      expect(Number.isInteger(q.answer)).toBe(true);
      // No negatives for schoolchildren, whichever shape came out.
      expect(q.answer).toBeGreaterThan(0);
    }
  });
});

describe('running an assignment', () => {
  const oneQuestion = () =>
    startRun(
      buildRun(
        { kind: 'custom', areas: ['mul'], question_count: 1, level_override: null },
        SEED.skillXp,
        written([['6 × 7', 42, 'mul']])
      ),
      SEED
    );

  it('will not score a question that was never begun', () => {
    const state = oneQuestion();
    expect(checkRunAnswer(state, '42', 1_000)).toBe(state);
  });

  it('scores a correct answer into the skill the question credits', () => {
    const state = checkRunAnswer(beginRunQuestion(oneQuestion(), 0), '42', 3_000);
    expect(state.status).toBe('correct');
    expect(state.correct).toBe(1);
    expect(state.skillXp.mul).toBeGreaterThan(0);
    expect(state.skillXp.add).toBe(0);
    expect(state.counts.mul).toBe(1);
    expect(state.runXp).toBe(state.xp);
  });

  it('moves both ladders for a two-step question', () => {
    const combined: RunQuestion = {
      prompt: '(4 + 5) × 3',
      answer: 27,
      areas: ['add', 'mul'],
      level: 4,
      tip: null,
    };
    const state = checkRunAnswer(beginRunQuestion(startRun([combined], SEED), 0), '27', 4_000);
    expect(state.skillXp.add).toBeGreaterThan(0);
    expect(state.skillXp.mul).toBeGreaterThan(0);
    expect(state.counts.add).toBe(1);
    expect(state.counts.mul).toBe(1);
  });

  it('breaks the streak on a wrong answer without taking XP away', () => {
    const first = checkRunAnswer(beginRunQuestion(oneQuestion(), 0), '42', 2_000);
    const wrong = checkRunAnswer(
      { ...first, index: 0, status: 'idle', input: '', startedAt: 0 },
      '99',
      2_000
    );
    expect(wrong.status).toBe('wrong');
    expect(wrong.streak).toBe(0);
    expect(wrong.xp).toBe(first.xp);
    expect(wrong.correct).toBe(first.correct);
  });

  it('times the next question from the moment it arrives', () => {
    const two = startRun(
      buildRun(
        { kind: 'custom', areas: ['add'], question_count: 2, level_override: null },
        SEED.skillXp,
        written([['1 + 1', 2, 'add'], ['2 + 2', 4, 'add']])
      ),
      SEED
    );
    expect(isLastQuestion(two)).toBe(false);
    const answered = checkRunAnswer(beginRunQuestion(two, 0), '2', 1_000);
    const next = advanceRun(answered, 5_000);
    expect(next.index).toBe(1);
    expect(next.startedAt).toBe(5_000);
    expect(currentQuestion(next)?.prompt).toBe('2 + 2');
    expect(isLastQuestion(next)).toBe(true);
  });

  it('will not advance past the last question', () => {
    const state = beginRunQuestion(oneQuestion(), 0);
    expect(advanceRun(state, 9_000)).toBe(state);
  });

  it('hands back only account progress, not run bookkeeping', () => {
    const state = checkRunAnswer(beginRunQuestion(oneQuestion(), 0), '42', 2_000);
    const progress = runProgress(state);
    expect(Object.keys(progress).sort()).toEqual([
      'bestStreak',
      'counts',
      'lightningSolves',
      'skillXp',
      'solved',
      'streak',
      'xp',
    ]);
  });
});
