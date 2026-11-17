import { promises as fs } from "node:fs";
import path from "node:path";
import { DuplicateKeyError, type Collection, type StoreDriver, type StoredRecord } from "./driver";

type Row = StoredRecord & { seq: number };
type FileShape = { seq: number; records: Partial<Record<Collection, Record<string, Row>>> };

/**
 * Keeps everything in one JSON file. Good for local development and a single
 * self-hosted server; use the Supabase driver when the app is deployed so every
 * phone talks to the same data.
 */
export class JsonFileDriver implements StoreDriver {
  /** Serialises read-modify-write cycles within this process. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly file: string) {}

  private async read(): Promise<FileShape> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.file, "utf8")) as Partial<FileShape>;
      return { seq: parsed.seq ?? 0, records: parsed.records ?? {} };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return { seq: 0, records: {} };
      throw err;
    }
  }

  private async write(data: FileShape): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2));
    await fs.rename(tmp, this.file);
  }

  private mutate<T>(fn: (data: FileShape) => T): Promise<T> {
    const run = this.queue.then(async () => {
      const data = await this.read();
      const result = fn(data);
      await this.write(data);
      return result;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async rows(collection: Collection): Promise<Row[]> {
    await this.queue;
    return Object.values((await this.read()).records[collection] ?? {});
  }

  async get(collection: Collection, id: string) {
    return (await this.rows(collection)).find((r) => r.id === id)?.data ?? null;
  }

  async findByKey(collection: Collection, key: string) {
    return (await this.rows(collection)).find((r) => r.key === key)?.data ?? null;
  }

  async listByFamily(collection: Collection, familyId: string) {
    return (await this.rows(collection))
      .filter((r) => r.familyId === familyId)
      .sort((a, b) => a.seq - b.seq)
      .map((r) => r.data);
  }

  insert(collection: Collection, record: StoredRecord) {
    return this.mutate((data) => {
      const table = (data.records[collection] ??= {});
      if (record.key && Object.values(table).some((r) => r.key === record.key)) {
        throw new DuplicateKeyError(collection, record.key);
      }
      table[record.id] = { ...record, seq: ++data.seq };
    });
  }

  update(collection: Collection, record: StoredRecord) {
    return this.mutate((data) => {
      const table = data.records[collection] ?? {};
      const existing = table[record.id];
      if (!existing) return false;
      if (record.key && Object.values(table).some((r) => r.key === record.key && r.id !== record.id)) {
        throw new DuplicateKeyError(collection, record.key);
      }
      table[record.id] = { ...existing, ...record, seq: existing.seq };
      return true;
    });
  }

  remove(collection: Collection, id: string) {
    return this.mutate((data) => {
      const table = data.records[collection] ?? {};
      if (!table[id]) return false;
      delete table[id];
      return true;
    });
  }
}
