import { z } from "zod";

export const MemberSchema = z.object({
  id: z.string(),
  name: z.string().min(1).describe("The person's first name or nickname"),
  role: z.enum(["parent", "child", "other"]).default("other"),
  color: z.string().default("#4f46e5"),
  /** The signed-in account this member belongs to. Children and others without a phone have none. */
  userId: z.string().optional(),
});
export type Member = z.infer<typeof MemberSchema>;

export const RecurrenceSchema = z.enum(["none", "daily", "weekly", "monthly"]);
export type Recurrence = z.infer<typeof RecurrenceSchema>;

export const PlanEventSchema = z.object({
  id: z.string(),
  title: z.string().min(1).describe("Short title, e.g. 'Swimming class' or 'No fruit in lunchbox'"),
  notes: z.string().optional().describe("Extra details worth keeping"),
  /** ISO 8601 date-time for the start of the event. */
  start: z
    .string()
    .datetime({ offset: true })
    .describe("ISO 8601 start with UTC offset. For all-day items use local midnight of that day."),
  /** ISO 8601 date-time for the end of the event, if any. */
  end: z.string().datetime({ offset: true }).optional().describe("ISO 8601 end with UTC offset"),
  /** True for things that apply to a whole day rather than a time slot. */
  allDay: z
    .boolean()
    .default(false)
    .describe("True for whole-day items such as 'no fruit needed for lunch' or 'school holiday'"),
  category: z
    .enum(["chore", "appointment", "school", "activity", "meal", "errand", "other"])
    .default("other"),
  /** Ids of family members this event belongs to. Empty means the whole family. */
  memberIds: z
    .array(z.string())
    .default([])
    .describe("Ids from list_members of the people this is for; empty means the whole family"),
  recurrence: RecurrenceSchema.default("none"),
  /** Minutes before `start` to remind. Omit for no reminder. */
  remindMinutesBefore: z.number().int().min(0).optional(),
  done: z.boolean().default(false),
  /** The family note this event was created from, if any. */
  sourceNoteId: z.string().optional().describe("Internal link to a family note; leave unset"),
});
export type PlanEvent = z.infer<typeof PlanEventSchema>;

export const NewEventSchema = PlanEventSchema.omit({ id: true });
export type NewEvent = z.input<typeof NewEventSchema>;

export const EventPatchSchema = NewEventSchema.partial();
export type EventPatch = z.input<typeof EventPatchSchema>;

export const NoteStatusSchema = z.enum([
  /** The assistant is turning the note into plan updates. */
  "processing",
  /** The assistant updated the plan. */
  "applied",
  /** The assistant read it but nothing in the plan needed to change. */
  "no_change",
  /** Saved without AI processing (no API key configured). */
  "saved",
  /** The assistant failed; the note is kept so it can be retried. */
  "error",
]);
export type NoteStatus = z.infer<typeof NoteStatusSchema>;

/** A free-text message any family member posts, e.g. "Tuesday 6:15 to 6:50 swimming for the little one". */
export const NoteSchema = z.object({
  id: z.string(),
  text: z.string().min(1).max(2000),
  authorMemberId: z.string(),
  authorName: z.string(),
  createdAt: z.string().datetime({ offset: true }),
  status: NoteStatusSchema.default("saved"),
  /** What the assistant changed in the plan, in a sentence or two. */
  summary: z.string().optional(),
});
export type Note = z.infer<typeof NoteSchema>;

export const FamilySchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(80),
  /** IANA time zone the family lives in, used when the assistant reads "Tuesday 6:15". */
  timeZone: z.string().default("UTC"),
  /** Code other family members type to join. Stored upper-case without separators. */
  inviteCode: z.string(),
  /** Unguessable id for the realtime channel; only shared with signed-in members. */
  syncKey: z.string(),
  /** Changes on every write, so devices can tell when to refresh. */
  revision: z.string(),
  createdAt: z.string().datetime({ offset: true }),
});
export type Family = z.infer<typeof FamilySchema>;

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().min(1).max(80),
  passwordHash: z.string(),
  familyId: z.string().optional(),
  createdAt: z.string().datetime({ offset: true }),
});
export type User = z.infer<typeof UserSchema>;
/** A user as it is safe to send to the browser. */
export type PublicUser = Omit<User, "passwordHash">;

export const PlannerSnapshotSchema = z.object({
  members: z.array(MemberSchema),
  events: z.array(PlanEventSchema),
  notes: z.array(NoteSchema),
});
export type PlannerSnapshot = z.infer<typeof PlannerSnapshotSchema>;
