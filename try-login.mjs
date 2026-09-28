const url = 'https://ejjzjnkdwmsdegisrlah.supabase.co/auth/v1/token?grant_type=password';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqanpqbmtkd21zZGVnaXNybGFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNDg2MzksImV4cCI6MjEwNTYyNDYzOX0.An3kJDBgJK_-hTDP7YfiQj4dhL14GqveNHoAcmyBdjY';

async function tryLogin(email, password) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': anonKey },
    body: JSON.stringify({ email, password })
  });
  console.log(email, password, res.status);
}

await tryLogin('dharshantry04@gmail.com', '123456');
await tryLogin('dharshantry04@gmail.com', 'password');
await tryLogin('dharshantry04@gmail.com', 'password123');
await tryLogin('dharshantry04@gmail.com', 'crossword');
