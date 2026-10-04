import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  EventPatchSchema,
  MemberSchema,
  NewEventSchema,
  PlannerDataSchema,
  type EventPatch,
  type Member,
  type NewEvent,
  type PlanEvent,
  type PlannerData,
} from "./types";

/**
 * A small JSON-file store. It keeps the starter project dependency-free;
 * swap it for a real database (e.g. Postgres) once the app needs multiple
 * households or concurrent writers.
 */
export class PlannerStore {
  constructor(private readonly file: string) {}

  private async read(): Promise<PlannerData> {
    try {
      const raw = await fs.readFile(this.file, "utf8");
      return PlannerDataSchema.parse(JSON.parse(raw));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return { members: [], events: [] };
      }
      throw err;
    }
  }

  private async write(data: PlannerData): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2));
    await fs.rename(tmp, this.file);
  }

  async snapshot(): Promise<PlannerData> {
    return this.read();
  }

  async listMembers(): Promise<Member[]> {
    return (await this.read()).members;
  }

  async addMember(input: Omit<Member, "id" | "role" | "color"> & Partial<Member>): Promise<Member> {
    const data = await this.read();
    const member = MemberSchema.parse({ ...input, id: randomUUID() });
    data.members.push(member);
    await this.write(data);
    return member;
  }

  async listEvents(range?: { from?: string; to?: string }): Promise<PlanEvent[]> {
    const { events } = await this.read();
    const from = range?.from ? Date.parse(range.from) : -Infinity;
    const to = range?.to ? Date.parse(range.to) : Infinity;
    return events
      .filter((e) => {
        const t = Date.parse(e.start);
        return e.recurrence !== "none" || (t >= from && t <= to);
      })
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  }

  async addEvent(input: NewEvent): Promise<PlanEvent> {
    const data = await this.read();
    const event: PlanEvent = { ...NewEventSchema.parse(input), id: randomUUID() };
    data.events.push(event);
    await this.write(data);
    return event;
  }

  async updateEvent(id: string, patch: EventPatch): Promise<PlanEvent | null> {
    const data = await this.read();
    const idx = data.events.findIndex((e) => e.id === id);
    if (idx === -1) return null;
    const parsed = EventPatchSchema.parse(patch);
    const defined = Object.fromEntries(Object.entries(parsed).filter(([, v]) => v !== undefined));
    data.events[idx] = { ...data.events[idx], ...defined };
    await this.write(data);
    return data.events[idx];
  }

  async deleteEvent(id: string): Promise<boolean> {
    const data = await this.read();
    const before = data.events.length;
    data.events = data.events.filter((e) => e.id !== id);
    if (data.events.length === before) return false;
    await this.write(data);
    return true;
  }
}

let singleton: PlannerStore | undefined;

export function getStore(): PlannerStore {
  singleton ??= new PlannerStore(
    process.env.HOMEPLANNER_DATA_FILE ?? path.join(process.cwd(), "data", "planner.json"),
  );
  return singleton;
}
