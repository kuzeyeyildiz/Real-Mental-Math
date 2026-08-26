import { supabase } from './supabase';
import { fetched, pgError, written, type Fetched, type Written } from './result';
import { toUserMessage } from './errors';
import { AREAS } from '../engine/skillLadder';
import { MATERIAL_CATEGORIES } from '../data/materialMeta';
import type {
  Area,
  Assignment,
  AssignmentKind,
  AssignmentQuestion,
  AssignmentSubmission,
  Feedback,
  Material,
  MaterialCategory,
  MaterialKind,
  MaterialVisibility,
  Post,
  Profile,
  StudySession,
} from '../types';

export const MATERIALS_BUCKET = 'numo-materials';

/** Signed links are handed straight to the browser, so they only need to outlive the click. */
const SIGNED_URL_TTL_SECONDS = 120;

/**
 * A jsonb/text[] column can hold anything the check constraint happens to allow
 * today; coerce it before it reaches question generation.
 */
function toAreas(raw: unknown): Area[] {
  const list = Array.isArray(raw) ? raw.map(String) : [];
  const known = AREAS.filter((a) => list.includes(a));
  return known.length > 0 ? known : [...AREAS];
}

const KINDS: readonly AssignmentKind[] = ['generated', 'custom', 'mixed'];

function toAssignment(row: Record<string, unknown>): Assignment {
  return {
    id: String(row.id),
    classroom_id: String(row.classroom_id),
    teacher_id: String(row.teacher_id),
    title: String(row.title),
    instructions: (row.instructions as string | null) ?? null,
    video_url: (row.video_url as string | null) ?? null,
    kind: KINDS.includes(row.kind as AssignmentKind) ? (row.kind as AssignmentKind) : 'generated',
    areas: toAreas(row.areas),
    question_count: Number(row.question_count),
    level_override: row.level_override == null ? null : Number(row.level_override),
    due_at: (row.due_at as string | null) ?? null,
    created_at: String(row.created_at),
  };
}

function toSubmission(row: Record<string, unknown>): AssignmentSubmission {
  return {
    assignment_id: String(row.assignment_id),
    student_id: String(row.student_id),
    correct: Number(row.correct),
    total: Number(row.total),
    xp_earned: Number(row.xp_earned),
    elapsed_ms: Number(row.elapsed_ms),
    submitted_at: String(row.submitted_at),
  };
}

function toMaterial(row: Record<string, unknown>): Material {
  return {
    id: String(row.id),
    classroom_id: String(row.classroom_id),
    teacher_id: String(row.teacher_id),
    title: String(row.title),
    description: (row.description as string | null) ?? null,
    kind: row.kind as MaterialKind,
    // Both columns are constrained in the database, but a client that trusts a
    // jsonb-ish string to be one of seven values is one migration from a crash.
    category: MATERIAL_CATEGORIES.includes(row.category as MaterialCategory)
      ? (row.category as MaterialCategory)
      : 'other',
    visibility: row.visibility === 'private' ? 'private' : 'class',
    storage_path: (row.storage_path as string | null) ?? null,
    file_name: (row.file_name as string | null) ?? null,
    file_size: row.file_size == null ? null : Number(row.file_size),
    url: (row.url as string | null) ?? null,
    body: (row.body as string | null) ?? null,
    created_at: String(row.created_at),
  };
}

function toSession(row: Record<string, unknown>): StudySession {
  return {
    id: String(row.id),
    classroom_id: String(row.classroom_id),
    host_id: String(row.host_id),
    title: String(row.title),
    note: (row.note as string | null) ?? null,
    areas: toAreas(row.areas),
    scheduled_at: String(row.scheduled_at),
    created_at: String(row.created_at),
  };
}

// ── Assignments ──────────────────────────────────────────────────────────────

/** One question a teacher typed, before it has an id. */
export interface DraftQuestion {
  prompt: string;
  answer: number;
  area: Area;
}

export interface NewAssignment {
  classroomId: string;
  title: string;
  instructions: string | null;
  /** Optional lesson video, framed above the instructions in the runner. */
  videoUrl: string | null;
  kind: AssignmentKind;
  areas: Area[];
  questionCount: number;
  levelOverride: number | null;
  dueAt: string | null;
  /** Empty assigns to the whole class (spec 12b). */
  studentIds: string[];
  /** Only read for a `custom` assignment; the server derives the count from it. */
  questions: DraftQuestion[];
}

/**
 * One call, one transaction. Written as separate inserts, a browser that dies
 * partway leaves an assignment with no targets — which every student in the class
 * then sees — or a custom assignment with no questions in it. The function also
 * puts it in the right students' inboxes.
 */
export async function createAssignment(input: NewAssignment): Promise<Written> {
  return written(async () => {
    const { error } = await supabase.rpc('numo_create_assignment', {
      room: input.classroomId,
      a_title: input.title,
      a_instructions: input.instructions,
      a_video_url: input.videoUrl,
      a_kind: input.kind,
      a_areas: input.areas,
      a_question_count: input.questionCount,
      a_level_override: input.levelOverride,
      a_due_at: input.dueAt,
      target_ids: input.studentIds.length > 0 ? input.studentIds : null,
      a_questions:
        input.kind === 'custom'
          ? input.questions.map((q) => ({ prompt: q.prompt, answer: q.answer, area: q.area }))
          : null,
    });
    return pgError(error);
  });
}

/**
 * The teacher's own questions for one assignment. RLS already limits this to the
 * owning teacher and the students it was set for, so no filtering is needed here.
 */
export function getAssignmentQuestions(
  assignmentId: string
): Promise<Fetched<AssignmentQuestion[]>> {
  return fetched(async () => {
    const { data, error } = await supabase
      .from('numo_assignment_questions')
      .select('*')
      .eq('assignment_id', assignmentId)
      .order('position', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: String(r.id),
        assignment_id: String(r.assignment_id),
        position: Number(r.position),
        prompt: String(r.prompt),
        answer: Number(r.answer),
        area: (AREAS.includes(r.area as Area) ? r.area : 'add') as Area,
      };
    });
  });
}

export function deleteAssignment(assignmentId: string): Promise<Written> {
  return written(async () => {
    const { error } = await supabase.from('numo_assignments').delete().eq('id', assignmentId);
    return pgError(error);
  });
}

export interface AssignmentDetail {
  assignment: Assignment;
  /** Empty means the whole class. */
  targetIds: string[];
  submissions: AssignmentSubmission[];
}

export function getClassroomAssignments(classroomId: string): Promise<Fetched<AssignmentDetail[]>> {
  return fetched(async () => {
    const { data, error } = await supabase
      .from('numo_assignments')
      .select('*')
      .eq('classroom_id', classroomId)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const assignments = (data ?? []).map((r) => toAssignment(r as Record<string, unknown>));
    if (assignments.length === 0) return [];
    const ids = assignments.map((a) => a.id);

    const [targetRes, subRes] = await Promise.all([
      supabase.from('numo_assignment_targets').select('*').in('assignment_id', ids),
      supabase.from('numo_assignment_submissions').select('*').in('assignment_id', ids),
    ]);
    if (targetRes.error) throw targetRes.error;
    if (subRes.error) throw subRes.error;

    const targets = new Map<string, string[]>();
    for (const row of targetRes.data ?? []) {
      const r = row as { assignment_id: string; student_id: string };
      targets.set(r.assignment_id, [...(targets.get(r.assignment_id) ?? []), r.student_id]);
    }
    const subs = new Map<string, AssignmentSubmission[]>();
    for (const row of subRes.data ?? []) {
      const s = toSubmission(row as Record<string, unknown>);
      subs.set(s.assignment_id, [...(subs.get(s.assignment_id) ?? []), s]);
    }

    return assignments.map((assignment) => ({
      assignment,
      targetIds: targets.get(assignment.id) ?? [],
      submissions: subs.get(assignment.id) ?? [],
    }));
  });
}

export interface StudentAssignment {
  assignment: Assignment;
  className: string;
  submission: AssignmentSubmission | null;
}

/**
 * RLS already hides assignments aimed at other students, so this does not need
 * to filter by target — a plain read returns exactly this student's homework.
 */
export function getStudentAssignments(studentId: string): Promise<Fetched<StudentAssignment[]>> {
  return fetched(async () => {
    const { data, error } = await supabase
      .from('numo_assignments')
      .select('*, numo_classrooms(name)')
      .order('created_at', { ascending: false });
    if (error) throw error;

    const rows = (data ?? []) as unknown as (Record<string, unknown> & {
      numo_classrooms: { name: string } | null;
    })[];
    if (rows.length === 0) return [];

    const { data: subs, error: subError } = await supabase
      .from('numo_assignment_submissions')
      .select('*')
      .eq('student_id', studentId);
    if (subError) throw subError;

    const mine = new Map<string, AssignmentSubmission>();
    for (const row of subs ?? []) {
      const s = toSubmission(row as Record<string, unknown>);
      mine.set(s.assignment_id, s);
    }

    return rows.map((row) => {
      const assignment = toAssignment(row);
      return {
        assignment,
        className: row.numo_classrooms?.name ?? 'Class',
        submission: mine.get(assignment.id) ?? null,
      };
    });
  });
}

export interface SubmissionInput {
  assignmentId: string;
  studentId: string;
  correct: number;
  total: number;
  xpEarned: number;
  elapsedMs: number;
}

export function submitAssignment(input: SubmissionInput): Promise<Written> {
  return written(async () => {
    const { error } = await supabase.from('numo_assignment_submissions').upsert({
      assignment_id: input.assignmentId,
      student_id: input.studentId,
      correct: input.correct,
      total: input.total,
      xp_earned: input.xpEarned,
      elapsed_ms: input.elapsedMs,
      submitted_at: new Date().toISOString(),
    });
    return pgError(error);
  });
}

// ── Learning material ────────────────────────────────────────────────────────

export function getMaterials(classroomId: string): Promise<Fetched<Material[]>> {
  return fetched(async () => {
    const { data, error } = await supabase
      .from('numo_materials')
      .select('*')
      .eq('classroom_id', classroomId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r) => toMaterial(r as Record<string, unknown>));
  });
}

/** Storage keys are opaque strings; keep them boring so no path trick is possible. */
function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100) || 'file';
}

export const MAX_MATERIAL_BYTES = 25 * 1024 * 1024;

/**
 * Everything a material carries apart from its payload. One shape for all four
 * kinds, so a new field like `category` cannot reach three of them and miss one.
 */
export interface MaterialMeta {
  classroomId: string;
  teacherId: string;
  title: string;
  description: string | null;
  category: MaterialCategory;
  visibility: MaterialVisibility;
}

function metaColumns(meta: MaterialMeta) {
  return {
    classroom_id: meta.classroomId,
    teacher_id: meta.teacherId,
    title: meta.title,
    description: meta.description,
    category: meta.category,
    visibility: meta.visibility,
  };
}

export async function uploadFileMaterial(meta: MaterialMeta, file: File): Promise<Written> {
  if (file.size > MAX_MATERIAL_BYTES) {
    return { error: 'That file is larger than the 25 MB limit.' };
  }
  const path = `${meta.classroomId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  try {
    const { error: uploadError } = await supabase.storage
      .from(MATERIALS_BUCKET)
      .upload(path, file, { contentType: file.type || 'application/octet-stream' });
    if (uploadError) return { error: toUserMessage(uploadError) };

    const { error } = await supabase.from('numo_materials').insert({
      ...metaColumns(meta),
      kind: 'file',
      storage_path: path,
      file_name: file.name,
      file_size: file.size,
    });
    // Leaving the object behind would bill storage for a file nothing can reach.
    if (error) {
      await supabase.storage.from(MATERIALS_BUCKET).remove([path]);
      return pgError(error);
    }
    return { error: null };
  } catch (err) {
    return { error: toUserMessage(err) };
  }
}

export function createLinkMaterial(meta: MaterialMeta, url: string): Promise<Written> {
  return written(async () => {
    const { error } = await supabase
      .from('numo_materials')
      .insert({ ...metaColumns(meta), kind: 'link', url });
    return pgError(error);
  });
}

/** A video is a link the app will frame rather than send the student away to. */
export function createVideoMaterial(meta: MaterialMeta, url: string): Promise<Written> {
  return written(async () => {
    const { error } = await supabase
      .from('numo_materials')
      .insert({ ...metaColumns(meta), kind: 'video', url });
    return pgError(error);
  });
}

export function createNoteMaterial(meta: MaterialMeta, body: string): Promise<Written> {
  return written(async () => {
    const { error } = await supabase
      .from('numo_materials')
      .insert({ ...metaColumns(meta), kind: 'note', body });
    return pgError(error);
  });
}

/** Flipping a draft to the class, or pulling something back. */
export function setMaterialVisibility(
  materialId: string,
  visibility: MaterialVisibility
): Promise<Written> {
  return written(async () => {
    const { error } = await supabase
      .from('numo_materials')
      .update({ visibility })
      .eq('id', materialId);
    return pgError(error);
  });
}

export async function deleteMaterial(material: Material): Promise<Written> {
  const result = await written(async () => {
    const { error } = await supabase.from('numo_materials').delete().eq('id', material.id);
    return pgError(error);
  });
  if (result.error || !material.storage_path) return result;
  // Best effort: the row is already gone, so a failed object delete leaves
  // orphaned bytes but nothing user-visible. Not worth failing the action over.
  await supabase.storage.from(MATERIALS_BUCKET).remove([material.storage_path]);
  return result;
}

/** The bucket is private, so a download needs a short-lived signed URL. */
export function getMaterialDownloadUrl(storagePath: string): Promise<Fetched<string>> {
  return fetched(async () => {
    const { data, error } = await supabase.storage
      .from(MATERIALS_BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
    if (error) throw error;
    if (!data?.signedUrl) throw new Error('That file could not be opened. Ask your teacher to re-upload it.');
    return data.signedUrl;
  });
}

// ── Feedback ─────────────────────────────────────────────────────────────────

export function getFeedbackForStudent(studentId: string): Promise<Fetched<Feedback[]>> {
  return fetched(async () => {
    const { data, error } = await supabase
      .from('numo_feedback')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as Feedback[];
  });
}

export function sendFeedback(
  studentId: string,
  teacherId: string,
  classroomId: string | null,
  body: string
): Promise<Written> {
  return written(async () => {
    const { error } = await supabase.from('numo_feedback').insert({
      student_id: studentId,
      teacher_id: teacherId,
      classroom_id: classroomId,
      body,
    });
    return pgError(error);
  });
}

export function markFeedbackRead(feedbackId: string): Promise<Written> {
  return written(async () => {
    const { error } = await supabase
      .from('numo_feedback')
      .update({ read_at: new Date().toISOString() })
      .eq('id', feedbackId);
    return pgError(error);
  });
}

// ── Study sessions ───────────────────────────────────────────────────────────

export interface SessionDetail {
  session: StudySession;
  members: Pick<Profile, 'id' | 'full_name'>[];
}

export function getStudySessions(classroomId: string): Promise<Fetched<SessionDetail[]>> {
  return fetched(async () => {
    const { data, error } = await supabase
      .from('numo_study_sessions')
      .select('*')
      .eq('classroom_id', classroomId)
      .order('scheduled_at', { ascending: true });
    if (error) throw error;

    const sessions = (data ?? []).map((r) => toSession(r as Record<string, unknown>));
    if (sessions.length === 0) return [];

    const { data: memberRows, error: memberError } = await supabase
      .from('numo_study_session_members')
      .select('session_id, numo_profiles(id, full_name)')
      .in('session_id', sessions.map((s) => s.id));
    if (memberError) throw memberError;

    const bySession = new Map<string, Pick<Profile, 'id' | 'full_name'>[]>();
    for (const row of memberRows ?? []) {
      const r = row as unknown as {
        session_id: string;
        numo_profiles: Pick<Profile, 'id' | 'full_name'> | null;
      };
      if (!r.numo_profiles) continue;
      bySession.set(r.session_id, [...(bySession.get(r.session_id) ?? []), r.numo_profiles]);
    }

    return sessions.map((session) => ({ session, members: bySession.get(session.id) ?? [] }));
  });
}

export interface NewSession {
  classroomId: string;
  hostId: string;
  title: string;
  note: string | null;
  areas: Area[];
  scheduledAt: string;
}

export async function createStudySession(input: NewSession): Promise<Written> {
  return written(async () => {
    const { data, error } = await supabase
      .from('numo_study_sessions')
      .insert({
        classroom_id: input.classroomId,
        host_id: input.hostId,
        title: input.title,
        note: input.note,
        areas: input.areas,
        scheduled_at: input.scheduledAt,
      })
      .select('id')
      .single();
    if (error) return pgError(error);
    // The host is a participant by definition; making them click "join" their
    // own session would just look broken.
    const { error: joinError } = await supabase
      .from('numo_study_session_members')
      .insert({ session_id: String(data.id), student_id: input.hostId });
    return pgError(joinError);
  });
}

export function joinStudySession(sessionId: string, studentId: string): Promise<Written> {
  return written(async () => {
    const { error } = await supabase
      .from('numo_study_session_members')
      .insert({ session_id: sessionId, student_id: studentId });
    return pgError(error);
  });
}

export function leaveStudySession(sessionId: string, studentId: string): Promise<Written> {
  return written(async () => {
    const { error } = await supabase
      .from('numo_study_session_members')
      .delete()
      .eq('session_id', sessionId)
      .eq('student_id', studentId);
    return pgError(error);
  });
}

export function deleteStudySession(sessionId: string): Promise<Written> {
  return written(async () => {
    const { error } = await supabase.from('numo_study_sessions').delete().eq('id', sessionId);
    return pgError(error);
  });
}

// ── Class feed ───────────────────────────────────────────────────────────────

export function createPost(
  classroomId: string,
  authorId: string,
  body: string
): Promise<Written> {
  return written(async () => {
    const { error } = await supabase
      .from('numo_posts')
      .insert({ classroom_id: classroomId, author_id: authorId, body });
    return pgError(error);
  });
}

export function deletePost(postId: string): Promise<Written> {
  return written(async () => {
    const { error } = await supabase.from('numo_posts').delete().eq('id', postId);
    return pgError(error);
  });
}

/** Everything the feed is built from, before the engine shapes it. */
export interface FeedSources {
  posts: Post[];
  assignments: Assignment[];
  materials: Material[];
  sessions: StudySession[];
  /** How many people have said they are coming, per session id. */
  sessionMembers: Record<string, number>;
}

/**
 * Reads the feed's sources. RLS does the filtering, so a student's feed already
 * omits assignments aimed at somebody else and materials still marked private.
 *
 * Each read is bounded and newest-first. Unbounded, a classroom in its second
 * year would fetch every row it has ever produced to render one screen.
 */
export function getClassroomFeed(classroomId: string): Promise<Fetched<FeedSources>> {
  return fetched(async () => {
    const limit = FEED_SOURCE_LIMIT;
    const [posts, assignments, materials, sessions] = await Promise.all([
      supabase.from('numo_posts').select('*').eq('classroom_id', classroomId)
        .order('created_at', { ascending: false }).limit(limit),
      supabase.from('numo_assignments').select('*').eq('classroom_id', classroomId)
        .order('created_at', { ascending: false }).limit(limit),
      supabase.from('numo_materials').select('*').eq('classroom_id', classroomId)
        .order('created_at', { ascending: false }).limit(limit),
      supabase.from('numo_study_sessions').select('*').eq('classroom_id', classroomId)
        .order('created_at', { ascending: false }).limit(limit),
    ]);
    for (const res of [posts, assignments, materials, sessions]) {
      if (res.error) throw res.error;
    }

    const sessionRows = (sessions.data ?? []).map((r) => toSession(r as Record<string, unknown>));
    const sessionMembers: Record<string, number> = {};
    if (sessionRows.length > 0) {
      const { data: members, error } = await supabase
        .from('numo_study_session_members')
        .select('session_id')
        .in('session_id', sessionRows.map((s) => s.id));
      if (error) throw error;
      for (const row of members ?? []) {
        const id = (row as { session_id: string }).session_id;
        sessionMembers[id] = (sessionMembers[id] ?? 0) + 1;
      }
    }

    return {
      posts: (posts.data ?? []) as unknown as Post[],
      assignments: (assignments.data ?? []).map((r) => toAssignment(r as Record<string, unknown>)),
      materials: (materials.data ?? []).map((r) => toMaterial(r as Record<string, unknown>)),
      sessions: sessionRows,
      sessionMembers,
    };
  });
}

/** Per source table, so one busy table can't crowd the others out of the feed. */
const FEED_SOURCE_LIMIT = 40;
