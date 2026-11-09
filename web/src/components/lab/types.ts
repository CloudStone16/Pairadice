// Plain data shapes shared by the Vector Lab server code and its client components.

export interface OutboxRow {
  entity: "player" | "session";
  entityId: number;
  op: "upsert" | "delete";
  enqueuedAt: string;
  attempts: number;
  lastError: string | null;
}

export interface DocSummary {
  sourceText: string;
  sourceHash: string;
  model: string;
  dims: number;
  embeddedAt: string | null;
  updatedAt: string | null;
  status: string;
  /** First numbers of the embedding (the full vector has `dims`). */
  head: number[];
}

export interface KindredPlayer {
  id: number;
  username: string;
  score: number;
  sourceText: string;
}

export interface KindredSession {
  id: number;
  score: number;
  sourceText: string;
}

/** What MongoDB (and the outbox) look like for one player at one moment. */
export interface Snapshot {
  userId: number;
  takenAt: string;
  doc: DocSummary | null;
  outbox: OutboxRow | null;
  kindred: KindredPlayer[];
  mongoDown: boolean;
}

export type WatchKind = "update" | "ban" | "restore" | "create";

export type LabResult =
  | { ok: true; userId: number; before: Snapshot; outbox: OutboxRow | null; note: string }
  | { ok: false; message: string };
