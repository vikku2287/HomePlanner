import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DuplicateKeyError, PlannerStore, formatInviteCode, normalizeInviteCode } from "@/lib/store";
import { JsonFileDriver } from "@/lib/stores/json";
import type { Family, User } from "@/lib/types";

describe("PlannerStore", () => {
  let dir: string;
  let store: PlannerStore;
  let changes: Family[];

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "homeplanner-"));
    changes = [];
    store = new PlannerStore(new JsonFileDriver(path.join(dir, "planner.json")), (f) => {
      changes.push(f);
    });
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  const signUp = (name: string, email = `${name.toLowerCase()}@example.com`) =>
    store.createUser({ name, email, passwordHash: "x" });

  async function familyOf(user: User) {
    const family = await store.createFamily(user, { name: "The Kumars", timeZone: "Europe/London" });
    return { family, planner: store.family(family.id) };
  }

  describe("accounts", () => {
    it("normalises emails and rejects duplicates", async () => {
      const u = await signUp("Asha", " Asha@Example.com ");
      expect(u.email).toBe("asha@example.com");
      expect((await store.findUserByEmail("ASHA@example.com"))?.id).toBe(u.id);
      await expect(signUp("Asha again", "asha@example.com")).rejects.toBeInstanceOf(DuplicateKeyError);
    });
  });

  describe("families", () => {
    it("creates a family with its creator as a parent member", async () => {
      const asha = await signUp("Asha");
      const { family, planner } = await familyOf(asha);
      expect(family.inviteCode).toMatch(/^[A-Z2-9]{8}$/);
      expect((await store.getUser(asha.id))?.familyId).toBe(family.id);
      expect(await planner.listMembers()).toMatchObject([{ name: "Asha", role: "parent", userId: asha.id }]);
    });

    it("lets others join with the invite code, however it's typed", async () => {
      const asha = await signUp("Asha");
      const { family, planner } = await familyOf(asha);
      const ravi = await signUp("Ravi");
      const typed = formatInviteCode(family.inviteCode).toLowerCase().replace("-", " ");
      expect((await store.joinFamily(ravi, typed))?.id).toBe(family.id);
      expect((await planner.listMembers()).map((m) => m.name)).toEqual(["Asha", "Ravi"]);
      expect(await store.joinFamily(await signUp("Eve"), "NOPE1234")).toBeNull();
    });

    it("links a joining user to a member already added by name", async () => {
      const asha = await signUp("Asha");
      const { family, planner } = await familyOf(asha);
      const added = await planner.addMember({ name: "Ravi", role: "parent" });
      const ravi = await signUp("Ravi");
      await store.joinFamily(ravi, family.inviteCode);
      const members = await planner.listMembers();
      expect(members).toHaveLength(2);
      expect(members.find((m) => m.id === added.id)?.userId).toBe(ravi.id);
    });

    it("stops accepting the old code after rotating it", async () => {
      const { family } = await familyOf(await signUp("Asha"));
      const rotated = await store.rotateInviteCode(family.id);
      expect(rotated?.inviteCode).not.toBe(family.inviteCode);
      expect(await store.findFamilyByInviteCode(family.inviteCode)).toBeNull();
      expect((await store.findFamilyByInviteCode(rotated!.inviteCode))?.id).toBe(family.id);
    });

    it("keeps each family's data separate", async () => {
      const a = await familyOf(await signUp("Asha"));
      const b = await familyOf(await signUp("Bea"));
      const e = await a.planner.addEvent({ title: "Swimming", start: "2026-11-17T18:15:00.000Z" });
      expect(await b.planner.listEvents()).toEqual([]);
      expect(await b.planner.updateEvent(e.id, { done: true })).toBeNull();
      expect(await b.planner.deleteEvent(e.id)).toBe(false);
      expect(await a.planner.listEvents()).toHaveLength(1);
    });

    it("changes the revision and notifies listeners on every write", async () => {
      const { family, planner } = await familyOf(await signUp("Asha"));
      const before = (await store.getFamily(family.id))!.revision;
      changes.length = 0;
      await planner.addEvent({ title: "Swimming", start: "2026-11-17T18:15:00.000Z" });
      const after = (await store.getFamily(family.id))!.revision;
      expect(after).not.toBe(before);
      expect(changes.map((f) => f.revision)).toEqual([after]);
    });

    it("still saves when the change listener fails", async () => {
      const failing = new PlannerStore(new JsonFileDriver(path.join(dir, "other.json")), () => {
        throw new Error("realtime down");
      });
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const user = await failing.createUser({ name: "A", email: "a@example.com", passwordHash: "x" });
      const family = await failing.createFamily(user, { name: "F" });
      await failing.family(family.id).addEvent({ title: "T", start: "2026-11-17T18:15:00.000Z" });
      expect(await failing.family(family.id).listEvents()).toHaveLength(1);
      spy.mockRestore();
    });
  });

  describe("events", () => {
    it("adds, updates and deletes events", async () => {
      const { planner } = await familyOf(await signUp("Asha"));
      const e = await planner.addEvent({ title: "Soccer", start: "2026-10-06T17:00:00.000Z" });
      expect(e).toMatchObject({ category: "other", recurrence: "none", done: false, allDay: false, memberIds: [] });

      const updated = await planner.updateEvent(e.id, { done: true, title: undefined });
      expect(updated).toMatchObject({ title: "Soccer", done: true });

      expect(await planner.deleteEvent(e.id)).toBe(true);
      expect(await planner.listEvents()).toEqual([]);
      expect(await planner.updateEvent(e.id, { done: false })).toBeNull();
    });

    it("filters one-off events by range but always keeps recurring ones", async () => {
      const { planner } = await familyOf(await signUp("Asha"));
      await planner.addEvent({ title: "Old", start: "2026-01-01T10:00:00.000Z" });
      await planner.addEvent({ title: "Weekly", start: "2026-01-01T10:00:00.000Z", recurrence: "weekly" });
      await planner.addEvent({ title: "Soon", start: "2026-10-06T10:00:00.000Z" });
      const titles = (await planner.listEvents({ from: "2026-10-01T00:00:00Z" })).map((e) => e.title);
      expect(titles.sort()).toEqual(["Soon", "Weekly"]);
    });

    it("rejects invalid events", async () => {
      const { planner } = await familyOf(await signUp("Asha"));
      await expect(planner.addEvent({ title: "", start: "tomorrow" })).rejects.toThrow();
    });

    it("handles concurrent writes without losing any", async () => {
      const { planner } = await familyOf(await signUp("Asha"));
      await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          planner.addEvent({ title: `E${i}`, start: "2026-11-17T18:15:00.000Z" }),
        ),
      );
      expect(await planner.listEvents()).toHaveLength(10);
    });
  });

  describe("notes", () => {
    it("records the author and lists newest first", async () => {
      const { planner } = await familyOf(await signUp("Asha"));
      const [me] = await planner.listMembers();
      await planner.addNote({ text: "Tue, Wed, Thu no fruit for lunch", author: me });
      const second = await planner.addNote({ text: "Swimming Tue 6:15", author: me, status: "processing" });
      const notes = await planner.listNotes();
      expect(notes.map((n) => n.text)).toEqual(["Swimming Tue 6:15", "Tue, Wed, Thu no fruit for lunch"]);
      expect(notes[0]).toMatchObject({ authorName: "Asha", authorMemberId: me.id, status: "processing" });

      const done = await planner.updateNote(second.id, { status: "applied", summary: "Added swimming." });
      expect(done).toMatchObject({ status: "applied", summary: "Added swimming." });
    });
  });
});

describe("invite codes", () => {
  it("normalises what people type", () => {
    expect(normalizeInviteCode(" k7qm-4xpr ")).toBe("K7QM4XPR");
    expect(formatInviteCode("K7QM4XPR")).toBe("K7QM-4XPR");
  });
});
