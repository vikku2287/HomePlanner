import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat, betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { dueReminders } from "./reminders";
import type { PlannerStore } from "./store";
import { EventPatchSchema, NewEventSchema } from "./types";

export const MODEL = process.env.HOMEPLANNER_MODEL ?? "claude-opus-5-5";

/** Server-side fallback: if a request is declined, the API retries it on a suitable model. */
function fallback() {
  return {
    betas: ["server-side-fallback-2026-07-01"] as Anthropic.Beta.AnthropicBeta[],
    fallbacks: "default" as const,
  };
}

const SYSTEM_PROMPT = `You are HomePlanner, a warm and practical assistant for a family's shared planner.
You help the family keep track of chores, appointments, school, activities, meals and errands.

- Use the tools to read and change the planner. Never claim a change you did not make with a tool.
- Before changing or deleting an event, look it up with list_events so you use the right id.
- When a request is ambiguous (which day, who it's for), make a sensible assumption and say what you assumed.
- Offer a reminder for appointments and anything time-sensitive.
- Keep replies short and friendly. Summarise what changed in a sentence or two.`;

export type ChatTurn = { role: "user" | "assistant"; content: string };

let client: Anthropic | undefined;
function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}

export function plannerTools(store: PlannerStore) {
  return [
    betaZodTool({
      name: "list_members",
      description: "List the family members in the planner, with their ids.",
      inputSchema: z.object({}),
      run: async () => JSON.stringify(await store.listMembers()),
    }),
    betaZodTool({
      name: "add_member",
      description: "Add a family member to the planner.",
      inputSchema: z.object({
        name: z.string(),
        role: z.enum(["parent", "child", "other"]).optional(),
      }),
      run: async (input) => JSON.stringify(await store.addMember(input)),
    }),
    betaZodTool({
      name: "list_events",
      description:
        "List planner events, optionally between two ISO 8601 date-times. Recurring events are always included.",
      inputSchema: z.object({
        from: z.string().optional().describe("ISO 8601 start of range"),
        to: z.string().optional().describe("ISO 8601 end of range"),
      }),
      run: async (input) => JSON.stringify(await store.listEvents(input)),
    }),
    betaZodTool({
      name: "add_event",
      description:
        "Add an event, chore or task to the planner. Times are ISO 8601 with a UTC offset.",
      inputSchema: NewEventSchema,
      run: async (input) => JSON.stringify(await store.addEvent(input)),
    }),
    betaZodTool({
      name: "update_event",
      description: "Change fields on an existing event, e.g. move it, reassign it or mark it done.",
      inputSchema: z.object({ id: z.string(), changes: EventPatchSchema }),
      run: async ({ id, changes }) => {
        const updated = await store.updateEvent(id, changes);
        return updated ? JSON.stringify(updated) : `No event with id ${id}.`;
      },
    }),
    betaZodTool({
      name: "delete_event",
      description: "Delete an event by id.",
      inputSchema: z.object({ id: z.string() }),
      run: async ({ id }) =>
        (await store.deleteEvent(id)) ? `Deleted ${id}.` : `No event with id ${id}.`,
    }),
    betaZodTool({
      name: "get_upcoming_reminders",
      description: "Reminders that are due within the next N minutes (default 24 hours).",
      inputSchema: z.object({ windowMinutes: z.number().int().positive().optional() }),
      run: async ({ windowMinutes }) =>
        JSON.stringify(dueReminders(await store.listEvents(), new Date(), windowMinutes ?? 24 * 60)),
    }),
  ];
}

function contextNote(timeZone: string): string {
  return `(Current time: ${new Date().toISOString()}, family time zone: ${timeZone})`;
}

/** Runs one chat turn: Claude may call planner tools several times before answering. */
export async function chat(
  store: PlannerStore,
  history: ChatTurn[],
  timeZone = "UTC",
): Promise<string> {
  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((turn, i) =>
    i === history.length - 1 && turn.role === "user"
      ? { role: "user", content: `${contextNote(timeZone)}\n\n${turn.content}` }
      : turn,
  );

  const final = await getClient().beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    output_config: { effort: "medium" },
    tools: plannerTools(store),
    messages,
    ...fallback(),
  });

  if (final.stop_reason === "refusal") {
    return "Sorry, I can't help with that one.";
  }
  return final.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

export const SuggestionsSchema = z.object({
  suggestions: z.array(
    z.object({
      title: z.string(),
      detail: z.string(),
      kind: z.enum(["schedule", "balance", "reminder", "meal", "idea"]),
    }),
  ),
});
export type Suggestions = z.infer<typeof SuggestionsSchema>;

/** Asks Claude for a handful of practical suggestions based on the current plan. */
export async function suggest(store: PlannerStore, timeZone = "UTC"): Promise<Suggestions> {
  const snapshot = await store.snapshot();
  const response = await getClient().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    output_config: { effort: "low", format: betaZodOutputFormat(SuggestionsSchema) },
    messages: [
      {
        role: "user",
        content: `${contextNote(timeZone)}

Here is the family's planner as JSON:
${JSON.stringify(snapshot)}

Give 3 to 5 short, practical suggestions for the coming week: conflicts or overload to fix,
chores that could be shared more fairly, missing reminders, meal or activity ideas.`,
      },
    ],
    ...fallback(),
  });
  return response.parsed_output ?? { suggestions: [] };
}
