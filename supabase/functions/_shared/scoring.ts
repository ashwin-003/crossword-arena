// ============================================================================
// Scoring reference.
//
// The actual points-per-solved-word formula lives in exactly ONE place: the
// `scoring_points_for_answer()` Postgres function (see
// supabase/migrations/0003_functions_triggers.sql), applied the instant a
// word is validated correct by check_word_answer(). participants.live_score
// is therefore already the authoritative running total — finalization here
// never recomputes points, it only snapshots live_score/live_solved_count
// into an immutable `results` row alongside accuracy and completion time.
// This file just centralizes that snapshot + the accuracy calculation so
// it isn't duplicated across submit-game / update-game-state / calculate-result.
// ============================================================================

export function computeAccuracy(solvedCount: number, totalQuestions: number): number {
  if (totalQuestions <= 0) return 0
  const pct = (solvedCount / totalQuestions) * 100
  return Math.round(pct * 100) / 100
}
