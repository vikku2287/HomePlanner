import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PlannerStore } from "@/lib/store";

describe("PlannerStore", () => {
  let dir: string;
  let store: PlannerStore;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "homeplanner-"));
    store = new PlannerStore(path.join(dir, "planner.json"));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("starts empty when the file does not exist", async () => {
    expect(await store.snapshot()).toEqual({ members: [], events: [] });
  });

  it("adds members with defaults", async () => {
    const m = await store.addMember({ name: "Maya", role: "child" });
    expect(m).toMatchObject({ name: "Maya", role: "child" });
    expect(await store.listMembers()).toHaveLength(1);
  });

  it("adds, updates and deletes events", async () => {
    const e = await store.addEvent({ title: "Soccer", start: "2026-10-06T17:00:00.000Z" });
    expect(e).toMatchObject({ category: "other", recurrence: "none", done: false, memberIds: [] });

    const updated = await store.updateEvent(e.id, { done: true, title: undefined });
    expect(updated).toMatchObject({ title: "Soccer", done: true });

    expect(await store.deleteEvent(e.id)).toBe(true);
    expect(await store.listEvents()).toEqual([]);
    expect(await store.updateEvent(e.id, { done: false })).toBeNull();
  });

  it("filters one-off events by range but always keeps recurring ones", async () => {
    await store.addEvent({ title: "Old", start: "2026-01-01T10:00:00.000Z" });
    await store.addEvent({ title: "Weekly", start: "2026-01-01T10:00:00.000Z", recurrence: "weekly" });
    await store.addEvent({ title: "Soon", start: "2026-10-06T10:00:00.000Z" });
    const titles = (await store.listEvents({ from: "2026-10-01T00:00:00Z" })).map((e) => e.title);
    expect(titles.sort()).toEqual(["Soon", "Weekly"]);
  });

  it("rejects invalid events", async () => {
    await expect(store.addEvent({ title: "", start: "tomorrow" })).rejects.toThrow();
  });
});
