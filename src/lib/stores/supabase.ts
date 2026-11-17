import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DuplicateKeyError, type Collection, type StoreDriver, type StoredRecord } from "./driver";

/**
 * Stores records in a Supabase (Postgres) table called `records`; see
 * `supabase/schema.sql`. Only the server talks to it, with the service-role key,
 * and row-level security keeps the table closed to everyone else.
 */
export class SupabaseDriver implements StoreDriver {
  private readonly db: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  private table() {
    return this.db.from("records");
  }

  async get(collection: Collection, id: string) {
    const { data, error } = await this.table()
      .select("data")
      .eq("collection", collection)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data?.data ?? null;
  }

  async findByKey(collection: Collection, key: string) {
    const { data, error } = await this.table()
      .select("data")
      .eq("collection", collection)
      .eq("lookup_key", key)
      .maybeSingle();
    if (error) throw error;
    return data?.data ?? null;
  }

  async listByFamily(collection: Collection, familyId: string) {
    const { data, error } = await this.table()
      .select("data")
      .eq("collection", collection)
      .eq("family_id", familyId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((row) => row.data);
  }

  async insert(collection: Collection, record: StoredRecord) {
    const { error } = await this.table().insert({
      collection,
      id: record.id,
      family_id: record.familyId ?? null,
      lookup_key: record.key ?? null,
      data: record.data,
    });
    if (error?.code === "23505") throw new DuplicateKeyError(collection, record.key ?? record.id);
    if (error) throw error;
  }

  async update(collection: Collection, record: StoredRecord) {
    const { data, error } = await this.table()
      .update({ data: record.data, lookup_key: record.key ?? null, updated_at: new Date().toISOString() })
      .eq("collection", collection)
      .eq("id", record.id)
      .select("id");
    if (error?.code === "23505") throw new DuplicateKeyError(collection, record.key ?? record.id);
    if (error) throw error;
    return (data ?? []).length > 0;
  }

  async remove(collection: Collection, id: string) {
    const { data, error } = await this.table()
      .delete()
      .eq("collection", collection)
      .eq("id", id)
      .select("id");
    if (error) throw error;
    return (data ?? []).length > 0;
  }
}

/**
 * Tells every open device in a family that something changed, over Supabase
 * Realtime broadcast. The message carries no planner data, only the new
 * revision; devices then fetch the plan through the signed-in API.
 */
export async function broadcastChange(
  url: string,
  serviceRoleKey: string,
  channel: string,
  revision: string,
): Promise<void> {
  const res = await fetch(`${url.replace(/\/$/, "")}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      messages: [{ topic: channel, event: "changed", payload: { revision }, private: false }],
    }),
  });
  if (!res.ok) throw new Error(`Realtime broadcast failed: ${res.status}`);
}
