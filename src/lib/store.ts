import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import { DuplicateKeyError, type Collection, type StoreDriver } from "./stores/driver";
import { JsonFileDriver } from "./stores/json";
import { SupabaseDriver, broadcastChange } from "./stores/supabase";
import {
  EventPatchSchema,
  FamilySchema,
  MemberSchema,
  NewEventSchema,
  NoteSchema,
  PlanEventSchema,
  UserSchema,
  type EventPatch,
  type Family,
  type Member,
  type NewEvent,
  type Note,
  type PlanEvent,
  type PlannerSnapshot,
  type User,
} from "./types";

export { DuplicateKeyError };

/** Called after every change to a family's data, e.g. to ping its phones. */
export type ChangeListener = (family: Family) => void | Promise<void>;

// Invite codes avoid look-alike characters (0/O, 1/I/L) so they are easy to read out.
const INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const INVITE_LENGTH = 8;

export function newInviteCode(): string {
  const bytes = randomBytes(INVITE_LENGTH);
  return Array.from(bytes, (b) => INVITE_ALPHABET[b % INVITE_ALPHABET.length]).join("");
}

/** Accepts codes as typed ("k7qm-4xpr", "K7QM 4XPR") and returns the stored form. */
export function normalizeInviteCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function formatInviteCode(code: string): string {
  return code.length === INVITE_LENGTH ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

const MEMBER_COLORS = ["#4f46e5", "#0e9384", "#dd2590", "#dc6803", "#2e90fa", "#7a5af8", "#669f2a"];

/**
 * All data access. Accounts and families live here; everything inside a family
 * goes through `store.family(id)`, which can only see that family's records.
 */
export class PlannerStore {
  constructor(
    private readonly driver: StoreDriver,
    private readonly onChange?: ChangeListener,
  ) {}

  // ---- Accounts -------------------------------------------------------------

  async createUser(input: { email: string; name: string; passwordHash: string }): Promise<User> {
    const user = UserSchema.parse({
      ...input,
      email: input.email.trim().toLowerCase(),
      name: input.name.trim(),
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    });
    await this.driver.insert("users", { id: user.id, key: user.email, data: user });
    return user;
  }

  async getUser(id: string): Promise<User | null> {
    const raw = await this.driver.get("users", id);
    return raw ? UserSchema.parse(raw) : null;
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const raw = await this.driver.findByKey("users", email.trim().toLowerCase());
    return raw ? UserSchema.parse(raw) : null;
  }

  private async saveUser(user: User): Promise<void> {
    await this.driver.update("users", { id: user.id, key: user.email, data: UserSchema.parse(user) });
  }

  // ---- Families -------------------------------------------------------------

  async getFamily(id: string): Promise<Family | null> {
    const raw = await this.driver.get("families", id);
    return raw ? FamilySchema.parse(raw) : null;
  }

  async findFamilyByInviteCode(code: string): Promise<Family | null> {
    const normalized = normalizeInviteCode(code);
    if (!normalized) return null;
    const raw = await this.driver.findByKey("families", normalized);
    return raw ? FamilySchema.parse(raw) : null;
  }

  /** Creates a family with `user` as its first member (a parent). */
  async createFamily(user: User, input: { name: string; timeZone?: string }): Promise<Family> {
    let family: Family | undefined;
    for (let attempt = 0; !family; attempt++) {
      const candidate = FamilySchema.parse({
        id: randomUUID(),
        name: input.name.trim(),
        timeZone: input.timeZone || "UTC",
        inviteCode: newInviteCode(),
        syncKey: randomBytes(18).toString("base64url"),
        revision: randomUUID(),
        createdAt: new Date().toISOString(),
      });
      try {
        await this.driver.insert("families", { id: candidate.id, key: candidate.inviteCode, data: candidate });
        family = candidate;
      } catch (err) {
        if (!(err instanceof DuplicateKeyError) || attempt >= 4) throw err;
      }
    }
    await this.join(user, family, "parent");
    return family;
  }

  /** Adds `user` to the family behind `inviteCode`. Returns null for an unknown code. */
  async joinFamily(user: User, inviteCode: string): Promise<Family | null> {
    const family = await this.findFamilyByInviteCode(inviteCode);
    if (!family) return null;
    await this.join(user, family, "other");
    return family;
  }

  private async join(user: User, family: Family, role: Member["role"]): Promise<void> {
    const scoped = this.family(family.id);
    const members = await scoped.listMembers();
    if (!members.some((m) => m.userId === user.id)) {
      // Link to a member someone already added by the same name (e.g. "Priya"), if any.
      const sameName = members.find(
        (m) => !m.userId && m.name.toLowerCase() === user.name.toLowerCase(),
      );
      if (sameName) await scoped.updateMember(sameName.id, { userId: user.id });
      else await scoped.addMember({ name: user.name, role, userId: user.id });
    }
    await this.saveUser({ ...user, familyId: family.id });
  }

  /** Issues a new invite code; the old one stops working. */
  async rotateInviteCode(familyId: string): Promise<Family | null> {
    const family = await this.getFamily(familyId);
    if (!family) return null;
    for (let attempt = 0; ; attempt++) {
      const updated = { ...family, inviteCode: newInviteCode() };
      try {
        await this.driver.update("families", { id: family.id, key: updated.inviteCode, data: updated });
        return updated;
      } catch (err) {
        if (!(err instanceof DuplicateKeyError) || attempt >= 4) throw err;
      }
    }
  }

  family(familyId: string): FamilyStore {
    return new FamilyStore(this.driver, familyId, async () => {
      const family = await this.getFamily(familyId);
      if (!family) return;
      const updated = { ...family, revision: randomUUID() };
      await this.driver.update("families", { id: family.id, key: family.inviteCode, data: updated });
      try {
        await this.onChange?.(updated);
      } catch (err) {
        console.error("Change listener failed", err);
      }
    });
  }
}

/** One family's planner: members, events and notes. */
export class FamilyStore {
  constructor(
    private readonly driver: StoreDriver,
    readonly familyId: string,
    private readonly touch: () => Promise<void>,
  ) {}

  private async list<T>(collection: Collection, parse: (raw: unknown) => T): Promise<T[]> {
    return (await this.driver.listByFamily(collection, this.familyId)).map(parse);
  }

  private async put(collection: Collection, id: string, data: unknown, isNew: boolean) {
    const record = { id, familyId: this.familyId, data };
    if (isNew) await this.driver.insert(collection, record);
    else await this.driver.update(collection, record);
    await this.touch();
  }

  /** Looks up a record by id, but only if it belongs to this family. */
  private async find<T>(
    collection: Collection,
    id: string,
    parse: (raw: unknown) => T,
  ): Promise<T | null> {
    return (await this.list(collection, parse)).find((r) => (r as { id: string }).id === id) ?? null;
  }

  async snapshot(): Promise<PlannerSnapshot> {
    const [members, events, notes] = await Promise.all([
      this.listMembers(),
      this.listEvents(),
      this.listNotes(),
    ]);
    return { members, events, notes };
  }

  // ---- Members --------------------------------------------------------------

  async listMembers(): Promise<Member[]> {
    return this.list("members", (raw) => MemberSchema.parse(raw));
  }

  async addMember(input: Omit<Member, "id" | "role" | "color"> & Partial<Member>): Promise<Member> {
    const count = (await this.listMembers()).length;
    const member = MemberSchema.parse({
      color: MEMBER_COLORS[count % MEMBER_COLORS.length],
      ...input,
      id: randomUUID(),
    });
    await this.put("members", member.id, member, true);
    return member;
  }

  async updateMember(id: string, patch: Partial<Omit<Member, "id">>): Promise<Member | null> {
    const existing = await this.find("members", id, (raw) => MemberSchema.parse(raw));
    if (!existing) return null;
    const updated = MemberSchema.parse({ ...existing, ...patch, id });
    await this.put("members", id, updated, false);
    return updated;
  }

  // ---- Events ---------------------------------------------------------------

  async listEvents(range?: { from?: string; to?: string }): Promise<PlanEvent[]> {
    const events = await this.list("events", (raw) => PlanEventSchema.parse(raw));
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
    const event: PlanEvent = { ...NewEventSchema.parse(input), id: randomUUID() };
    await this.put("events", event.id, event, true);
    return event;
  }

  async updateEvent(id: string, patch: EventPatch): Promise<PlanEvent | null> {
    const existing = await this.find("events", id, (raw) => PlanEventSchema.parse(raw));
    if (!existing) return null;
    const parsed = EventPatchSchema.parse(patch);
    const defined = Object.fromEntries(Object.entries(parsed).filter(([, v]) => v !== undefined));
    const updated = PlanEventSchema.parse({ ...existing, ...defined, id });
    await this.put("events", id, updated, false);
    return updated;
  }

  async deleteEvent(id: string): Promise<boolean> {
    if (!(await this.find("events", id, (raw) => PlanEventSchema.parse(raw)))) return false;
    await this.driver.remove("events", id);
    await this.touch();
    return true;
  }

  // ---- Notes ----------------------------------------------------------------

  /** Most recent first. */
  async listNotes(limit = 100): Promise<Note[]> {
    const notes = await this.list("notes", (raw) => NoteSchema.parse(raw));
    return notes.reverse().slice(0, limit);
  }

  async getNote(id: string): Promise<Note | null> {
    return this.find("notes", id, (raw) => NoteSchema.parse(raw));
  }

  async addNote(input: { text: string; author: Member; status?: Note["status"] }): Promise<Note> {
    const note = NoteSchema.parse({
      id: randomUUID(),
      text: input.text.trim(),
      authorMemberId: input.author.id,
      authorName: input.author.name,
      createdAt: new Date().toISOString(),
      status: input.status ?? "saved",
    });
    await this.put("notes", note.id, note, true);
    return note;
  }

  async updateNote(id: string, patch: Partial<Pick<Note, "status" | "summary">>): Promise<Note | null> {
    const existing = await this.getNote(id);
    if (!existing) return null;
    const updated = NoteSchema.parse({ ...existing, ...patch });
    await this.put("notes", id, updated, false);
    return updated;
  }
}

function realtimeConfig() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && serviceRoleKey ? { url, serviceRoleKey } : null;
}

/** The realtime channel a family's devices listen on. */
export function familyChannel(family: Family): string {
  return `homeplanner-${family.syncKey}`;
}

let singleton: PlannerStore | undefined;

/**
 * Uses Supabase when SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set, and a
 * local JSON file otherwise.
 */
export function getStore(): PlannerStore {
  if (singleton) return singleton;
  const supabase = realtimeConfig();
  if (supabase) {
    singleton = new PlannerStore(
      new SupabaseDriver(supabase.url, supabase.serviceRoleKey),
      (family) =>
        broadcastChange(supabase.url, supabase.serviceRoleKey, familyChannel(family), family.revision),
    );
  } else {
    singleton = new PlannerStore(
      new JsonFileDriver(
        process.env.HOMEPLANNER_DATA_FILE ?? path.join(process.cwd(), "data", "homeplanner.json"),
      ),
    );
  }
  return singleton;
}

export function usingHostedDatabase(): boolean {
  return realtimeConfig() !== null;
}
