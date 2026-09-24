/**
 * Row shapes mirroring supabase/migrations/0001_init_schema.sql,
 * 0008_mark_calculation_results.sql, and 0009_student_progress_monitoring.sql.
 */

export type GameStatus = 'waiting' | 'starting' | 'active' | 'ended' | 'cancelled'
export type ClueDirection = 'across' | 'down'
export type ParticipantStatus = 'joined' | 'active' | 'submitted' | 'disconnected'
export type GameEventType =
  | 'game_started'
  | 'fullscreen_entered'
  | 'fullscreen_exited'
  | 'fullscreen_restored'
  | 'visibility_changed'
  | 'focus_lost'
  | 'focus_restored'
  | 'reconnected'
  | 'submitted'
  | 'game_ended'

export interface MentorRow {
  id: string
  auth_user_id: string
  name: string
  email: string
  is_active: boolean
  created_at: string
}

export interface StudentRow {
  batch_number: string
}

export interface UserRow {
  id: string
  name: string
  class: string
  batch_number?: string
  email?: string
  is_active?: boolean
  created_at: string
  updated_at?: string
}

/** Structural grid data only — never contains answers. */
export interface GridLayout {
  rows: number
  cols: number
  /** `true` = playable cell, `false` = blocked/void cell. */
  cellMask: boolean[][]
}

export interface GameRow {
  id: string
  game_code: string
  title: string
  creator_id: string
  time_limit_seconds: number
  start_time: string | null
  end_time: string | null
  status: GameStatus
  grid_rows: number
  grid_cols: number
  grid_layout: GridLayout
  created_at: string
  updated_at: string
}

/** A single section within a multi-section game. */
export interface GameSectionRow {
  id: string
  game_id: string
  name: string
  position: number
  time_limit_seconds: number
  grid_rows: number
  grid_cols: number
  grid_layout: GridLayout
  created_at: string
}

/** Answer-free projection of `questions`, as returned by questions_public. */
export interface QuestionPublicRow {
  id: string
  game_id: string
  section_id: string | null
  direction: ClueDirection
  clue: string
  number: number
  row_index: number
  col_index: number
  answer_length: number
}

export interface ParticipantRow {
  id: string
  game_id: string
  user_id: string
  joined_at: string
  status: ParticipantStatus
  submitted_at: string | null
  live_score: number
  live_solved_count: number
  interruption_count: number
  last_seen_at: string | null
  current_section_index?: number
  current_section_name?: string
  completed_sections_count?: number
  current_section_status?: string
  total_correct?: number
  total_wrong?: number
  total_unanswered?: number
  total_attempted?: number
  section_scores?: Array<{
    section_id: string
    name: string
    position: number
    score: number
    solved_count: number
    total_questions: number
    completion_time_seconds?: number
    status: 'In Progress' | 'Submitted' | 'Locked'
  }>
  batch_number: string
}

export interface ParticipantWithUser extends ParticipantRow {
  user: Pick<UserRow, 'id' | 'name' | 'class'>
}

export interface AnswerRow {
  id: string
  game_id: string
  user_id: string
  question_id: string
  answer: string
  is_correct: boolean | null
  updated_at: string
}

export interface ResultRow {
  id: string
  game_id: string
  user_id: string
  score: number
  completion_time_seconds: number
  solved_count: number
  total_questions: number
  accuracy: number
  rank: number | null
  auto_submitted: boolean
  created_at: string
}

export interface ResultWithUser extends ResultRow {
  user: Pick<UserRow, 'id' | 'name' | 'class'>
}

export interface SectionTimerRow {
  id: string
  game_id: string
  section_id: string
  user_id: string
  started_at: string | null
  elapsed_seconds: number
  last_active_at: string | null
  is_locked: boolean
}

export interface SectionResultRow {
  id: string
  game_id: string
  section_id: string
  user_id: string
  score: number
  solved_count: number
  total_questions: number
  completion_time_seconds: number
  auto_submitted: boolean
  submitted_at: string
}

export interface GameEventRow {
  id: string
  game_id: string
  user_id: string | null
  event_type: GameEventType
  event_data: Record<string, unknown>
  created_at: string
}

export interface SpectatorSnapshot {
  game_id?: string
  creator_id?: string
  title: string
  game_code: string
  status: GameStatus
  start_time: string | null
  end_time: string | null
  participant_count: number
  leaderboard: Array<{
    name: string
    batch_number?: string
    score: number
    solved_count: number
    completion_time_seconds?: number
    rank: number
  }>
}

export interface StudentSectionBreakdown {
  section_id: string
  name: string
  position: number
  score: number
  solved_count: number
  total_questions: number
  completion_time_seconds?: number
  status: 'In Progress' | 'Submitted' | 'Locked'
}

export interface StudentProgressItem {
  user_id: string
  batch_number: string
  display_name: string
  display_class: string
  game_status: ParticipantStatus
  current_section_index: number
  current_section_name: string
  completed_sections_count: number
  total_sections: number
  current_section_status: 'In Progress' | 'Submitted' | 'Completed' | 'Locked'
  total_score: number
  max_score: number
  correct_answers: number
  wrong_answers: number
  unanswered_questions: number
  answered_questions: number
  total_questions: number
  interruption_count: number
  joined_at: string
  last_seen_at: string | null
  completed_at: string | null
  completion_time_seconds?: number
  rank?: number | null
  section_breakdown: StudentSectionBreakdown[]
}

export interface MentorLiveMonitoringData {
  game_id: string
  title: string
  game_code: string
  status: GameStatus
  start_time: string | null
  end_time: string | null
  time_limit_seconds: number
  total_sections: number
  total_questions: number
  participant_count: number
  students: StudentProgressItem[]
}
