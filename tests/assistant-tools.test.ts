import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { plannerTools } from "@/lib/assistant";
import { PlannerStore, type FamilyStore } from "@/lib/store";
import { JsonFileDriver } from "@/lib/stores/json";

describe("plannerTools", () => {
  let dir: string;
  let planner: FamilyStore;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "homeplanner-tools-"));
    const store = new PlannerStore(new JsonFileDriver(path.join(dir, "p.json")));
    const user = await store.createUser({ name: "Asha", email: "a@example.com", passwordHash: "x" });
    planner = store.family((await store.createFamily(user, { name: "F" })).id);
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  const tool = (tools: ReturnType<typeof plannerTools>, name: string) => {
    const t = tools.find((x) => x.name === name);
    if (!t) throw new Error(`no tool ${name}`);
    return t as unknown as { run: (input: unknown) => Promise<string>; parse: (input: unknown) => unknown };
  };

  it("tags events created from a note and counts writes", async () => {
    let writes = 0;
    const tools = plannerTools(planner, { sourceNoteId: "note-1", onWrite: () => writes++ });
    const add = tool(tools, "add_event");
    await add.run(add.parse({ title: "Swimming", start: "2026-11-17T18:15:00+00:00", category: "activity" }));
    await tool(tools, "list_events").run({});
    const [event] = await planner.listEvents();
    expect(event).toMatchObject({ title: "Swimming", sourceNoteId: "note-1" });
    expect(writes).toBe(1);
  });

  it("only touches events in its own family", async () => {
    const tools = plannerTools(planner);
    expect(await tool(tools, "delete_event").run({ id: "someone-elses" })).toMatch(/No event/);
  });
});
