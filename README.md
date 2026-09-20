# CROSSWORD ARENA

**Think fast. Solve smart. Compete live.**

A real-time multiplayer crossword competition platform: React + TypeScript + Vite on the frontend, Supabase (Postgres, Auth, Realtime, Edge Functions, RLS) on the backend, deployable as a single project on Vercel.

Every registered player is equal — there is no admin, moderator, or participant role. Anyone can create a match, anyone can join one with a 6-character code, and the match creator (an ownership relationship, not a privileged role) starts their own game.

## Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, React Router.
- **Backend:** Supabase Postgres (schema + RLS + SQL functions), Supabase Auth, Supabase Realtime (Postgres Changes), Supabase Edge Functions (Deno).
- **Deployment:** a single Vercel project for the frontend; Supabase hosts the database/auth/functions.

## Project layout

```
src/                      React app
  components/              auth, layout, lobby, game, crossword, leaderboard, results, ui
  pages/                    one component per route
  hooks/                    realtime, timer, fullscreen, autosave, crossword interaction
  services/                 thin wrappers around Supabase queries + Edge Function calls
  lib/                      supabase client, auth helpers, edge-function invoke helper
  types/                    hand-written DB row types + crossword domain types
  utils/                    crossword generator, answer formatting, formatting helpers
supabase/
  migrations/               schema, views, functions/triggers, RLS policies (run in order)
  functions/                Edge Functions: register, create-game, join-game, start-game,
                             submit-game, calculate-result, update-game-state
  seed.sql                  local dev seed data (3 demo accounts + 1 demo match)
docs/
  ARCHITECTURE.md           how the server-authoritative pieces fit together
  TESTING_STRATEGY.md
  LOAD_TESTING.md
scripts/
  dev-test-generator.ts     standalone smoke test for the crossword layout algorithm
```

## Local setup

### 1. Prerequisites

- Node.js 20+
- [Supabase CLI](https://supabase.com/docs/guides/cli) (`brew install supabase/tap/supabase` or see their docs)
- Docker (the Supabase CLI runs Postgres/Auth/Realtime/Functions locally in containers)

### 2. Install dependencies

```bash
npm install
```

### 3. Start Supabase locally

```bash
supabase start
```

This applies every migration in `supabase/migrations/` in order and then runs `supabase/seed.sql`, giving you three demo accounts and one demo match. It prints a local API URL, anon key, and service role key — copy them into your env files (see next step).

### 4. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from the `supabase start` output (or your hosted project's API settings).

Edge Functions need their own secrets (they run in Deno, outside the Vite build):

```bash
supabase secrets set SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
```

When developing locally, `supabase functions serve` picks these up automatically from `supabase start`'s output — see the CLI's own `--env-file` flag if you'd rather pass a `.env` file.

### 5. Serve the Edge Functions locally

```bash
supabase functions serve
```

### 6. Run the frontend

```bash
npm run dev
```

Visit the printed local URL. Log in with a demo account: batch number `100001`, password `password123` (see `supabase/seed.sql` for all three).

## Deploying

**Supabase (do this first):**

1. `supabase link --project-ref YOUR_PROJECT_REF`
2. `supabase db push` — applies all migrations to your hosted project.
3. `supabase functions deploy` — deploys every function in `supabase/functions/`.
4. `supabase secrets set SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...` — the functions need these as secrets (the service role key must **never** appear in frontend code or the `VITE_`-prefixed env vars).
5. In the Supabase dashboard, double-check Auth settings match `supabase/config.toml`: minimum password length `1`, email confirmations off (see the comments in that file for why — batch-number auth has no real inbox behind it).

**Vercel (frontend only — this is a single-repo deployment, not two separate services):**

1. Import this repo into Vercel. `vercel.json` already sets the build command, output directory, and the SPA rewrite Vite/React Router needs.
2. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as Vercel project environment variables (same values as your `.env.local`, pointed at your hosted Supabase project). Nothing else from `.env.example` belongs in Vercel — the Edge Function secrets live in Supabase, not here.
3. Deploy.

## Database schema & security model

See `docs/ARCHITECTURE.md` for the full design rationale (auth, RLS, scoring, realtime, crossword generation). The short version: the browser is never trusted for game status, timing, correctness, score, or rank — those are only ever written by SECURITY DEFINER Postgres functions or Edge Functions using the service role key, which every RLS policy in `supabase/migrations/0004_rls_policies.sql` is built around.

## Testing

See `docs/TESTING_STRATEGY.md` and `docs/LOAD_TESTING.md`.

Quick smoke test for the crossword layout algorithm (no Supabase required):

```bash
npm run test:generator
```
