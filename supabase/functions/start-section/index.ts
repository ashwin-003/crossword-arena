// POST /start-section
// { gameId: string, sectionId: string }
//
// Called by the client whenever a student opens or switches to a section.
// Tracks server-authoritative per-section countdown timer and elapsed time.
//
// 1. Pauses any other active section for this student (accumulating elapsed time).
// 2. Starts or resumes the target section's timer.
// 3. Returns { isLocked, remainingSeconds, elapsedSeconds, timeLimitSeconds }.

import { handleOptions, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAdminClient, requireUser } from '../_shared/supabaseAdmin.ts'

interface StartSectionBody {
  gameId?: string
  sectionId?: string
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

  let body: StartSectionBody
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON body', 400)
  }

  const { gameId, sectionId } = body
  if (!gameId) return errorResponse('gameId is required.', 422)
  if (!sectionId) return errorResponse('sectionId is required.', 422)

  const admin = getAdminClient()

  // Verify the game is active
  const { data: game, error: gameError } = await admin
    .from('games')
    .select('id, status')
    .eq('id', gameId)
    .maybeSingle()

  if (gameError || !game) return errorResponse('Game not found.', 404)
  if (game.status !== 'active') return errorResponse('Game is not active.', 409)

  // Verify this user is a participant
  const { data: participant } = await admin
    .from('participants')
    .select('id, status')
    .eq('game_id', gameId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!participant) return errorResponse('You are not a participant of this game.', 403)
  if (participant.status === 'submitted') return errorResponse('You have already submitted this game.', 409)

  // Verify the section belongs to this game and retrieve its time limit
  const { data: section, error: sectionError } = await admin
    .from('game_sections')
    .select('id, time_limit_seconds')
    .eq('id', sectionId)
    .eq('game_id', gameId)
    .maybeSingle()

  if (sectionError || !section) return errorResponse('Section not found.', 404)

  const timeLimitSeconds = (section.time_limit_seconds as number) || 600
  const nowMs = Date.now()
  const nowIso = new Date(nowMs).toISOString()

  // 1. Pause any other currently running section timer for this student
  const { data: otherActiveTimers } = await admin
    .from('section_timers')
    .select('*, section:game_sections(time_limit_seconds)')
    .eq('game_id', gameId)
    .eq('user_id', user.id)
    .neq('section_id', sectionId)
    .not('last_active_at', 'is', null)

  if (otherActiveTimers && otherActiveTimers.length > 0) {
    for (const other of otherActiveTimers) {
      const otherLimit = (other.section as any)?.time_limit_seconds ?? 600
      const otherLastActiveMs = new Date(other.last_active_at as string).getTime()
      const deltaSec = Math.max(0, Math.floor((nowMs - otherLastActiveMs) / 1000))
      let newAccumulated = (other.elapsed_seconds as number) + deltaSec
      let lockOther = Boolean(other.is_locked)

      if (newAccumulated >= otherLimit) {
        newAccumulated = otherLimit
        lockOther = true
      }

      await admin
        .from('section_timers')
        .update({
          elapsed_seconds: newAccumulated,
          last_active_at: null,
          is_locked: lockOther,
        })
        .eq('id', other.id)
    }
  }

  // 2. Fetch existing timer row for the target section
  const { data: existingTimer } = await admin
    .from('section_timers')
    .select('*')
    .eq('section_id', sectionId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existingTimer?.is_locked) {
    return jsonResponse({
      ok: true,
      isLocked: true,
      remainingSeconds: 0,
      elapsedSeconds: existingTimer.elapsed_seconds,
      timeLimitSeconds,
    })
  }

  let elapsedSeconds: number

  if (!existingTimer) {
    // First time this student opens this section
    const { error: insertError } = await admin.from('section_timers').insert({
      game_id: gameId,
      section_id: sectionId,
      user_id: user.id,
      started_at: nowIso,
      elapsed_seconds: 0,
      last_active_at: nowIso,
      is_locked: false,
    })
    if (insertError) return errorResponse('Unable to start section timer.', 500, insertError.message)
    elapsedSeconds = 0
  } else {
    // Resume section — accumulate elapsed time
    let accumulated = existingTimer.elapsed_seconds as number
    if (existingTimer.last_active_at) {
      const lastActiveMs = new Date(existingTimer.last_active_at as string).getTime()
      accumulated += Math.max(0, Math.floor((nowMs - lastActiveMs) / 1000))
    }

    if (accumulated >= timeLimitSeconds) {
      // Time exhausted
      await admin
        .from('section_timers')
        .update({
          elapsed_seconds: timeLimitSeconds,
          last_active_at: null,
          is_locked: true,
        })
        .eq('section_id', sectionId)
        .eq('user_id', user.id)

      return jsonResponse({
        ok: true,
        isLocked: true,
        remainingSeconds: 0,
        elapsedSeconds: timeLimitSeconds,
        timeLimitSeconds,
      })
    }

    const { error: updateError } = await admin
      .from('section_timers')
      .update({
        elapsed_seconds: accumulated,
        last_active_at: nowIso,
      })
      .eq('section_id', sectionId)
      .eq('user_id', user.id)

    if (updateError) return errorResponse('Unable to resume section timer.', 500, updateError.message)
    elapsedSeconds = accumulated
  }

  const remainingSeconds = Math.max(0, timeLimitSeconds - elapsedSeconds)

  return jsonResponse({
    ok: true,
    isLocked: false,
    remainingSeconds,
    elapsedSeconds,
    timeLimitSeconds,
  })
})
