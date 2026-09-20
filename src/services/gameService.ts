import { supabase } from '@/lib/supabaseClient'
import { callFunction } from '@/lib/functions'
import type {
  GameRow,
  ParticipantWithUser,
  QuestionPublicRow,
  ResultWithUser,
  ResultRow,
  SpectatorSnapshot,
} from '@/types/database'

export interface CreateGameClueInput {
  direction: 'across' | 'down'
  clue: string
  answer: string
}

export async function createGame(input: { title: string; timeLimitSeconds: number; clues: CreateGameClueInput[] }) {
  return callFunction<{ ok: true; gameId: string; gameCode: string; rows: number; cols: number; wordCount: number }>(
    'create-game',
    input
  )
}

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

export interface GameDraftClue {
  direction: 'across' | 'down'
  clue: string
  answer: string
}

export interface GameDraft {
  id: string
  title: string
  time_limit_seconds: number
  clues: GameDraftClue[]
  updated_at: string
}

export async function fetchMyDrafts(userId: string): Promise<GameDraft[]> {
  const { data } = await supabase
    .from('game_drafts')
    .select('id, title, time_limit_seconds, clues, updated_at')
    .eq('creator_id', userId)
    .order('updated_at', { ascending: false })
  return (data as unknown as GameDraft[]) ?? []
}

export async function fetchDraftById(draftId: string): Promise<GameDraft | null> {
  const { data } = await supabase
    .from('game_drafts')
    .select('id, title, time_limit_seconds, clues, updated_at')
    .eq('id', draftId)
    .maybeSingle()
  return data as GameDraft | null
}

export async function saveDraft(
  input: { id?: string; title: string; timeLimitSeconds: number; clues: GameDraftClue[] },
  userId: string
): Promise<GameDraft | null> {
  const payload = {
    creator_id: userId,
    title: input.title,
    time_limit_seconds: input.timeLimitSeconds,
    clues: input.clues,
  }
  const query = input.id
    ? supabase.from('game_drafts').update(payload).eq('id', input.id)
    : supabase.from('game_drafts').insert(payload)
  const { data } = await query.select('id, title, time_limit_seconds, clues, updated_at').single()
  return data as GameDraft | null
}

export async function deleteDraft(draftId: string) {
  return supabase.from('game_drafts').delete().eq('id', draftId)
}

export type CreatedGameEntry = Pick<GameRow, 'id' | 'title' | 'game_code' | 'status' | 'created_at'>

export async function fetchMyCreatedGames(userId: string): Promise<CreatedGameEntry[]> {
  const { data } = await supabase
    .from('games')
    .select('id, title, game_code, status, created_at')
    .eq('creator_id', userId)
    .order('created_at', { ascending: false })
  return (data as CreatedGameEntry[]) ?? []
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

export async function touchLastSeen(gameId: string) {
  return supabase.rpc('touch_last_seen', { p_game_id: gameId })
}

export interface ActiveGameEntry {
  game: Pick<GameRow, 'id' | 'title' | 'game_code' | 'status' | 'creator_id'>
}

const ACTIVE_STATUSES = new Set(['waiting', 'starting', 'active'])

export async function fetchMyActiveGames(userId: string): Promise<ActiveGameEntry[]> {
  // Filtered client-side rather than via an embedded-resource query filter
  // (PostgREST's syntax for that varies by version) — a player only ever
  // has a handful of participant rows, so this stays cheap.
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
  const { data } = await supabase.from('games').select('*').eq('game_code', gameCode.toUpperCase()).maybeSingle()
  return data as GameRow | null
}

export async function fetchParticipants(gameId: string): Promise<ParticipantWithUser[]> {
  const { data } = await supabase
    .from('participants')
    .select('*, user:users(id, name, class)')
    .eq('game_id', gameId)
    .order('joined_at', { ascending: true })
  return (data as unknown as ParticipantWithUser[]) ?? []
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
  // Autosaves raw guess text only — is_correct is protected server-side and
  // can only ever be set by the check_word_answer() database function.
  return supabase
    .from('answers')
    .upsert(
      { game_id: gameId, user_id: userId, question_id: questionId, answer: rawAnswer },
      { onConflict: 'game_id,user_id,question_id' }
    )
}

export async function checkWordAnswer(gameId: string, questionId: string, guess: string) {
  return supabase.rpc('check_word_answer', { p_game_id: gameId, p_question_id: questionId, p_guess: guess })
}

export async function fetchLeaderboard(gameId: string) {
  const { data } = await supabase
    .from('participants')
    .select('user_id, live_score, live_solved_count, status, user:users(id, name, class)')
    .eq('game_id', gameId)
    .order('live_score', { ascending: false })
    .order('live_solved_count', { ascending: false })
  return data ?? []
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
  const { data } = await supabase
    .from('results')
    .select('*, user:users(id, name, class)')
    .eq('game_id', gameId)
    .order('rank', { ascending: true })
  return (data as unknown as ResultWithUser[]) ?? []
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
  const { data, error } = await supabase.rpc('get_my_review', { p_game_id: gameId })
  if (error) return []
  return (data as ReviewRow[]) ?? []
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
