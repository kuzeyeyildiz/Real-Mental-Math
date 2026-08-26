export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

/**
 * Trimmed to Numo's own tables on purpose — this Supabase project is shared
 * with another app, and its schema is none of Numo's business.
 */
export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      numo_assignments: {
        Row: {
          areas: string[]
          classroom_id: string
          created_at: string
          due_at: string | null
          id: string
          instructions: string | null
          kind: string
          level_override: number | null
          question_count: number
          teacher_id: string
          title: string
          video_url: string | null
        }
        Insert: {
          areas: string[]
          classroom_id: string
          created_at?: string
          due_at?: string | null
          id?: string
          instructions?: string | null
          kind?: string
          level_override?: number | null
          question_count?: number
          teacher_id: string
          title: string
          video_url?: string | null
        }
        Update: {
          areas?: string[]
          classroom_id?: string
          created_at?: string
          due_at?: string | null
          id?: string
          instructions?: string | null
          kind?: string
          level_override?: number | null
          question_count?: number
          teacher_id?: string
          title?: string
          video_url?: string | null
        }
        Relationships: []
      }
      numo_assignment_questions: {
        Row: {
          answer: number
          area: string
          assignment_id: string
          id: string
          position: number
          prompt: string
        }
        // Written only by numo_create_assignment, in the same transaction as the
        // assignment itself — see the RPC for why.
        Insert: never
        Update: never
        Relationships: []
      }
      numo_assignment_targets: {
        Row: { assignment_id: string; student_id: string }
        Insert: { assignment_id: string; student_id: string }
        Update: { assignment_id?: string; student_id?: string }
        Relationships: []
      }
      numo_assignment_submissions: {
        Row: {
          assignment_id: string
          correct: number
          elapsed_ms: number
          student_id: string
          submitted_at: string
          total: number
          xp_earned: number
        }
        Insert: {
          assignment_id: string
          correct?: number
          elapsed_ms?: number
          student_id: string
          submitted_at?: string
          total?: number
          xp_earned?: number
        }
        Update: {
          assignment_id?: string
          correct?: number
          elapsed_ms?: number
          student_id?: string
          submitted_at?: string
          total?: number
          xp_earned?: number
        }
        Relationships: []
      }
      numo_materials: {
        Row: {
          body: string | null
          category: string
          classroom_id: string
          created_at: string
          description: string | null
          file_name: string | null
          file_size: number | null
          id: string
          kind: string
          storage_path: string | null
          teacher_id: string
          title: string
          url: string | null
          visibility: string
        }
        Insert: {
          body?: string | null
          category?: string
          classroom_id: string
          created_at?: string
          description?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          kind: string
          storage_path?: string | null
          teacher_id: string
          title: string
          url?: string | null
          visibility?: string
        }
        Update: {
          body?: string | null
          category?: string
          classroom_id?: string
          created_at?: string
          description?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          kind?: string
          storage_path?: string | null
          teacher_id?: string
          title?: string
          url?: string | null
          visibility?: string
        }
        Relationships: []
      }
      numo_feedback: {
        Row: {
          body: string
          classroom_id: string | null
          created_at: string
          id: string
          read_at: string | null
          student_id: string
          teacher_id: string
        }
        Insert: {
          body: string
          classroom_id?: string | null
          created_at?: string
          id?: string
          read_at?: string | null
          student_id: string
          teacher_id: string
        }
        Update: {
          body?: string
          classroom_id?: string | null
          created_at?: string
          id?: string
          read_at?: string | null
          student_id?: string
          teacher_id?: string
        }
        Relationships: []
      }
      numo_study_sessions: {
        Row: {
          areas: string[]
          classroom_id: string
          created_at: string
          host_id: string
          id: string
          note: string | null
          scheduled_at: string
          title: string
        }
        Insert: {
          areas?: string[]
          classroom_id: string
          created_at?: string
          host_id: string
          id?: string
          note?: string | null
          scheduled_at: string
          title: string
        }
        Update: {
          areas?: string[]
          classroom_id?: string
          created_at?: string
          host_id?: string
          id?: string
          note?: string | null
          scheduled_at?: string
          title?: string
        }
        Relationships: []
      }
      numo_study_session_members: {
        Row: { joined_at: string; session_id: string; student_id: string }
        Insert: { joined_at?: string; session_id: string; student_id: string }
        Update: { joined_at?: string; session_id?: string; student_id?: string }
        Relationships: []
      }
      numo_posts: {
        Row: {
          author_id: string
          body: string
          classroom_id: string
          created_at: string
          id: string
        }
        Insert: {
          author_id: string
          body: string
          classroom_id: string
          created_at?: string
          id?: string
        }
        Update: {
          author_id?: string
          body?: string
          classroom_id?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      numo_benchmark_results: {
        Row: {
          breakdown: Json
          id: string
          level: string
          score: number
          student_id: string
          taken_at: string
        }
        Insert: {
          breakdown?: Json
          id?: string
          level: string
          score: number
          student_id: string
          taken_at?: string
        }
        Update: {
          breakdown?: Json
          id?: string
          level?: string
          score?: number
          student_id?: string
          taken_at?: string
        }
        Relationships: []
      }
      numo_classroom_members: {
        Row: {
          classroom_id: string
          joined_at: string
          student_id: string
        }
        Insert: {
          classroom_id: string
          joined_at?: string
          student_id: string
        }
        Update: {
          classroom_id?: string
          joined_at?: string
          student_id?: string
        }
        Relationships: []
      }
      numo_classrooms: {
        Row: {
          created_at: string
          id: string
          join_code: string
          name: string
          global_leaderboard_enabled: boolean
          leaderboard_enabled: boolean
          reveal_benchmark: boolean
          teacher_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          join_code: string
          name: string
          global_leaderboard_enabled?: boolean
          leaderboard_enabled?: boolean
          reveal_benchmark?: boolean
          teacher_id: string
        }
        Update: {
          created_at?: string
          id?: string
          join_code?: string
          name?: string
          global_leaderboard_enabled?: boolean
          leaderboard_enabled?: boolean
          reveal_benchmark?: boolean
          teacher_id?: string
        }
        Relationships: []
      }
      numo_practice_progress: {
        Row: {
          best_streak: number
          counts: Json
          days_practised: number
          last_practice_day: string | null
          lightning_solves: number
          skill_xp: Json
          solved: number
          streak: number
          student_id: string
          updated_at: string
          xp: number
        }
        Insert: {
          best_streak?: number
          counts?: Json
          days_practised?: number
          last_practice_day?: string | null
          lightning_solves?: number
          skill_xp?: Json
          solved?: number
          streak?: number
          student_id: string
          updated_at?: string
          xp?: number
        }
        Update: {
          best_streak?: number
          counts?: Json
          days_practised?: number
          last_practice_day?: string | null
          lightning_solves?: number
          skill_xp?: Json
          solved?: number
          streak?: number
          student_id?: string
          updated_at?: string
          xp?: number
        }
        Relationships: []
      }
      numo_daily_xp: {
        Row: {
          day: string
          solved: number
          student_id: string
          xp: number
        }
        Insert: {
          day: string
          solved?: number
          student_id: string
          xp?: number
        }
        Update: {
          day?: string
          solved?: number
          student_id?: string
          xp?: number
        }
        Relationships: []
      }
      numo_weekly_baseline: {
        Row: {
          student_id: string
          week_start: string
          xp_at_start: number
        }
        Insert: {
          student_id: string
          week_start: string
          xp_at_start?: number
        }
        Update: {
          student_id?: string
          week_start?: string
          xp_at_start?: number
        }
        Relationships: []
      }
      numo_student_badges: {
        Row: {
          badge_id: string
          earned_at: string
          student_id: string
        }
        Insert: {
          badge_id: string
          earned_at?: string
          student_id: string
        }
        Update: {
          badge_id?: string
          earned_at?: string
          student_id?: string
        }
        Relationships: []
      }
      numo_challenge_runs: {
        Row: {
          answered: number
          best_combo: number
          correct: number
          duration_ms: number
          id: string
          played_at: string
          score: number
          student_id: string
          xp_earned: number
        }
        Insert: {
          answered?: number
          best_combo?: number
          correct?: number
          duration_ms?: number
          id?: string
          played_at?: string
          score?: number
          student_id: string
          xp_earned?: number
        }
        Update: {
          answered?: number
          best_combo?: number
          correct?: number
          duration_ms?: number
          id?: string
          played_at?: string
          score?: number
          student_id?: string
          xp_earned?: number
        }
        Relationships: []
      }
      numo_notifications: {
        Row: {
          actor_id: string | null
          body: string | null
          classroom_id: string | null
          created_at: string
          id: string
          kind: string
          read_at: string | null
          subject_id: string | null
          title: string
          user_id: string
        }
        // Insert and Update are unreachable on purpose: the table has no insert
        // or update policy, and only SECURITY DEFINER triggers write to it.
        Insert: never
        Update: never
        Relationships: []
      }
      numo_friend_requests: {
        Row: {
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          responded_at: string | null
          status: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      numo_friendships: {
        Row: {
          created_at: string
          user_a: string
          user_b: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      numo_profiles: {
        Row: {
          created_at: string
          full_name: string
          grade: string | null
          id: string
          placement_declined_at: string | null
          region: string | null
          region_set_at: string | null
          role: string
        }
        Insert: {
          created_at?: string
          full_name?: string
          grade?: string | null
          id: string
          placement_declined_at?: string | null
          region?: string | null
          region_set_at?: string | null
          role: string
        }
        Update: {
          created_at?: string
          full_name?: string
          grade?: string | null
          id?: string
          placement_declined_at?: string | null
          region?: string | null
          region_set_at?: string | null
          role?: string
        }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      numo_create_classroom: {
        Args: { classroom_name: string }
        Returns: {
          created_at: string
          id: string
          join_code: string
          name: string
          reveal_benchmark: boolean
          teacher_id: string
        }
      }
      numo_ensure_week_baseline: {
        Args: { week: string }
        Returns: number
      }
      numo_league_context: {
        Args: { week: string }
        Returns: {
          my_rank: number
          my_weekly_xp: number
          my_xp: number
          total_users: number
        }[]
      }
      numo_league_cohort: {
        Args: { week: string; rank_from: number; rank_to: number }
        Returns: {
          display_name: string
          student_id: string
          weekly_xp: number
          xp: number
        }[]
      }
      numo_region_leaderboard: {
        Args: { week: string; limit_n?: number }
        Returns: {
          display_name: string
          student_id: string
          weekly_xp: number
          xp: number
        }[]
      }
      numo_class_leaderboard: {
        Args: { room: string; week: string }
        Returns: {
          display_name: string
          student_id: string
          weekly_xp: number
          xp: number
        }[]
      }
      numo_join_classroom: {
        Args: { code: string }
        Returns: {
          created_at: string
          id: string
          join_code: string
          name: string
          reveal_benchmark: boolean
          teacher_id: string
        }
      }
      numo_mark_notifications_read: {
        Args: { ids: string[] | null }
        Returns: number
      }
      numo_classmates: {
        Args: Record<string, never>
        Returns: {
          full_name: string
          grade: string | null
          id: string
          relation: string
          request_id: string | null
        }[]
      }
      numo_friends: {
        Args: { week: string }
        Returns: {
          friends_since: string
          full_name: string
          grade: string | null
          id: string
          ranked: boolean
          weekly_xp: number
          xp: number
        }[]
      }
      numo_send_friend_request: {
        Args: { other: string }
        Returns: string
      }
      numo_respond_friend_request: {
        Args: { request: string; accept: boolean }
        Returns: undefined
      }
      numo_create_assignment: {
        Args: {
          room: string
          a_title: string
          a_instructions: string | null
          a_video_url: string | null
          a_kind: string
          a_areas: string[]
          a_question_count: number
          a_level_override: number | null
          a_due_at: string | null
          target_ids?: string[] | null
          /** `[{ prompt, answer, area }]` for a custom assignment; null otherwise. */
          a_questions?: Json | null
        }
        Returns: string
      }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
