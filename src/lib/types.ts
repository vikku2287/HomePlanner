import { z } from "zod";

export const MemberSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  role: z.enum(["parent", "child", "other"]).default("other"),
  color: z.string().default("#4f46e5"),
});
export type Member = z.infer<typeof MemberSchema>;

export const RecurrenceSchema = z.enum(["none", "daily", "weekly", "monthly"]);
export type Recurrence = z.infer<typeof RecurrenceSchema>;

export const PlanEventSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  notes: z.string().optional(),
  /** ISO 8601 date-time for the start of the event. */
  start: z.string().datetime({ offset: true }),
  /** ISO 8601 date-time for the end of the event, if any. */
  end: z.string().datetime({ offset: true }).optional(),
  category: z
    .enum(["chore", "appointment", "school", "activity", "meal", "errand", "other"])
    .default("other"),
  /** Ids of family members this event belongs to. Empty means the whole family. */
  memberIds: z.array(z.string()).default([]),
  recurrence: RecurrenceSchema.default("none"),
  /** Minutes before `start` to remind. Omit for no reminder. */
  remindMinutesBefore: z.number().int().min(0).optional(),
  done: z.boolean().default(false),
});
export type PlanEvent = z.infer<typeof PlanEventSchema>;

export const NewEventSchema = PlanEventSchema.omit({ id: true });
export type NewEvent = z.input<typeof NewEventSchema>;

export const EventPatchSchema = NewEventSchema.partial();
export type EventPatch = z.input<typeof EventPatchSchema>;

export const PlannerDataSchema = z.object({
  members: z.array(MemberSchema).default([]),
  events: z.array(PlanEventSchema).default([]),
});
export type PlannerData = z.infer<typeof PlannerDataSchema>;
