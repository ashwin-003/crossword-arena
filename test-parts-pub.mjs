const url = 'https://ejjzjnkdwmsdegisrlah.supabase.co/rest/v1/participants_public?game_id=eq.c9217b89-87ac-4845-992c-5c2fecfb7ec8&select=*';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqanpqbmtkd21zZGVnaXNybGFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNDg2MzksImV4cCI6MjEwNTYyNDYzOX0.An3kJDBgJK_-hTDP7YfiQj4dhL14GqveNHoAcmyBdjY';

async function run() {
  const res = await fetch(url, {
    headers: { 'apikey': anonKey, 'Authorization': 'Bearer ' + anonKey }
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}
run();
