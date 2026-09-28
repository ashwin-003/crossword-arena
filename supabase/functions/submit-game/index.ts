// POST /submit-game
// { gameId: string, autoSubmitted?: boolean }
//
// The only path by which a player's overall result is finalized.
// For multi-section games: auto-submits any unsubmitted sections first,
// then aggregates section_results to compute the final results row
// (total score = sum of section scores, 1 mark per correct question;
// completion_time = elapsed time since match start, capped at match time limit).
// For legacy single-section games: falls back to the original scoring path.
// Idempotent: submitting twice returns the already-finalized result.

import { handleOptions, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAdminClient, requireUser } from '../_shared/supabaseAdmin.ts'
import { finalizeParticipantResult } from '../_shared/finalizeResult.ts'
import { computeAccuracy } from '../_shared/scoring.ts'

interface SubmitGameBody {
  gameId?: string
  autoSubmitted?: boolean
}

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response> | Response) => void
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  const { user } = await requireUser(req)
  if (!user) return errorResponse('Authentication required.', 401)

  let body: SubmitGameBody
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON body', 400)
  }

  const gameId = body.gameId
  const autoSubmitted = Boolean(body.autoSubmitted)
  if (!gameId) return errorResponse('gameId is required.', 422)

  const admin = getAdminClient()

  const { data: game, error: gameError } = await admin
    .from('games')
    .select('id, status, start_time, end_time, time_limit_seconds')
    .eq('id', gameId)
    .maybeSingle()

  if (gameError) return errorResponse('Unable to look up this game.', 500, gameError.message)
  if (!game) return errorResponse('Game not found.', 404)

  const { data: participant, error: participantError } = await admin
    .from('participants')
    .select('id, status')
    .eq('game_id', gameId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (participantError || !participant) {
    return errorResponse('You are not a participant of this game.', 403)
  }

  // Idempotent short-circuit: already finalized in current attempt
  if (participant.status === 'submitted') {
    const { data: existingResult } = await admin
      .from('results')
      .select('score, completion_time_seconds, solved_count, total_questions, accuracy, rank, auto_submitted, created_at')
      .eq('game_id', gameId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (existingResult) {
      const isFromCurrentRun =
        !game.start_time || new Date(existingResult.created_at).getTime() >= new Date(game.start_time).getTime()
      if (isFromCurrentRun) {
        return jsonResponse({ ok: true, result: existingResult, alreadySubmitted: true })
      }
    }
  }

  if (game.status !== 'active' && game.status !== 'ended') {
    return errorResponse('This game is not currently active.', 409)
  }

  // Calculate authoritative completion time from game.start_time
  const nowMs = Date.now()
  const timeLimitSeconds = (game.time_limit_seconds as number) || 3600
  let matchCompletionTimeSeconds = timeLimitSeconds

  if (game.start_time) {
    const startedMs = new Date(game.start_time).getTime()
    const rawElapsed = Math.floor((nowMs - startedMs) / 1000)
    matchCompletionTimeSeconds = Math.min(Math.max(0, rawElapsed), timeLimitSeconds)
  }

  if (autoSubmitted) {
    matchCompletionTimeSeconds = timeLimitSeconds
  }

  // Check if this is a multi-section game
  const { data: sections } = await admin
    .from('game_sections')
    .select('id, position, time_limit_seconds')
    .eq('game_id', gameId)
    .order('position', { ascending: true })

  const isMultiSection = Array.isArray(sections) && sections.length > 0

  let finalScore: number
  let finalSolvedCount: number
  let finalTotalQuestions: number
  let finalCompletionTimeSeconds: number
  let finalAccuracy: number

  if (isMultiSection) {
    // For each section not yet submitted, auto-submit it now
    for (const section of sections!) {
      const { data: existingSectionResult } = await admin
        .from('section_results')
        .select('id')
        .eq('section_id', section.id)
        .eq('user_id', user.id)
        .maybeSingle()

      if (!existingSectionResult) {
        // Lock section timer
        await admin
          .from('section_timers')
          .upsert(
            {
              game_id: gameId,
              section_id: section.id,
              user_id: user.id,
              elapsed_seconds: matchCompletionTimeSeconds,
              is_locked: true,
              last_active_at: null,
            },
            { onConflict: 'section_id,user_id' }
          )

        // Count correct answers for this section (1 mark each)
        const { data: sectionQuestions } = await admin
          .from('questions')
          .select('id, answer')
          .eq('game_id', gameId)
          .eq('section_id', section.id)

        const totalQ = sectionQuestions?.length ?? 0
        let sectionSolved = 0

        if (sectionQuestions && sectionQuestions.length > 0) {
          const qIds = sectionQuestions.map((q: { id: string }) => q.id)
          const { data: correctAnswers } = await admin
            .from('answers')
            .select('question_id')
            .eq('game_id', gameId)
            .eq('user_id', user.id)
            .eq('is_correct', true)
            .in('question_id', qIds)

          sectionSolved = correctAnswers?.length ?? 0
        }

        const sectionScore = sectionSolved // 1 mark per correct answer

        await admin.from('section_results').upsert(
          {
            game_id: gameId,
            section_id: section.id,
            user_id: user.id,
            score: sectionScore,
            solved_count: sectionSolved,
            total_questions: totalQ,
            completion_time_seconds: matchCompletionTimeSeconds,
            auto_submitted: autoSubmitted,
            submitted_at: new Date(nowMs).toISOString(),
          },
          { onConflict: 'section_id,user_id' }
        )
      }
    }

    // Aggregate all section_results for this student from the current attempt
    const { data: allSectionResults } = await admin
      .from('section_results')
      .select('score, solved_count, total_questions, submitted_at')
      .eq('game_id', gameId)
      .eq('user_id', user.id)

    finalScore = 0
    finalSolvedCount = 0
    finalTotalQuestions = 0
    finalCompletionTimeSeconds = matchCompletionTimeSeconds

    for (const sr of allSectionResults ?? []) {
      if (game.start_time && new Date(sr.submitted_at).getTime() < new Date(game.start_time).getTime()) {
        continue
      }
      finalScore += sr.score
      finalSolvedCount += sr.solved_count
      finalTotalQuestions += sr.total_questions
    }

    finalAccuracy = computeAccuracy(finalSolvedCount, finalTotalQuestions)

    // Write the aggregated results row
    const { error: upsertError } = await admin.from('results').upsert(
      {
        game_id: gameId,
        user_id: user.id,
        score: finalScore,
        completion_time_seconds: finalCompletionTimeSeconds,
        solved_count: finalSolvedCount,
        total_questions: finalTotalQuestions,
        accuracy: finalAccuracy,
        auto_submitted: autoSubmitted,
      },
      { onConflict: 'game_id,user_id' }
    )

    if (upsertError) {
      return errorResponse('Unable to save final result.', 500, upsertError.message)
    }

    // Mark participant as submitted
    await admin
      .from('participants')
      .update({
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        live_score: finalScore,
        live_solved_count: finalSolvedCount,
      })
      .eq('game_id', gameId)
      .eq('user_id', user.id)
  } else {
    // Legacy single-section path
    const finalized = await finalizeParticipantResult(admin, gameId, user.id, {
      autoSubmitted,
      completionTimeSeconds: matchCompletionTimeSeconds,
    })

    finalScore = finalized.score
    finalSolvedCount = finalized.solvedCount
    finalTotalQuestions = finalized.totalQuestions
    finalCompletionTimeSeconds = finalized.completionTimeSeconds
    finalAccuracy = finalized.accuracy
  }

  await admin.from('game_events').insert({
    game_id: gameId,
    user_id: user.id,
    event_type: 'submitted',
    event_data: {},
  })

  // Recompute ranks using deterministic tie-breaker
  await admin.rpc('recompute_ranks', { p_game_id: gameId })

  // Close match early if everyone has submitted
  const [{ count: participantCount }, { count: resultCount }] = await Promise.all([
    admin.from('participants').select('id', { count: 'exact', head: true }).eq('game_id', gameId),
    admin.from('results').select('id', { count: 'exact', head: true }).eq('game_id', gameId),
  ])

  if (
    game.status === 'active' &&
    participantCount !== null &&
    resultCount !== null &&
    resultCount >= participantCount
  ) {
    await admin.from('games').update({ status: 'ended' }).eq('id', gameId).eq('status', 'active')
    await admin.from('game_events').insert({
      game_id: gameId,
      user_id: null,
      event_type: 'game_ended',
      event_data: { reason: 'all_submitted' },
    })
  }

  const { data: finalResult } = await admin
    .from('results')
    .select('score, completion_time_seconds, solved_count, total_questions, accuracy, rank, auto_submitted')
    .eq('game_id', gameId)
    .eq('user_id', user.id)
    .maybeSingle()

  return jsonResponse({
    ok: true,
    result: finalResult ?? {
      score: finalScore,
      completion_time_seconds: finalCompletionTimeSeconds,
      solved_count: finalSolvedCount,
      total_questions: finalTotalQuestions,
      accuracy: finalAccuracy,
      rank: null,
      auto_submitted: autoSubmitted,
    },
  })
})
