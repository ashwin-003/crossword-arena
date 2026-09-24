// POST /submit-section
// { gameId: string, sectionId: string, autoSubmitted?: boolean }
//
// Called when a student submits a section, or automatically when the game timer expires.
// Evaluates answers server-side, validates sequential section progression,
// records 1 mark per correct answer, locks the section, updates student live progress,
// and if this is the final section, finalizes the complete game result.
// Idempotent: calling it twice returns the already-stored result.

import { handleOptions, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAdminClient, requireUser } from '../_shared/supabaseAdmin.ts'
import { computeAccuracy } from '../_shared/scoring.ts'

interface SubmitSectionBody {
  gameId?: string
  sectionId?: string
  autoSubmitted?: boolean
}

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response> | Response) => void
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  const { user } = await requireUser(req)
  if (!user) return errorResponse('Authentication required.', 401)

  let body: SubmitSectionBody
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON body', 400)
  }

  const { gameId, sectionId, autoSubmitted = false } = body
  if (!gameId) return errorResponse('gameId is required.', 422)
  if (!sectionId) return errorResponse('sectionId is required.', 422)

  const admin = getAdminClient()

  // 1. Verify game exists and is active or ended
  const { data: game, error: gameError } = await admin
    .from('games')
    .select('id, status, start_time, time_limit_seconds')
    .eq('id', gameId)
    .maybeSingle()

  if (gameError || !game) return errorResponse('Game not found.', 404)
  if (game.status !== 'active' && game.status !== 'ended') {
    return errorResponse('Game is not active.', 409)
  }

  // 2. Verify participant
  const { data: participant } = await admin
    .from('participants')
    .select('*')
    .eq('game_id', gameId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!participant) return errorResponse('You are not a participant of this game.', 403)

  // 3. Fetch all sections for the game in sequential position order
  const { data: allSections, error: sectionsError } = await admin
    .from('game_sections')
    .select('id, name, position, time_limit_seconds')
    .eq('game_id', gameId)
    .order('position', { ascending: true })

  if (sectionsError || !allSections || allSections.length === 0) {
    return errorResponse('No sections found for this game.', 404)
  }

  const currentSection = (allSections as Array<{ id: string; name: string; position: number; time_limit_seconds: number }>).find((s) => s.id === sectionId)
  if (!currentSection) return errorResponse('Section does not belong to this game.', 404)

  const currentSectionIndex = currentSection.position as number

  // 4. Sequential section validation:
  // All preceding sections (position < currentSectionIndex) MUST have been submitted in section_results
  const { data: prevSectionResults } = await admin
    .from('section_results')
    .select('section_id')
    .eq('game_id', gameId)
    .eq('user_id', user.id)

  const submittedSectionIdSet = new Set(((prevSectionResults as Array<{ section_id: string }>) ?? []).map((r) => r.section_id))

  for (const s of allSections) {
    if ((s.position as number) < currentSectionIndex) {
      if (!submittedSectionIdSet.has(s.id)) {
        return errorResponse(
          `Sequential progression required. You must submit ${s.name} before submitting ${currentSection.name}.`,
          409
        )
      }
    }
  }

  // 5. Idempotent short-circuit if this section is already submitted
  const { data: existingResult } = await admin
    .from('section_results')
    .select('*')
    .eq('section_id', sectionId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existingResult) {
    return jsonResponse({
      ok: true,
      alreadySubmitted: true,
      result: existingResult,
      progress: {
        completedSectionsCount: participant.completed_sections_count,
        currentSectionIndex: participant.current_section_index,
        currentSectionName: participant.current_section_name,
        totalScore: participant.live_score,
      },
    })
  }

  // 6. Calculate server-side elapsed time from match start
  const nowMs = Date.now()
  const timeLimitSeconds = (game.time_limit_seconds as number) || 3600
  let completionTimeSeconds = timeLimitSeconds

  if (game.start_time) {
    const startedMs = new Date(game.start_time).getTime()
    const rawElapsed = Math.floor((nowMs - startedMs) / 1000)
    completionTimeSeconds = Math.min(Math.max(0, rawElapsed), timeLimitSeconds)
  }

  // 7. Lock the section timer
  await admin
    .from('section_timers')
    .upsert(
      {
        game_id: gameId,
        section_id: sectionId,
        user_id: user.id,
        elapsed_seconds: completionTimeSeconds,
        is_locked: true,
        last_active_at: null,
      },
      { onConflict: 'section_id,user_id' }
    )

  // 8. Server-authoritative answer evaluation for this section (1 mark per correct answer)
  const { data: questions } = await admin
    .from('questions')
    .select('id, answer')
    .eq('game_id', gameId)
    .eq('section_id', sectionId)

  const totalQuestionsInSection = questions?.length ?? 0
  let solvedCount = 0
  let wrongCount = 0
  let unansweredCount = 0

  if (questions && questions.length > 0) {
    const questionIds = questions.map((q: { id: string; answer: string }) => q.id)

    const { data: userAnswers } = await admin
      .from('answers')
      .select('question_id, answer, is_correct')
      .eq('game_id', gameId)
      .eq('user_id', user.id)
      .in('question_id', questionIds)

    const answersMap = new Map<string, { answer: string; is_correct: boolean }>()
    for (const a of userAnswers ?? []) {
      answersMap.set(a.question_id, a)
    }

    for (const q of questions) {
      const userA = answersMap.get(q.id)
      if (!userA || !userA.answer || userA.answer.trim().length === 0) {
        unansweredCount += 1
      } else {
        const isCorrect = userA.answer.trim().toUpperCase() === q.answer.trim().toUpperCase()
        if (isCorrect) {
          solvedCount += 1
        } else {
          wrongCount += 1
        }
      }
    }
  }

  const sectionScore = solvedCount // 1 mark per correct answer

  // 9. Save section_results
  const { error: resultError } = await admin
    .from('section_results')
    .upsert(
      {
        game_id: gameId,
        section_id: sectionId,
        user_id: user.id,
        score: sectionScore,
        solved_count: solvedCount,
        total_questions: totalQuestionsInSection,
        completion_time_seconds: completionTimeSeconds,
        auto_submitted: Boolean(autoSubmitted),
        submitted_at: new Date(nowMs).toISOString(),
      },
      { onConflict: 'section_id,user_id' }
    )

  if (resultError) {
    return errorResponse('Unable to save section result.', 500, resultError.message)
  }

  // 10. Compute aggregated progress across all completed sections
  const { data: allUserSectionResults } = await admin
    .from('section_results')
    .select('section_id, score, solved_count, total_questions, completion_time_seconds')
    .eq('game_id', gameId)
    .eq('user_id', user.id)

  let cumulativeScore = 0
  let cumulativeSolved = 0
  let cumulativeTotalQuestions = 0

  for (const sr of allUserSectionResults ?? []) {
    cumulativeScore += sr.score as number
    cumulativeSolved += sr.solved_count as number
    cumulativeTotalQuestions += sr.total_questions as number
  }

  const completedCount = allUserSectionResults?.length ?? 0
  const isFinalSection = currentSectionIndex === allSections.length - 1 || completedCount >= allSections.length

  const nextSection = allSections[currentSectionIndex + 1] ?? null
  const nextSectionIndex = nextSection ? (nextSection.position as number) : currentSectionIndex
  const nextSectionName = nextSection ? (nextSection.name as string) : currentSection.name
  const currentSectionStatus = isFinalSection ? 'Completed' : 'In Progress'

  // 11. If final section, finalize the entire game in `results`
  if (isFinalSection) {
    const totalQuestionsGame = (
      await admin.from('questions').select('id', { count: 'exact', head: true }).eq('game_id', gameId)
    ).count ?? 60

    const finalAccuracy = computeAccuracy(cumulativeSolved, totalQuestionsGame)

    await admin.from('results').upsert(
      {
        game_id: gameId,
        user_id: user.id,
        score: cumulativeScore,
        completion_time_seconds: completionTimeSeconds,
        solved_count: cumulativeSolved,
        total_questions: totalQuestionsGame,
        accuracy: finalAccuracy,
        auto_submitted: Boolean(autoSubmitted),
      },
      { onConflict: 'game_id,user_id' }
    )

    await admin.rpc('recompute_ranks', { p_game_id: gameId })
  }

  // 12. Update student-wise live progress columns on `public.participants`
  const { count: totalQuestionsInMatch } = await admin
    .from('questions')
    .select('id', { count: 'exact', head: true })
    .eq('game_id', gameId)

  const totalQuestions = totalQuestionsInMatch ?? 60
  const totalAttempted = cumulativeSolved + wrongCount
  const totalUnanswered = Math.max(0, totalQuestions - totalAttempted)

  await admin
    .from('participants')
    .update({
      status: isFinalSection ? 'submitted' : 'active',
      submitted_at: isFinalSection ? new Date(nowMs).toISOString() : null,
      live_score: cumulativeScore,
      live_solved_count: cumulativeSolved,
      completed_sections_count: completedCount,
      current_section_index: nextSectionIndex,
      current_section_name: isFinalSection ? 'Completed' : nextSectionName,
      current_section_status: currentSectionStatus,
      total_correct: cumulativeSolved,
      total_wrong: wrongCount,
      total_unanswered: totalUnanswered,
      total_attempted: totalAttempted,
      last_seen_at: new Date(nowMs).toISOString(),
    })
    .eq('game_id', gameId)
    .eq('user_id', user.id)

  return jsonResponse({
    ok: true,
    result: {
      sectionId,
      sectionName: currentSection.name,
      score: sectionScore,
      solvedCount,
      totalQuestions: totalQuestionsInSection,
      completionTimeSeconds,
      autoSubmitted: Boolean(autoSubmitted),
    },
    progress: {
      completedSectionsCount: completedCount,
      totalSections: allSections.length,
      nextSectionId: nextSection?.id ?? null,
      nextSectionName: nextSection?.name ?? null,
      nextSectionIndex,
      isFinalSection,
      totalScore: cumulativeScore,
      maxScore: totalQuestions,
      correctAnswers: cumulativeSolved,
      wrongAnswers: wrongCount,
      unansweredQuestions: totalUnanswered,
      answeredQuestions: totalAttempted,
      status: isFinalSection ? 'Completed' : 'In Progress',
    },
  })
})
