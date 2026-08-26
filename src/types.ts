export type Area = 'add' | 'sub' | 'mul' | 'div';
export type Status = 'idle' | 'correct' | 'wrong';
export type Level = 'beginner' | 'intermediate' | 'expert' | 'master';
export type Variant = 'focus' | 'studio';
export type Role = 'teacher' | 'student';

export interface Profile {
  id: string;
  role: Role;
  full_name: string;
  grade: string | null;
  /**
   * When the student chose to skip the placement assessment. Null means they
   * have either taken it or not been asked yet — the two are told apart by
   * whether a benchmark result exists.
   */
  placement_declined_at: string | null;
  created_at: string;
}

export interface Classroom {
  id: string;
  teacher_id: string;
  name: string;
  join_code: string;
  /** Teacher-controlled: students only see their own placement when this is on. */
  reveal_benchmark: boolean;
  /** Teacher-controlled: the table of classmates ranked by this week's XP. */
  leaderboard_enabled: boolean;
  /**
   * Teacher-controlled: whether these students may share a region and appear in
   * any table beyond their own class. Off here overrides student consent.
   */
  global_leaderboard_enabled: boolean;
  created_at: string;
}

// ── Teacher platform ─────────────────────────────────────────────────────────

/**
 * How an assignment's questions come about.
 *
 *  - `generated` builds them from the chosen skills at the student's own level.
 *  - `custom` serves the teacher's own questions in the order they wrote them.
 *  - `mixed` is challenge-style, including two-step questions like `(14 + 6) × 7`.
 */
export type AssignmentKind = 'generated' | 'custom' | 'mixed';

/** One question a teacher wrote themselves. */
export interface AssignmentQuestion {
  id: string;
  assignment_id: string;
  position: number;
  prompt: string;
  answer: number;
  /** Which ladder a correct answer credits — the teacher's call. */
  area: Area;
}

export interface Assignment {
  id: string;
  classroom_id: string;
  teacher_id: string;
  title: string;
  instructions: string | null;
  /** Optional video shown above the instructions, so a set can open with a lesson. */
  video_url: string | null;
  kind: AssignmentKind;
  areas: Area[];
  question_count: number;
  /** Null means "meet each student at their own ladder level" — the default. */
  level_override: number | null;
  due_at: string | null;
  created_at: string;
}

export interface AssignmentSubmission {
  assignment_id: string;
  student_id: string;
  correct: number;
  total: number;
  xp_earned: number;
  elapsed_ms: number;
  submitted_at: string;
}

/** How a material is delivered. Orthogonal to its category, which is the topic. */
export type MaterialKind = 'file' | 'link' | 'note' | 'video';

/** What a material is about. The teacher picks one; students filter by it. */
export type MaterialCategory =
  | 'strategy'
  | 'worksheet'
  | 'reference'
  | 'practice'
  | 'exam'
  | 'enrichment'
  | 'other';

/**
 * `private` is a draft: only the teacher who owns the classroom can read the row,
 * enforced by RLS rather than by the panel choosing not to render it.
 */
export type MaterialVisibility = 'class' | 'private';

export interface Material {
  id: string;
  classroom_id: string;
  teacher_id: string;
  title: string;
  description: string | null;
  kind: MaterialKind;
  category: MaterialCategory;
  visibility: MaterialVisibility;
  storage_path: string | null;
  file_name: string | null;
  file_size: number | null;
  url: string | null;
  body: string | null;
  created_at: string;
}

export interface Feedback {
  id: string;
  student_id: string;
  teacher_id: string;
  classroom_id: string | null;
  body: string;
  created_at: string;
  read_at: string | null;
}

export interface StudySession {
  id: string;
  classroom_id: string;
  host_id: string;
  title: string;
  note: string | null;
  areas: Area[];
  scheduled_at: string;
  created_at: string;
}

export interface Post {
  id: string;
  classroom_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

export interface BenchmarkResult {
  score: number;
  level: Level;
  breakdown: Record<Area, { correct: number; total: number; points: number }>;
}

export interface Question {
  a: number;
  b: number;
  area: Area;
  answer: number;
}

export interface Counts {
  add: number;
  sub: number;
  mul: number;
  div: number;
}

/** Per-area XP. Each area's total drives its own independent level ladder. */
export type SkillXp = Counts;

export interface StudentProgress {
  xp: number;
  streak: number;
  solved: number;
  counts: Counts;
  skillXp: SkillXp;
  /** High-water mark. Never decremented, so a broken streak can't erase the record. */
  bestStreak: number;
  /** Correct answers inside 40% of the target time — what the speed badges read. */
  lightningSolves: number;
}

export type SpeedRating = 'lightning' | 'quick' | 'onTime' | 'steady' | 'slow';

/** What a single correct answer earned, kept for the result panel to explain. */
export interface SolveOutcome {
  xp: number;
  base: number;
  speed: SpeedRating;
  speedMultiplier: number;
  streakMultiplier: number;
  elapsedMs: number;
  targetMs: number;
  /** New skill level, when this solve pushed the area's ladder up. */
  levelUp: number | null;
}

export interface PracticeState extends Question, StudentProgress {
  input: string;
  status: Status;
  /**
   * Epoch ms when the clock started, or null while the question is waiting to be
   * begun — masked, untimed, and unanswerable until then.
   */
  startedAt: number | null;
  /** Elapsed time on the current question; frozen once it is answered. */
  elapsedMs: number;
  /** Recently served question keys, so exercises don't repeat. */
  recent: string[];
  /**
   * Pins difficulty for every area instead of reading each ladder. Set by an
   * assignment the teacher fixed to one level; null means adaptive.
   */
  levelOverride: number | null;
  lastSolve: SolveOutcome | null;
}

export interface CheckResult {
  correct: boolean;
  state: PracticeState;
}
