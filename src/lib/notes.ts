import { applyNote } from "./assistant";
import type { FamilyStore } from "./store";
import type { Family, Note } from "./types";

export function aiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Runs the assistant over a note and records the outcome on the note. */
export async function processNote(store: FamilyStore, family: Family, note: Note): Promise<void> {
  try {
    const result = await applyNote(store, family, note);
    await store.updateNote(note.id, result);
  } catch (err) {
    console.error("Processing note failed", err);
    await store.updateNote(note.id, {
      status: "error",
      summary: "The assistant couldn't update the plan from this note. Tap retry to try again.",
    });
  }
}
