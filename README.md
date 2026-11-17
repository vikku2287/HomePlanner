# HomePlanner

A shared family planner with an AI assistant. Everyone in the family installs it on their
phone, joins the same private family with an invite code, and posts quick notes like
"On Tuesday, Wednesday and Thursday fruits not needed for lunch" or "Tuesday evening 6:15 to
6:50 swimming classes for the little one". The assistant turns each note into updates to the
shared weekly plan, and every phone sees the change within seconds.

## Features

- **Family sharing**: email and password accounts; a private family per household, joined
  with an 8-character invite code (share it from the Family tab; you can issue a new one).
- **Notes feed**: any member posts free text. It is shared immediately, then Claude reads it
  and adds, moves or updates items in the weekly plan, and records what it changed.
- **Weekly plan**: a Monday to Sunday view of timed and all-day items, colour-coded by person,
  with repeats and "from Priya's note" links.
- **Sync**: with Supabase configured, devices get an instant realtime ping on every change
  (the ping carries no family data) and refetch through the signed-in API. Devices also check
  a cheap revision endpoint when opened and periodically, so nothing goes stale.
- **Installable app (PWA)**: "Add to Home Screen" on iPhone (Safari) or "Install app" on Android
  (Chrome) gives a full-screen app with its own icon. One codebase, no app store needed.
- **AI assistant chat**, **reminders** and **AI suggestions**, as before, now per family.

## Getting started

Requires Node.js 20 or newer and an [Anthropic API key](https://console.anthropic.com/).

```bash
npm install
cp .env.example .env.local   # then set ANTHROPIC_API_KEY
npm run dev                  # http://localhost:3000
```

The planner works without a key; only the chat and suggestions need it.

| Command             | What it does                    |
| ------------------- | ------------------------------- |
| `npm run dev`       | Start the dev server            |
| `npm test`          | Run unit tests (Vitest)         |
| `npm run typecheck` | Type-check with `tsc`           |
| `npm run build`     | Production build                |

## Configuration

| Variable                     | Default                    | Purpose                                     |
| ---------------------------- | -------------------------- | ------------------------------------------- |
| `ANTHROPIC_API_KEY`          | (required for AI)          | Claude API key                              |
| `HOMEPLANNER_SESSION_SECRET` | dev-only value             | Signs sign-in cookies; required in production |
| `SUPABASE_URL`               | (unset: local JSON file)   | Hosted database + realtime                  |
| `SUPABASE_SERVICE_ROLE_KEY`  |                            | Server-only database key                    |
| `SUPABASE_ANON_KEY`          |                            | Public key phones use for realtime pings    |
| `HOMEPLANNER_MODEL`          | `claude-opus-5-5`          | Claude model for the assistant              |
| `HOMEPLANNER_DATA_FILE`      | `./data/homeplanner.json`  | Local data file when Supabase isn't set     |

## Putting it on your family's phones

Phones need to reach one shared server and database, so the app has to be deployed:

1. **Supabase** (free tier is fine): create a project at https://supabase.com. In
   *SQL Editor*, run `supabase/schema.sql`. In *Realtime > Settings*, make sure public
   channels are allowed. Copy the project URL, `service_role` key and `anon` key from
   *Project Settings > API*.
2. **Vercel** (or any Node host): import this GitHub repo at https://vercel.com/new and add
   the environment variables above (`ANTHROPIC_API_KEY`, `HOMEPLANNER_SESSION_SECRET`,
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`). Deploy.
3. Open the site on your phone, create an account and a family, then **Add to Home Screen**.
   Share the invite code from the Family tab with everyone else.

Without the Supabase variables the app uses a local JSON file, which is fine for trying it on
one computer (open it in two browsers to see sync) but not for phones on different networks.

## Project layout

```
src/
  app/                 Next.js App Router pages and API routes
    api/auth/*         signup, login, logout (signed httpOnly cookie)
    api/me             who is signed in, their family, realtime settings
    api/family         create a family; /join with an invite code; /invite for a new code
    api/plan, api/sync the family's whole plan; its current revision
    api/notes          GET/POST family notes; /:id/retry re-runs the assistant
    api/chat           POST: one assistant turn (tool-using agent loop)
    api/events         GET/POST events, PATCH/DELETE /api/events/:id
    api/members        GET/POST family members
    api/reminders      GET reminders due in the next N minutes
    api/suggestions    GET AI suggestions for the week
  app/manifest.ts      PWA manifest (public/sw.js is the service worker)
  components/          App shell, week view, notes feed, chat, family panel, sync hook
  lib/
    assistant.ts       Claude client, planner tools, suggestions
    reminders.ts       Recurrence and reminder calculation
    auth.ts, session.ts  passwords, session cookies, requireFamily()
    notes.ts           runs the assistant over a posted note
    store.ts           PlannerStore: accounts, families, family-scoped data
    stores/            storage drivers: JSON file, Supabase (+ realtime broadcast)
    types.ts           Zod schemas for users, families, members, events and notes
supabase/schema.sql    database table for the hosted setup
tests/                 Vitest unit tests
```

## Roadmap ideas

- Push notifications to phones when someone else changes the plan (Web Push).
- Push/email/SMS reminders from a background job instead of only in the open browser tab.
- Stream assistant replies and keep tool-call history across turns.
- Calendar import/export (iCal, Google Calendar).
