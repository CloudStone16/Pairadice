import "server-only";
import { randomBytes } from "node:crypto";
import type { Document } from "mongodb";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { poolFor, queryAs, transactionAs } from "@/lib/db";
import type { Viewer } from "@/lib/auth/viewer";
import { hashPassword } from "@/lib/auth/password";
import { runAsViewer, type ActionResult } from "@/lib/mutations/run";
import { nearest, playerVector, similarPlayers } from "@/lib/vector/search";
import { withMongo } from "@/lib/vector/mongo";
import type {
  DocSummary,
  KindredPlayer,
  KindredSession,
  LabResult,
  OutboxRow,
  Snapshot,
} from "@/components/lab/types";

// Server-only data for the Vector Lab (/admin/vector). Every MySQL statement runs through the "admin"
// pool, so the database's own grants (pairadice_admin) decide what is allowed. MongoDB is only READ here:
// the web app never writes to it. The worker (vector/scripts/worker.js) drains embedding_outbox into it.

const DEAD_AFTER = 5; // the worker gives up on a row after this many failed attempts
export const BIO_MAX = 600; // the worker embeds only the first 600 characters of a bio
const HEAD = 8; // how many embedding numbers the inspector shows

const num = (v: unknown): number => Number(v);
const iso = (v: unknown): string | null => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));

// ------------------------------------------------------------------ pipeline status
export interface PipelineStatus {
  mysql: { nonBanned: number; active: number; suspended: number; open: number; full: number; inProgress: number };
  mongo: { players: number | null; sessions: number | null; model: string | null; dims: number | null };
  backlog: { pending: number; oldestAgeSeconds: number | null };
  dead: OutboxRow[];
}

async function mongoCount(kind: "players" | "sessions"): Promise<number | null> {
  try {
    return await withMongo(kind, (c) => c.countDocuments());
  } catch {
    return null;
  }
}

async function mongoModel(): Promise<{ name: string; dims: number } | null> {
  try {
    const doc = await withMongo("players", (c) => c.findOne({}, { projection: { model: 1 } }));
    const m = doc?.model as { name?: string; dims?: number } | undefined;
    return m?.name ? { name: m.name, dims: Number(m.dims) } : null;
  } catch {
    return null;
  }
}

function outboxFrom(r: Record<string, unknown>): OutboxRow {
  return {
    entity: r.entity as OutboxRow["entity"],
    entityId: num(r.entity_id),
    op: r.op as OutboxRow["op"],
    enqueuedAt: String(r.enqueued_at),
    attempts: num(r.attempts),
    lastError: r.last_error == null ? null : String(r.last_error),
  };
}

export async function getPipelineStatus(): Promise<PipelineStatus> {
  const [users, sessions, backlog, dead, players, sessionDocs, model] = await Promise.all([
    queryAs<{ status: string; n: number | string }>("admin", "SELECT status, COUNT(*) AS n FROM users GROUP BY status"),
    queryAs<{ status: string; n: number | string }>(
      "admin",
      "SELECT status, COUNT(*) AS n FROM lfg_session WHERE status IN ('open','full','in_progress') GROUP BY status",
    ),
    queryAs<{ n: number | string; age: number | string | null }>(
      "admin",
      `SELECT COUNT(*) AS n, TIMESTAMPDIFF(MICROSECOND, MIN(enqueued_at), UTC_TIMESTAMP(6)) / 1000000 AS age
         FROM embedding_outbox WHERE attempts < ?`,
      [DEAD_AFTER],
    ),
    queryAs<Record<string, unknown>>(
      "admin",
      "SELECT entity, entity_id, op, enqueued_at, attempts, last_error FROM v_outbox_dead ORDER BY enqueued_at LIMIT 20",
    ),
    mongoCount("players"),
    mongoCount("sessions"),
    mongoModel(),
  ]);
  const u = (s: string) => num(users.find((r) => r.status === s)?.n ?? 0);
  const s = (st: string) => num(sessions.find((r) => r.status === st)?.n ?? 0);
  const b = backlog[0];
  return {
    mysql: {
      nonBanned: u("active") + u("suspended"),
      active: u("active"),
      suspended: u("suspended"),
      open: s("open"),
      full: s("full"),
      inProgress: s("in_progress"),
    },
    mongo: { players, sessions: sessionDocs, model: model?.name ?? null, dims: model?.dims ?? null },
    backlog: { pending: num(b?.n ?? 0), oldestAgeSeconds: b?.age == null ? null : Number(b.age) },
    dead: dead.map(outboxFrom),
  };
}

/** Put every dead-letter row back in the queue (attempts = 0) so the worker tries it again. */
export async function retryDeadRows(viewer: Viewer): Promise<ActionResult<number>> {
  return runAsViewer(viewer, async (login) => {
    const [res] = await poolFor(login).query<ResultSetHeader>(
      "UPDATE embedding_outbox SET attempts = 0, last_error = NULL WHERE attempts >= ?",
      [DEAD_AFTER],
    );
    return res.affectedRows;
  });
}

// ------------------------------------------------------------------ player list and source
export interface LabPlayer {
  userId: number;
  username: string;
  displayName: string;
  status: "active" | "suspended" | "banned";
  isAdmin: boolean;
}

export async function listPlayers(): Promise<LabPlayer[]> {
  const rows = await queryAs<Record<string, unknown>>(
    "admin",
    `SELECT u.user_id, u.username, u.display_name, u.status,
            EXISTS (SELECT 1 FROM user_role ur JOIN role r ON r.role_id = ur.role_id
                     WHERE ur.user_id = u.user_id AND r.role_name = 'admin') AS is_admin
       FROM users u ORDER BY u.user_id`,
  );
  return rows.map((r) => ({
    userId: num(r.user_id),
    username: String(r.username),
    displayName: String(r.display_name),
    status: r.status as LabPlayer["status"],
    isAdmin: num(r.is_admin) === 1,
  }));
}

export interface TagOption {
  tagId: number;
  name: string;
}

export async function listTags(): Promise<TagOption[]> {
  const rows = await queryAs<{ tag_id: number; name: string }>("admin", "SELECT tag_id, name FROM tag ORDER BY name");
  return rows.map((r) => ({ tagId: num(r.tag_id), name: r.name }));
}

export interface PlayerSource {
  userId: number;
  username: string;
  status: "active" | "suspended" | "banned";
  bio: string;
  tags: TagOption[];
  /** One line per game: name, preferred modes, preferred roles (what the worker folds into the text). */
  games: Array<{ game: string; modes: string[]; roles: string[] }>;
}

/** The MySQL rows the worker reads (vector/src/sourceText.js loadPlayers), shown as they are. */
export async function getPlayerSource(userId: number): Promise<PlayerSource | null> {
  const users = await queryAs<{ user_id: number; username: string; status: PlayerSource["status"]; bio: string | null }>(
    "admin",
    "SELECT user_id, username, status, bio FROM users WHERE user_id = ?",
    [userId],
  );
  const u = users[0];
  if (!u) return null;
  const [tags, games, modes, roles] = await Promise.all([
    queryAs<{ tag_id: number; name: string }>(
      "admin",
      "SELECT t.tag_id, t.name FROM user_tag ut JOIN tag t ON t.tag_id = ut.tag_id WHERE ut.user_id = ? ORDER BY t.name",
      [userId],
    ),
    queryAs<{ profile_id: number; game: string }>(
      "admin",
      `SELECT p.profile_id, g.name AS game FROM player_game_profile p JOIN game g ON g.game_id = p.game_id
        WHERE p.user_id = ? ORDER BY p.is_main DESC, g.name, p.profile_id`,
      [userId],
    ),
    queryAs<{ profile_id: number; name: string }>(
      "admin",
      `SELECT pm.profile_id, gm.name FROM profile_mode pm JOIN game_mode gm ON gm.mode_id = pm.mode_id
         JOIN player_game_profile p ON p.profile_id = pm.profile_id
        WHERE p.user_id = ? AND pm.is_preferred ORDER BY gm.name`,
      [userId],
    ),
    queryAs<{ profile_id: number; name: string }>(
      "admin",
      `SELECT pr.profile_id, gr.name FROM profile_role pr JOIN game_role gr ON gr.game_role_id = pr.game_role_id
         JOIN player_game_profile p ON p.profile_id = pr.profile_id
        WHERE p.user_id = ? ORDER BY pr.preference_order, gr.name`,
      [userId],
    ),
  ]);
  const byGame = new Map<string, { modes: Set<string>; roles: Set<string> }>();
  for (const g of games) {
    const e = byGame.get(g.game) ?? { modes: new Set<string>(), roles: new Set<string>() };
    modes.filter((m) => m.profile_id === g.profile_id).forEach((m) => e.modes.add(m.name));
    roles.filter((r) => r.profile_id === g.profile_id).forEach((r) => e.roles.add(r.name));
    byGame.set(g.game, e);
  }
  return {
    userId: num(u.user_id),
    username: u.username,
    status: u.status,
    bio: u.bio ?? "",
    tags: tags.map((t) => ({ tagId: num(t.tag_id), name: t.name })),
    games: [...byGame].map(([game, e]) => ({ game, modes: [...e.modes], roles: [...e.roles] })),
  };
}

// ------------------------------------------------------------------ MongoDB reads
export async function getPlayerDoc(userId: number): Promise<DocSummary | null> {
  const doc = (await withMongo("players", (c) =>
    c.findOne({ _id: userId as never }, { projection: { embedding: { $slice: HEAD }, source_text: 1, source_hash: 1, model: 1, embedded_at: 1, updated_at: 1, status: 1 } }),
  )) as Document | null;
  if (!doc) return null;
  const model = (doc.model ?? {}) as { name?: string; dims?: number };
  return {
    sourceText: String(doc.source_text ?? ""),
    sourceHash: String(doc.source_hash ?? ""),
    model: String(model.name ?? ""),
    dims: Number(model.dims ?? 0),
    embeddedAt: iso(doc.embedded_at),
    updatedAt: iso(doc.updated_at),
    status: String(doc.status ?? ""),
    head: Array.isArray(doc.embedding) ? (doc.embedding as number[]).slice(0, HEAD) : [],
  };
}

export async function getPlayerOutbox(userId: number): Promise<OutboxRow | null> {
  const rows = await queryAs<Record<string, unknown>>(
    "admin",
    "SELECT entity, entity_id, op, enqueued_at, attempts, last_error FROM embedding_outbox WHERE entity = 'player' AND entity_id = ?",
    [userId],
  );
  return rows[0] ? outboxFrom(rows[0]) : null;
}

async function kindredPlayers(userId: number, k: number): Promise<KindredPlayer[]> {
  const hits = await similarPlayers(userId, { k });
  return hits.map((h) => ({
    id: num(h._id),
    username: String(h.username ?? ""),
    score: h.score,
    sourceText: String(h.source_text ?? ""),
  }));
}

/** Top open public sessions for the player's own vector (ports vector/src/search.js similarSessions). */
export async function similarSessions(userId: number, k = 3): Promise<KindredSession[]> {
  const vector = await playerVector(userId);
  if (!vector) return [];
  const hits = await nearest("sessions", vector, { filter: { status: "open", visibility: "public" }, k });
  return hits.map((h) => ({ id: num(h._id), score: h.score, sourceText: String(h.source_text ?? "") }));
}

export interface Kindred {
  players: KindredPlayer[];
  sessions: KindredSession[];
}

export async function getKindred(userId: number): Promise<Kindred | null> {
  try {
    const [players, sessions] = await Promise.all([kindredPlayers(userId, 5), similarSessions(userId, 3)]);
    return { players, sessions };
  } catch {
    return null;
  }
}

/** The MongoDB document, the outbox row and the neighbour list for one player, right now. */
export async function takeSnapshot(userId: number): Promise<Snapshot> {
  const outbox = await getPlayerOutbox(userId);
  try {
    const doc = await getPlayerDoc(userId);
    const kindred = doc ? await kindredPlayers(userId, 5) : [];
    return { userId, takenAt: new Date().toISOString(), doc, outbox, kindred, mongoDown: false };
  } catch {
    return { userId, takenAt: new Date().toISOString(), doc: null, outbox, kindred: [], mongoDown: true };
  }
}

// ------------------------------------------------------------------ admin mutations (all via the admin pool)
const fail = (message: string): LabResult => ({ ok: false, message });

function unwrap(r: ActionResult<LabResult>): LabResult {
  return r.ok ? r.value : fail(r.message);
}

/** UPDATE: save bio and tags. The users / user_tag triggers enqueue the re-embed. */
export async function savePlayerProfile(
  viewer: Viewer,
  userId: number,
  bio: string,
  tagIds: number[],
): Promise<LabResult> {
  const trimmed = bio.trim();
  if (trimmed.length > BIO_MAX) return fail(`Keep the bio to ${BIO_MAX} characters (the worker embeds only that much).`);
  const target = await getPlayerSource(userId);
  if (!target) return fail("That player does not exist.");
  if (target.status === "banned") return fail("Restore this player first: banned players have no document.");
  const before = await takeSnapshot(userId);
  const res = unwrap(
    await runAsViewer(viewer, (login) =>
      transactionAs(login, async (conn): Promise<LabResult> => {
        await conn.query("UPDATE users SET bio = ? WHERE user_id = ?", [trimmed === "" ? null : trimmed, userId]);
        const have = new Set(target.tags.map((t) => t.tagId));
        const want = new Set(tagIds);
        const drop = [...have].filter((t) => !want.has(t));
        const add = [...want].filter((t) => !have.has(t));
        if (drop.length) await conn.query("DELETE FROM user_tag WHERE user_id = ? AND tag_id IN (?)", [userId, drop]);
        for (const t of add) await conn.query("INSERT INTO user_tag (user_id, tag_id) VALUES (?, ?)", [userId, t]);
        return { ok: true, userId, before, outbox: null, note: "Saved in MySQL. The triggers queued a re-embed." };
      }),
    ),
  );
  return res.ok ? { ...res, outbox: await getPlayerOutbox(userId) } : res;
}

/** Refuses admins and yourself: the Vector Lab must never lock out staff. */
async function guardTarget(viewer: Viewer, userId: number): Promise<PlayerSource | LabResult> {
  if (userId === viewer.userId) return fail("You cannot ban yourself.");
  const players = await listPlayers();
  const p = players.find((x) => x.userId === userId);
  if (!p) return fail("That player does not exist.");
  if (p.isAdmin) return fail("Admins cannot be banned from here.");
  const src = await getPlayerSource(userId);
  return src ?? fail("That player does not exist.");
}

async function setStatus(viewer: Viewer, userId: number, status: "banned" | "active"): Promise<LabResult> {
  const target = await guardTarget(viewer, userId);
  if ("ok" in target) return target;
  if (status === "banned" && target.status === "banned") return fail("Already banned.");
  if (status === "active" && target.status !== "banned") return fail("Only banned players can be restored.");
  const before = await takeSnapshot(userId);
  const res = unwrap(
    await runAsViewer(viewer, async (login): Promise<LabResult> => {
      const conn = await poolFor(login).getConnection();
      try {
        // the audit trigger reads @audit_actor from this same connection
        await conn.query("SET @audit_actor = ?", [viewer.userId]);
        try {
          await conn.query("UPDATE users SET status = ? WHERE user_id = ?", [status, userId]);
        } finally {
          await conn.query("SET @audit_actor = NULL");
        }
      } finally {
        conn.release();
      }
      return {
        ok: true,
        userId,
        before,
        outbox: null,
        note:
          status === "banned"
            ? "users.status = 'banned'. The trigger queued a delete."
            : "users.status = 'active'. The trigger queued a re-embed.",
      };
    }),
  );
  return res.ok ? { ...res, outbox: await getPlayerOutbox(userId) } : res;
}

/** DELETE: ban. */
export const banPlayer = (viewer: Viewer, userId: number) => setStatus(viewer, userId, "banned");
/** Restore (doubles as CREATE: the document comes back). */
export const restorePlayer = (viewer: Viewer, userId: number) => setStatus(viewer, userId, "active");

const DEMO_BIOS = [
  "Cosy co-op player who loves slow builds, shared bases and a good playlist.",
  "Competitive tactical shooter fan, always up for ranked grinds and clutch rounds.",
  "Casual explorer: farming sims, puzzle co-op and relaxed late-night sessions.",
  "Speedrun enthusiast and tutorial writer who enjoys helping new players learn.",
];

const randomSlug = () => {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(4);
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
};

/** CREATE: register a throwaway player through sp_register_user, give it a bio and two tags. */
export async function createDemoPlayer(viewer: Viewer): Promise<LabResult> {
  // a real argon2id hash of 32 random bytes; the password is never kept or shown
  const passwordHash = await hashPassword(randomBytes(32).toString("hex"));
  const tags = await listTags();
  const picked = [...tags].sort(() => randomBytes(1)[0]! - 128).slice(0, 2);
  const bio = DEMO_BIOS[randomBytes(1)[0]! % DEMO_BIOS.length]!;
  const res = unwrap(
    await runAsViewer(viewer, async (login): Promise<LabResult> => {
      const conn = await poolFor(login).getConnection();
      try {
        for (let attempt = 0; ; attempt++) {
          const slug = randomSlug();
          try {
            await conn.query("CALL sp_register_user(?,?,?,?,?,@pd_lab_uid)", [
              `lab_${slug}`,
              `Lab ${slug}`,
              "UTC",
              `lab_${slug}@example.test`,
              passwordHash,
            ]);
          } catch (err) {
            const msg = (err as { sqlMessage?: string }).sqlMessage ?? "";
            if (attempt < 4 && /taken|already has an account/.test(msg)) continue;
            throw err;
          }
          break;
        }
        const [rows] = await conn.query<Array<{ uid: number | string | null } & RowDataPacket>>(
          "SELECT @pd_lab_uid AS uid",
        );
        const uid = Number(rows[0]?.uid);
        if (!Number.isSafeInteger(uid) || uid < 1) throw new Error("sp_register_user returned no user id");
        await conn.query("UPDATE users SET bio = ? WHERE user_id = ?", [bio, uid]);
        for (const t of picked) await conn.query("INSERT INTO user_tag (user_id, tag_id) VALUES (?, ?)", [uid, t.tagId]);
        return {
          ok: true,
          userId: uid,
          before: { userId: uid, takenAt: new Date().toISOString(), doc: null, outbox: null, kindred: [], mongoDown: false },
          outbox: null,
          note: "Registered through sp_register_user. The triggers queued an embed.",
        };
      } finally {
        conn.release();
      }
    }),
  );
  return res.ok ? { ...res, outbox: await getPlayerOutbox(res.userId) } : res;
}
