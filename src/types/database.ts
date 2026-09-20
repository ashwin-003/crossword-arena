/**
 * Row shapes mirroring supabase/migrations/0001_init_schema.sql.
 * Kept hand-written (rather than `supabase gen types`) so the project has no
 * build-time dependency on a live Supabase project; regenerate with the
 * Supabase CLI once you have a real project and diff against this file.
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

export interface UserRow {
  id: string
  name: string
  class: string
  batch_number: string
  created_at: string
  updated_at: string
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

/** Answer-free projection of `questions`, as returned by questions_public. */
export interface QuestionPublicRow {
  id: string
  game_id: string
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
    score: number
    solved_count: number
    rank: number
  }>
}
