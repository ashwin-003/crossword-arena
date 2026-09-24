// POST /update-game-state
// { gameId?: string }
//
// Sweeps any 'active' game whose server-authoritative end_time has passed:
// auto-submits every participant who hasn't manually submitted (scoring
// whatever they had saved), recomputes ranks, and closes the game out.

import { handleOptions, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAdminClient, requireUser } from '../_shared/supabaseAdmin.ts'
import { finalizeParticipantResult } from '../_shared/finalizeResult.ts'
import { computeAccuracy } from '../_shared/scoring.ts'

interface UpdateGameStateBody {
  gameId?: string
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

  let body: UpdateGameStateBody = {}
  try {
    body = req.body ? await req.json() : {}
  } catch {
    body = {}
  }

  const admin = getAdminClient()
  const nowIso = new Date().toISOString()
  const nowMs = Date.now()

  let query = admin
    .from('games')
    .select('id, end_time, time_limit_seconds')
    .eq('status', 'active')
    .lte('end_time', nowIso)

  if (body.gameId) query = query.eq('id', body.gameId)

  const { data: overdueGames, error: overdueError } = await query
  if (overdueError) return errorResponse('Unable to sweep game state.', 500, overdueError.message)

  const endedGameIds: string[] = []

  for (const game of overdueGames ?? []) {
    const { data: pendingParticipants } = await admin
      .from('participants')
      .select('user_id')
      .eq('game_id', game.id)
      .neq('status', 'submitted')

    const { data: sections } = await admin
      .from('game_sections')
      .select('id, position')
      .eq('game_id', game.id)
      .order('position', { ascending: true })

    const isMultiSection = Array.isArray(sections) && sections.length > 0
    const timeLimitSeconds = (game.time_limit_seconds as number) || 3600

    for (const p of pendingParticipants ?? []) {
      try {
        if (isMultiSection) {
          // Auto-submit all sections for this participant
          for (const section of sections!) {
            const { data: existingSr } = await admin
              .from('section_results')
              .select('id')
              .eq('section_id', section.id)
              .eq('user_id', p.user_id)
              .maybeSingle()

            if (!existingSr) {
              const { data: sectionQuestions } = await admin
                .from('questions')
                .select('id, answer')
                .eq('game_id', game.id)
                .eq('section_id', section.id)

              const totalQ = sectionQuestions?.length ?? 0
              let sectionSolved = 0

              if (sectionQuestions && sectionQuestions.length > 0) {
                const qIds = sectionQuestions.map((q: { id: string }) => q.id)
                const { data: correctAnswers } = await admin
                  .from('answers')
                  .select('question_id')
                  .eq('game_id', game.id)
                  .eq('user_id', p.user_id)
                  .eq('is_correct', true)
                  .in('question_id', qIds)

                sectionSolved = correctAnswers?.length ?? 0
              }

              await admin.from('section_results').upsert(
                {
                  game_id: game.id,
                  section_id: section.id,
                  user_id: p.user_id,
                  score: sectionSolved,
                  solved_count: sectionSolved,
                  total_questions: totalQ,
                  completion_time_seconds: timeLimitSeconds,
                  auto_submitted: true,
                  submitted_at: nowIso,
                },
                { onConflict: 'section_id,user_id' }
              )
            }
          }

          // Aggregate all section_results
          const { data: allSectionResults } = await admin
            .from('section_results')
            .select('score, solved_count, total_questions')
            .eq('game_id', game.id)
            .eq('user_id', p.user_id)

          let finalScore = 0
          let finalSolved = 0
          let finalTotal = 0

          for (const sr of allSectionResults ?? []) {
            finalScore += sr.score
            finalSolved += sr.solved_count
            finalTotal += sr.total_questions
          }

          const finalAccuracy = computeAccuracy(finalSolved, finalTotal)

          await admin.from('results').upsert(
            {
              game_id: game.id,
              user_id: p.user_id,
              score: finalScore,
              completion_time_seconds: timeLimitSeconds,
              solved_count: finalSolved,
              total_questions: finalTotal,
              accuracy: finalAccuracy,
              auto_submitted: true,
            },
            { onConflict: 'game_id,user_id' }
          )

          await admin
            .from('participants')
            .update({
              status: 'submitted',
              submitted_at: nowIso,
              live_score: finalScore,
              live_solved_count: finalSolved,
            })
            .eq('game_id', game.id)
            .eq('user_id', p.user_id)
        } else {
          await finalizeParticipantResult(admin, game.id, p.user_id, {
            autoSubmitted: true,
            completionTimeSeconds: timeLimitSeconds,
          })
        }
      } catch {
        continue
      }
    }

    await admin.rpc('recompute_ranks', { p_game_id: game.id })
    await admin.from('games').update({ status: 'ended' }).eq('id', game.id).eq('status', 'active')
    await admin.from('game_events').insert({
      game_id: game.id,
      user_id: null,
      event_type: 'game_ended',
      event_data: { reason: 'timer_expired' },
    })

    endedGameIds.push(game.id)
  }

  return jsonResponse({ ok: true, endedGames: endedGameIds })
})
