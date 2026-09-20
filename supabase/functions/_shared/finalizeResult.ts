import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { computeAccuracy } from './scoring.ts'

interface FinalizeOptions {
  autoSubmitted: boolean
  completionTimeSeconds: number
}

export interface FinalizedResult {
  score: number
  completionTimeSeconds: number
  solvedCount: number
  totalQuestions: number
  accuracy: number
  autoSubmitted: boolean
}

/**
 * The single place a `results` row is ever written. Used by both
 * submit-game (manual submission) and update-game-state (auto-submit on
 * timeout), so the two code paths can never drift apart. Idempotent: safe
 * to call more than once for the same participant (e.g. a retried submit).
 */
export async function finalizeParticipantResult(
  admin: SupabaseClient,
  gameId: string,
  userId: string,
  options: FinalizeOptions
): Promise<FinalizedResult> {
  const { data: participant, error: participantError } = await admin
    .from('participants')
    .select('live_score, live_solved_count')
    .eq('game_id', gameId)
    .eq('user_id', userId)
    .single()

  if (participantError || !participant) {
    throw new Error(`Cannot finalize result: participant not found (${participantError?.message ?? 'no row'})`)
  }

  const { count: totalQuestions } = await admin
    .from('questions')
    .select('id', { count: 'exact', head: true })
    .eq('game_id', gameId)

  const solvedCount = participant.live_solved_count as number
  const total = totalQuestions ?? 0
  const accuracy = computeAccuracy(solvedCount, total)

  const { error: upsertError } = await admin.from('results').upsert(
    {
      game_id: gameId,
      user_id: userId,
      score: participant.live_score,
      completion_time_seconds: Math.max(0, Math.round(options.completionTimeSeconds)),
      solved_count: solvedCount,
      total_questions: total,
      accuracy,
      auto_submitted: options.autoSubmitted,
    },
    { onConflict: 'game_id,user_id' }
  )

  if (upsertError) {
    throw new Error(`Failed to save result: ${upsertError.message}`)
  }

  await admin
    .from('participants')
    .update({ status: 'submitted', submitted_at: new Date().toISOString() })
    .eq('game_id', gameId)
    .eq('user_id', userId)

  return {
    score: participant.live_score as number,
    completionTimeSeconds: Math.max(0, Math.round(options.completionTimeSeconds)),
    solvedCount,
    totalQuestions: total,
    accuracy,
    autoSubmitted: options.autoSubmitted,
  }
}
