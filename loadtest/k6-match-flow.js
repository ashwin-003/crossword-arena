// k6 load test for the core CROSSWORD ARENA competition loop.
//
// Simulates N players joining an already-created match, waiting for the
// creator to start it, each solving a couple of words (via the
// check_word_answer RPC — the same call the real client makes on every
// completed word), then submitting. Run the staged plan in
// docs/LOAD_TESTING.md, not this file directly at max concurrency first.
//
// Usage:
//   k6 run -e SUPABASE_URL=https://xxx.supabase.co \
//          -e SUPABASE_ANON_KEY=xxx \
//          -e GAME_CODE=7K4P92 \
//          -e VUS=70 \
//          loadtest/k6-match-flow.js
//
// Prerequisites:
//   - A match already created via the app (or seeded) in 'waiting' status,
//     with its game code passed as GAME_CODE. This script does not create
//     the match itself — game creation is a single creator action, not a
//     concurrent one, and is measured separately (see LOAD_TESTING.md §1).
//   - VUS pre-registered demo accounts are NOT created by this script
//     either; see docs/LOAD_TESTING.md §"Seeding test accounts".

import http from 'k6/http'
import { check, sleep, group } from 'k6'
import { Counter, Trend } from 'k6/metrics'

const SUPABASE_URL = __ENV.SUPABASE_URL
const ANON_KEY = __ENV.SUPABASE_ANON_KEY
const GAME_CODE = __ENV.GAME_CODE
const VUS = parseInt(__ENV.VUS || '70', 10)

const joinDuration = new Trend('join_game_duration')
const rpcDuration = new Trend('check_word_duration')
const submitDuration = new Trend('submit_game_duration')
const failures = new Counter('flow_failures')

export const options = {
  scenarios: {
    match_flow: {
      executor: 'per-vu-iterations',
      vus: VUS,
      iterations: 1,
      maxDuration: '10m',
    },
  },
  thresholds: {
    // Loosen/tighten these per the staged run you're doing — see
    // docs/LOAD_TESTING.md for the pass/fail bar at each concurrency tier.
    http_req_failed: ['rate<0.02'],
    join_game_duration: ['p(95)<1500'],
    check_word_duration: ['p(95)<800'],
    submit_game_duration: ['p(95)<1500'],
  },
}

function authHeaders(accessToken) {
  return {
    'Content-Type': 'application/json',
    apikey: ANON_KEY,
    Authorization: `Bearer ${accessToken}`,
  }
}

function login(batchNumber, password) {
  const res = http.post(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    JSON.stringify({ email: `p${batchNumber}@players.crossword-arena.internal`, password }),
    { headers: { 'Content-Type': 'application/json', apikey: ANON_KEY } }
  )
  check(res, { 'login succeeded': (r) => r.status === 200 })
  if (res.status !== 200) {
    failures.add(1)
    return null
  }
  return res.json('access_token')
}

export default function () {
  // __VU is 1-indexed; map to a pre-seeded batch number range. Adjust the
  // base to match however you seeded accounts (see LOAD_TESTING.md).
  const batchNumber = String(200000 + __VU).slice(-6)
  const password = 'loadtest123'

  const token = login(batchNumber, password)
  if (!token) return

  const headers = authHeaders(token)

  group('join match', () => {
    const res = http.post(
      `${SUPABASE_URL}/functions/v1/join-game`,
      JSON.stringify({ gameCode: GAME_CODE }),
      { headers }
    )
    joinDuration.add(res.timings.duration)
    check(res, { 'join ok': (r) => r.status === 200 })
    if (res.status !== 200) failures.add(1)
  })

  // Wait for the creator to start the match (poll the game row directly —
  // this mirrors the app's Realtime subscription in spirit, without
  // requiring a websocket client inside k6).
  let gameId = null
  for (let i = 0; i < 60 && !gameId; i++) {
    const res = http.get(
      `${SUPABASE_URL}/rest/v1/games?game_code=eq.${GAME_CODE}&select=id,status,end_time`,
      { headers }
    )
    if (res.status === 200) {
      const rows = res.json()
      if (rows[0] && rows[0].status === 'active') {
        gameId = rows[0].id
      }
    }
    if (!gameId) sleep(1)
  }
  if (!gameId) {
    failures.add(1)
    return
  }

  // Fetch the (answer-free) question list, then simulate solving a couple
  // of words via the same RPC the real client calls on word completion.
  const questionsRes = http.get(
    `${SUPABASE_URL}/rest/v1/questions_public?game_id=eq.${gameId}&select=id,answer_length&limit=2`,
    { headers }
  )
  const questions = questionsRes.status === 200 ? questionsRes.json() : []

  for (const q of questions) {
    const guess = 'X'.repeat(q.answer_length) // deliberately wrong — this test measures throughput, not correctness
    const res = http.post(
      `${SUPABASE_URL}/rest/v1/rpc/check_word_answer`,
      JSON.stringify({ p_game_id: gameId, p_question_id: q.id, p_guess: guess }),
      { headers }
    )
    rpcDuration.add(res.timings.duration)
    check(res, { 'check_word_answer ok': (r) => r.status === 200 })
    sleep(Math.random() * 2) // stagger, like a real player pacing through clues
  }

  group('submit', () => {
    const res = http.post(
      `${SUPABASE_URL}/functions/v1/submit-game`,
      JSON.stringify({ gameId }),
      { headers }
    )
    submitDuration.add(res.timings.duration)
    check(res, { 'submit ok': (r) => r.status === 200 })
    if (res.status !== 200) failures.add(1)
  })
}
