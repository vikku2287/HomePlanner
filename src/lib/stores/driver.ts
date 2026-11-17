/**
 * The storage layer under `PlannerStore`. A driver stores JSON records in named
 * collections; all validation and family scoping happens in `PlannerStore`, so a
 * new backend only has to implement these few methods.
 */
export type Collection = "users" | "families" | "members" | "events" | "notes";

export interface StoredRecord {
  id: string;
  /** The family a record belongs to; absent for users and families themselves. */
  familyId?: string;
  /** Optional unique lookup key within the collection (e.g. an email or invite code). */
  key?: string;
  data: unknown;
}

export class DuplicateKeyError extends Error {
  constructor(collection: Collection, key: string) {
    super(`A ${collection} record with key "${key}" already exists`);
    this.name = "DuplicateKeyError";
  }
}

export interface StoreDriver {
  get(collection: Collection, id: string): Promise<unknown | null>;
  findByKey(collection: Collection, key: string): Promise<unknown | null>;
  /** Records of one family, oldest first. */
  listByFamily(collection: Collection, familyId: string): Promise<unknown[]>;
  /** Throws `DuplicateKeyError` if `key` is taken. */
  insert(collection: Collection, record: StoredRecord): Promise<void>;
  /** Replaces the record's data (and key). Returns false if it does not exist. */
  update(collection: Collection, record: StoredRecord): Promise<boolean>;
  remove(collection: Collection, id: string): Promise<boolean>;
}
