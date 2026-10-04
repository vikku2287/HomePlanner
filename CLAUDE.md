# HomePlanner

Next.js (App Router) + TypeScript family planner with a Claude-powered assistant.

- Check changes with `npm run typecheck && npm test && npm run build`.
- Data access goes through `PlannerStore` in `src/lib/store.ts`; schemas live in `src/lib/types.ts` (Zod) and are reused as the assistant's tool input schemas, so keep them descriptive.
- The assistant (`src/lib/assistant.ts`) uses the Anthropic TypeScript SDK's beta tool runner. Default model is `claude-opus-5-5`, overridable with `HOMEPLANNER_MODEL`.
