# HomePlanner

A shared family planner with an AI assistant. Chat with the assistant to add, move or finish
plans ("Add soccer for Maya every Tuesday at 5pm", "Move Friday's dentist to 4pm"), get
reminders before things start, and ask for AI suggestions for the week.

## Features

- **Planner**: events, chores and tasks with a category, assigned family members, optional
  daily/weekly/monthly repeat, and a done checkbox.
- **AI assistant**: a Claude-powered chat that reads and edits the planner through tools
  (`list_events`, `add_event`, `update_event`, `delete_event`, `add_member`, ...).
- **Reminders**: each event can have a "remind N minutes before"; the app shows what's coming
  up and can raise browser notifications.
- **Suggestions**: Claude reviews the plan and returns structured suggestions (conflicts,
  fairer chore sharing, missing reminders, meal and activity ideas).

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

| Variable                | Default                | Purpose                         |
| ----------------------- | ---------------------- | ------------------------------- |
| `ANTHROPIC_API_KEY`     | (required for AI)      | Claude API key                  |
| `HOMEPLANNER_MODEL`     | `claude-opus-5-5`      | Claude model for the assistant  |
| `HOMEPLANNER_DATA_FILE` | `./data/planner.json`  | Where planner data is stored    |

## Project layout

```
src/
  app/                 Next.js App Router pages and API routes
    api/chat           POST: one assistant turn (tool-using agent loop)
    api/events         GET/POST events, PATCH/DELETE /api/events/:id
    api/members        GET/POST family members
    api/reminders      GET reminders due in the next N minutes
    api/suggestions    GET AI suggestions for the week
  components/          Planner and Chat UI
  lib/
    assistant.ts       Claude client, planner tools, suggestions
    reminders.ts       Recurrence and reminder calculation
    store.ts           JSON-file data store
    types.ts           Zod schemas for members and events
tests/                 Vitest unit tests
```

## Roadmap ideas

- Swap the JSON store for a database and add sign-in so each family has its own planner.
- Push/email/SMS reminders from a background job instead of only in the open browser tab.
- Stream assistant replies and keep tool-call history across turns.
- Calendar import/export (iCal, Google Calendar).
