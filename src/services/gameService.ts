import { supabase } from '@/lib/supabaseClient'
import { callFunction } from '@/lib/functions'
import type {
  GameRow,
  GameSectionRow,
  GameStatus,
  ParticipantWithUser,
  QuestionPublicRow,
  ResultWithUser,
  ResultRow,
  SectionTimerRow,
  SectionResultRow,
  SpectatorSnapshot,
} from '@/types/database'

// ============================================================================
// Game creation
// ============================================================================

export interface CreateGameClueInput {
  direction: 'across' | 'down'
  clue: string
  answer: string
}

export interface CreateGameSectionInput {
  name: string
  timeLimitSeconds: number
  clues: CreateGameClueInput[]
}

/** Creates a multi-section game. */
export async function createGame(input: { title: string; sections: CreateGameSectionInput[] }) {
  return callFunction<{ ok: true; gameId: string; gameCode: string; sectionCount: number; totalWordCount: number; rows: number; cols: number }>(
    'create-game',
    { title: input.title, sections: input.sections }
  )
}

// ============================================================================
// Existing game management functions
// ============================================================================

export async function joinGameByCode(gameCode: string) {
  return callFunction<{ ok: true; gameId: string; status: string; alreadyJoined: boolean }>('join-game', { gameCode })
}

export async function leaveGame(gameId: string) {
  return callFunction<{ ok: true }>('leave-game', { gameId })
}

export async function startGame(gameId: string) {
  return callFunction<{ ok: true; startTime: string; endTime: string }>('start-game', { gameId })
}

export async function stopGame(gameId: string) {
  return callFunction<{ ok: true; status: string }>('stop-game', { gameId })
}

export async function cancelGame(gameId: string) {
  return stopGame(gameId)
}

export async function deleteGame(gameId: string) {
  return callFunction<{ ok: true }>('delete-game', { gameId })
}

export async function restartGame(gameId: string) {
  return callFunction<{ ok: true }>('restart-game', { gameId })
}

// ============================================================================
// Section management (multi-section games)
// ============================================================================

export interface SectionTimerState {
  elapsedSeconds: number
  timeLimitSeconds: number
  remainingSeconds: number
  isLocked: boolean
}

/** Called when a student opens or switches to a section. Returns server-authoritative timer state. */
export async function startSection(gameId: string, sectionId: string) {
  return callFunction<{ ok: true } & SectionTimerState>('start-section', { gameId, sectionId })
}

export interface SectionSubmitResult {
  score: number
  solvedCount: number
  totalQuestions: number
  completionTimeSeconds: number
  autoSubmitted?: boolean
}

/** Submits a single section — records the score and completion time. */
export async function submitSection(gameId: string, sectionId: string, autoSubmitted = false) {
  return callFunction<{ ok: true; result: SectionSubmitResult; alreadySubmitted?: boolean }>('submit-section', { gameId, sectionId, autoSubmitted })
}

/** Fetches all sections for a game, ordered by position. */
export async function fetchGameSections(gameId: string): Promise<GameSectionRow[]> {
  const { data } = await supabase
    .from('game_sections')
    .select('*')
    .eq('game_id', gameId)
    .order('position', { ascending: true })
  return (data as GameSectionRow[]) ?? []
}

/** Fetches the current student's section timer rows for a game. */
export async function fetchMySectionTimers(gameId: string): Promise<SectionTimerRow[]> {
  const { data } = await supabase
    .from('section_timers')
    .select('*')
    .eq('game_id', gameId)
  return (data as SectionTimerRow[]) ?? []
}

/** Fetches the current student's section results for a game. */
export async function fetchMySectionResults(gameId: string): Promise<SectionResultRow[]> {
  const { data } = await supabase
    .from('section_results')
    .select('*')
    .eq('game_id', gameId)
  return (data as SectionResultRow[]) ?? []
}

/** Fetches all section results for a game (mentor view). */
export async function fetchAllSectionResults(gameId: string): Promise<(SectionResultRow & { user: { id: string; name: string; class: string } })[]> {
  const [resultsRes, participantsRes] = await Promise.all([
    supabase.from('section_results').select('*').eq('game_id', gameId),
    supabase.from('participants_public').select('user_id, display_name, display_class').eq('game_id', gameId),
  ])

  const data = resultsRes.data ?? []
  if (data.length === 0) return []

  const userMap = new Map<string, { id: string; name: string; class: string }>()
  for (const p of participantsRes.data ?? []) {
    userMap.set(p.user_id, { id: p.user_id, name: p.display_name ?? 'Student', class: p.display_class ?? '' })
  }

  return data.map((r: any) => ({
    ...r,
    user: userMap.get(r.user_id) ?? { id: r.user_id, name: 'Student', class: '' },
  }))
}

// ============================================================================
// Drafts
// ============================================================================

export interface GameDraftClue {
  direction: 'across' | 'down'
  clue: string
  answer: string
}

export interface GameDraftSection {
  localId: string
  name: string
  timeLimitSeconds: number
  clues: GameDraftClue[]
  /** Serialized grid layout if generated, undefined otherwise */
  generatedGrid?: {
    rows: number
    cols: number
    cellMask: boolean[][]
    words: {
      direction: 'across' | 'down'
      clue: string
      answer: string
      row: number
      col: number
      number: number
    }[]
  }
}

export interface GameDraft {
  id: string
  title: string
  time_limit_seconds: number
  clues: GameDraftClue[]
  sections: GameDraftSection[]
  updated_at: string
}

export async function fetchMyDrafts(userId: string): Promise<GameDraft[]> {
  const { data } = await supabase
    .from('game_drafts')
    .select('id, title, time_limit_seconds, clues, sections, updated_at')
    .eq('creator_id', userId)
    .order('updated_at', { ascending: false })
  return (data as unknown as GameDraft[]) ?? []
}

export async function fetchDraftById(draftId: string): Promise<GameDraft | null> {
  const { data } = await supabase
    .from('game_drafts')
    .select('id, title, time_limit_seconds, clues, sections, updated_at')
    .eq('id', draftId)
    .maybeSingle()
  return data as GameDraft | null
}

export async function saveDraft(
  input: { id?: string; title: string; sections: GameDraftSection[] },
  userId: string
): Promise<GameDraft | null> {
  const payload = {
    creator_id: userId,
    title: input.title,
    time_limit_seconds: Math.max(600, ...input.sections.map((s) => s.timeLimitSeconds || 600)),
    sections: input.sections,
    // Clear legacy clues field
    clues: [],
  }
  const query = input.id
    ? supabase.from('game_drafts').update(payload).eq('id', input.id)
    : supabase.from('game_drafts').insert(payload)
  const { data } = await query.select('id, title, time_limit_seconds, clues, sections, updated_at').single()
  return data as GameDraft | null
}

export async function deleteDraft(draftId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('game_drafts').delete().eq('id', draftId)
  if (error) {
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

// ============================================================================
// Game queries
// ============================================================================

export interface CreatedGameEntry {
  id: string
  title: string
  game_code: string
  status: GameStatus
  created_at: string
  time_limit_seconds?: number
  start_time?: string | null
  end_time?: string | null
  participant_count?: number
}

export async function fetchMyCreatedGames(userId: string): Promise<CreatedGameEntry[]> {
  const { data } = await supabase
    .from('games')
    .select('id, title, game_code, status, created_at, time_limit_seconds, start_time, end_time, participants(count)')
    .eq('creator_id', userId)
    .order('created_at', { ascending: false })

  if (!data) return []

  return data.map((g: any) => ({
    id: g.id,
    title: g.title,
    game_code: g.game_code,
    status: g.status,
    created_at: g.created_at,
    time_limit_seconds: g.time_limit_seconds,
    start_time: g.start_time,
    end_time: g.end_time,
    participant_count: g.participants?.[0]?.count ?? 0,
  }))
}

export async function submitGame(gameId: string) {
  return callFunction<{
    ok: true
    result: {
      score: number
      completion_time_seconds: number
      solved_count: number
      total_questions: number
      accuracy: number
      rank: number | null
      auto_submitted: boolean
    }
  }>('submit-game', { gameId })
}

export async function nudgeGameStateIfExpired(gameId: string) {
  return callFunction('update-game-state', { gameId })
}

export async function touchLastSeen(gameId: string, userId?: string) {
  return supabase.rpc('touch_last_seen', { p_game_id: gameId, p_user_id: userId ?? null })
}

export interface ActiveGameEntry {
  game: Pick<GameRow, 'id' | 'title' | 'game_code' | 'status' | 'creator_id'>
}

const ACTIVE_STATUSES = new Set(['waiting', 'starting', 'active'])

export async function fetchMyActiveGames(userId: string): Promise<ActiveGameEntry[]> {
  const { data } = await supabase
    .from('participants')
    .select('game:games(id, title, game_code, status, creator_id)')
    .eq('user_id', userId)
    .order('joined_at', { ascending: false })
  const rows = (data as unknown as ActiveGameEntry[]) ?? []
  return rows.filter((r) => r.game && ACTIVE_STATUSES.has(r.game.status))
}

export async function fetchGameById(gameId: string): Promise<GameRow | null> {
  const { data } = await supabase.from('games').select('*').eq('id', gameId).maybeSingle()
  return data as GameRow | null
}

export async function fetchGameByCode(gameCode: string): Promise<GameRow | null> {
  const clean = gameCode.trim()
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean)
  if (isUuid) {
    const { data } = await supabase.from('games').select('*').eq('id', clean).maybeSingle()
    if (data) return data as GameRow
  }
  const { data } = await supabase.from('games').select('*').eq('game_code', clean.toUpperCase()).maybeSingle()
  return data as GameRow | null
}

/**
 * Fetch complete student-wise live progress monitoring dataset for a mentor's game.
 * Securely enforces mentor ownership server-side.
 */
export async function fetchMentorLiveMonitoring(gameId: string) {
  const { data, error } = await supabase.rpc('get_mentor_live_monitoring', { p_game_id: gameId })
  if (error || !data) return null
  return data as import('@/types/database').MentorLiveMonitoringData
}

/**
 * Deterministic sort: batch_number ASC (lexicographic — safe because all
 * registered batch numbers are exactly 6 digits, so lex == numeric order).
 * Participants without a batch_number (e.g. mentor-host rows) sort last.
 */
export function sortParticipantsByBatch(participants: ParticipantWithUser[]): ParticipantWithUser[] {
  return participants.slice().sort((a, b) => {
    const ba = a.batch_number || '\uFFFF'
    const bb = b.batch_number || '\uFFFF'
    if (ba < bb) return -1
    if (ba > bb) return 1
    return 0
  })
}

export async function fetchParticipants(gameId: string): Promise<ParticipantWithUser[]> {
  const { data } = await supabase
    .from('participants_public')
    .select('*')
    .eq('game_id', gameId)
    .order('batch_number', { ascending: true })

  if (!data || data.length === 0) return []

  return data.map((p: any) => ({
    ...p,
    batch_number: p.batch_number ?? '',
    user: { id: p.user_id, name: p.display_name ?? 'Student', class: p.display_class ?? '' },
  }))
}

export async function fetchMyParticipant(gameId: string, userId: string) {
  const { data } = await supabase
    .from('participants')
    .select('*')
    .eq('game_id', gameId)
    .eq('user_id', userId)
    .maybeSingle()
  return data
}

export async function fetchQuestionsPublic(gameId: string): Promise<QuestionPublicRow[]> {
  const { data } = await supabase
    .from('questions_public')
    .select('*')
    .eq('game_id', gameId)
    .order('number', { ascending: true })
  return (data as QuestionPublicRow[]) ?? []
}

export async function fetchMyAnswers(gameId: string, userId: string) {
  const { data } = await supabase.from('answers').select('*').eq('game_id', gameId).eq('user_id', userId)
  return data ?? []
}

export async function upsertAnswerDraft(gameId: string, userId: string, questionId: string, rawAnswer: string) {
  return supabase
    .from('answers')
    .upsert(
      { game_id: gameId, user_id: userId, question_id: questionId, answer: rawAnswer },
      { onConflict: 'game_id,user_id,question_id' }
    )
}

export async function checkWordAnswer(gameId: string, questionId: string, guess: string, userId?: string) {
  return supabase.rpc('check_word_answer', { p_game_id: gameId, p_question_id: questionId, p_guess: guess, p_user_id: userId ?? null })
}

export async function fetchLeaderboard(gameId: string) {
  const { data } = await supabase
    .from('participants_public')
    .select('user_id, live_score, live_solved_count, status, display_name, display_class, batch_number')
    .eq('game_id', gameId)
    .order('live_score', { ascending: false })
    .order('live_solved_count', { ascending: false })
    .order('batch_number', { ascending: true })

  if (!data || data.length === 0) return []

  return data.map((p: any) => ({
    ...p,
    user: { id: p.user_id, name: p.display_name ?? 'Student', class: p.display_class ?? '' },
  }))
}

export interface QuestionAnalyticsRow {
  question_id: string
  clue: string
  direction: 'across' | 'down'
  number: number
  attempts: number
  correct_count: number
}

export async function fetchQuestionAnalytics(gameId: string): Promise<QuestionAnalyticsRow[]> {
  const { data, error } = await supabase.rpc('get_question_analytics', { p_game_id: gameId })
  if (error) return []
  return (data as QuestionAnalyticsRow[]) ?? []
}

export async function fetchResults(gameId: string): Promise<ResultWithUser[]> {
  const [resultsRes, participantsRes] = await Promise.all([
    supabase.from('results').select('*').eq('game_id', gameId).order('rank', { ascending: true }),
    supabase.from('participants_public').select('user_id, display_name, display_class').eq('game_id', gameId),
  ])

  const results = resultsRes.data ?? []
  if (results.length === 0) return []

  const userMap = new Map<string, { id: string; name: string; class: string }>()
  for (const p of participantsRes.data ?? []) {
    userMap.set(p.user_id, { id: p.user_id, name: p.display_name ?? 'Student', class: p.display_class ?? '' })
  }

  return results.map((r: any) => ({
    ...r,
    user: userMap.get(r.user_id) ?? { id: r.user_id, name: 'Student', class: '' },
  }))
}

export async function fetchMyResult(gameId: string, userId: string): Promise<ResultRow | null> {
  const { data } = await supabase.from('results').select('*').eq('game_id', gameId).eq('user_id', userId).maybeSingle()
  return data as ResultRow | null
}

export interface ReviewRow {
  question_id: string
  number: number
  direction: 'across' | 'down'
  clue: string
  correct_answer: string
  my_answer: string
  is_correct: boolean | null
}

export async function fetchMyReview(gameId: string): Promise<ReviewRow[]> {
  const result = await callFunction<ReviewRow[]>('get-review', { gameId })
  if (!result.ok || !result.data) return []
  return result.data
}

export interface HistoryEntry extends ResultRow {
  game: Pick<GameRow, 'id' | 'title' | 'game_code' | 'created_at'>
}

export async function fetchMyHistory(userId: string): Promise<HistoryEntry[]> {
  const { data } = await supabase
    .from('results')
    .select('*, game:games(id, title, game_code, created_at)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  return (data as unknown as HistoryEntry[]) ?? []
}

export async function fetchSpectatorSnapshot(gameCode: string): Promise<SpectatorSnapshot | null> {
  const { data, error } = await supabase.rpc('get_spectator_snapshot', { p_game_code: gameCode.toUpperCase() })
  if (error) return null
  return data as SpectatorSnapshot | null
}

export async function recordInterruption(gameId: string) {
  return supabase.rpc('record_interruption', { p_game_id: gameId })
}

export async function disqualifyParticipant(gameId: string, targetUserId: string) {
  return callFunction<{ ok: true }>('disqualify-participant', { gameId, targetUserId })
}

export async function logGameEvent(
  gameId: string,
  userId: string,
  eventType: string,
  eventData: Record<string, unknown> = {}
) {
  return supabase.from('game_events').insert({ game_id: gameId, user_id: userId, event_type: eventType, event_data: eventData })
}
