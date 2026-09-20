import { createClient } from '@supabase/supabase-js'

const url = 'https://iiwqwbpebseauenuxumt.supabase.co'
const anonKey = 'sb_publishable_BNwsnhj9Km6J0M4ULqfrZA_NhTOca7X'

const supabase = createClient(url, anonKey)

async function main() {
  const { data: games, error } = await supabase
    .from('games')
    .select('id, game_code, title, status, creator_id, created_at, start_time, end_time')
    .order('created_at', { ascending: false })
    .limit(5)

  console.log('Error:', error)
  console.log('Recent games:', JSON.stringify(games, null, 2))
}

main().catch(console.error)
