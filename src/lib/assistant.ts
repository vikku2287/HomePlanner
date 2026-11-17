import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat, betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { dueReminders } from "./reminders";
import type { FamilyStore } from "./store";
import { EventPatchSchema, NewEventSchema, type Family, type Member, type Note } from "./types";

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
- Keep replies short and friendly. Summarise what changed in a sentence or two.
- Several family members share this planner from their own phones. Messages are labelled with who sent them.`;

const NOTE_PROMPT = `${SYSTEM_PROMPT}

You are now processing a note one family member posted to the shared family feed, for example
"On Tuesday, Wednesday and Thursday fruits not needed for lunch" or
"Tuesday evening 6:15 to 6:50 swimming classes for the little one".
Turn it into updates to the family's plan:

- Read the plan first (list_members, list_events for the coming weeks) so you don't add duplicates
  and you update existing items when the note changes them.
- Weekday names mean the next such day on or after today in the family's time zone, unless the
  note says otherwise ("every Tuesday" means a weekly repeat).
- Use allDay for whole-day items (lunchbox changes, holidays, "no school"), and real start/end
  times for time slots.
- Resolve people ("the little one", "Dad", a name) against list_members. If the person is not a
  member yet, add them, picking the most likely role.
- If the note is just chatter with nothing to plan, change nothing.
- Finish with one or two plain sentences saying what you changed, written for the whole family
  (e.g. "Added swimming for Maya on Tue 18:15-18:50."). Do not ask questions; state assumptions.`;

export type ChatTurn = { role: "user" | "assistant"; content: string };

let client: Anthropic | undefined;
function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}

export interface ToolOptions {
  /** Marks events created by these tools as coming from this note. */
  sourceNoteId?: string;
  /** Called whenever a tool changes the planner. */
  onWrite?: () => void;
}

export function plannerTools(store: FamilyStore, options: ToolOptions = {}) {
  const wrote = <T>(value: T): T => {
    options.onWrite?.();
    return value;
  };
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
      run: async (input) => JSON.stringify(wrote(await store.addMember(input))),
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
      run: async (input) =>
        JSON.stringify(
          wrote(await store.addEvent({ ...input, sourceNoteId: options.sourceNoteId ?? input.sourceNoteId })),
        ),
    }),
    betaZodTool({
      name: "update_event",
      description: "Change fields on an existing event, e.g. move it, reassign it or mark it done.",
      inputSchema: z.object({ id: z.string(), changes: EventPatchSchema }),
      run: async ({ id, changes }) => {
        const updated = await store.updateEvent(id, changes);
        return updated ? JSON.stringify(wrote(updated)) : `No event with id ${id}.`;
      },
    }),
    betaZodTool({
      name: "delete_event",
      description: "Delete an event by id.",
      inputSchema: z.object({ id: z.string() }),
      run: async ({ id }) =>
        (await store.deleteEvent(id)) ? wrote(`Deleted ${id}.`) : `No event with id ${id}.`,
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

function contextNote(family: Family, speaker?: Member): string {
  const now = new Date();
  const local = now.toLocaleString("en-GB", {
    timeZone: family.timeZone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
  const who = speaker ? `, message from: ${speaker.name} (member id ${speaker.id})` : "";
  return `(Current time: ${now.toISOString()} = ${local} in the family time zone ${family.timeZone}${who})`;
}

function textOf(message: Anthropic.Beta.BetaMessage): string {
  return message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

/** Runs one chat turn: Claude may call planner tools several times before answering. */
export async function chat(
  store: FamilyStore,
  family: Family,
  speaker: Member,
  history: ChatTurn[],
): Promise<string> {
  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((turn, i) =>
    i === history.length - 1 && turn.role === "user"
      ? { role: "user", content: `${contextNote(family, speaker)}\n\n${turn.content}` }
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
  return textOf(final);
}

export interface NoteResult {
  status: "applied" | "no_change";
  summary: string;
}

/** Reads a family note and updates the shared plan to match it. */
export async function applyNote(store: FamilyStore, family: Family, note: Note): Promise<NoteResult> {
  const members = await store.listMembers();
  const author = members.find((m) => m.id === note.authorMemberId) ?? {
    id: note.authorMemberId,
    name: note.authorName,
    role: "other" as const,
    color: "",
  };
  let writes = 0;
  const final = await getClient().beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 16000,
    system: NOTE_PROMPT,
    output_config: { effort: "medium" },
    tools: plannerTools(store, { sourceNoteId: note.id, onWrite: () => writes++ }),
    messages: [
      {
        role: "user",
        content: `${contextNote(family, author)}\n\nNote posted to the family feed:\n"""\n${note.text}\n"""`,
      },
    ],
    ...fallback(),
  });
  if (final.stop_reason === "refusal") {
    return { status: "no_change", summary: "The assistant couldn't process this note." };
  }
  return {
    status: writes > 0 ? "applied" : "no_change",
    summary: textOf(final) || (writes > 0 ? "Plan updated." : "Nothing to change in the plan."),
  };
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
export async function suggest(store: FamilyStore, family: Family): Promise<Suggestions> {
  const snapshot = await store.snapshot();
  const response = await getClient().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    output_config: { effort: "low", format: betaZodOutputFormat(SuggestionsSchema) },
    messages: [
      {
        role: "user",
        content: `${contextNote(family)}

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
