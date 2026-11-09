# PairADice

PairADice is an open-source looking-for-group (LFG) board for video games. Players post a **quest** (a
session: game, mode, platform, roles needed, languages, rank range). Other players ask to join, and the host
accepts them into party seats. Matching mixes hard safety rules, a weighted SQL score, and MongoDB vector
similarity over what people write about how they like to play.

It is a PES University DBMS mini-project (Experiential Learning Level 3, Aug–Dec 2026). The database design is
the core of the project. The web app shows that design working end to end.

> **Viva walkthrough:** [`documents/DEMO.md`](documents/DEMO.md) is a 10-minute script in rubric order, with the
> exact commands and seed IDs.
>
> **Picking up the project:** [`documents/HANDOFF.md`](documents/HANDOFF.md) lists what is left (Discord
> login, polish, the worker MySQL login) with a full spec, the conventions and a first-hour checklist.

The mascot is a white maneki-neko cat with a die standing on its corner. It is the sprite `mascot-cat` in
`web/sprites/src/`, it is generated into the site favicon by `bun run sprites`, and the Discord application icon is
`brand/discord-icon.png`.

---

## Contents

1. [What it does](#what-it-does)
2. [Architecture](#architecture)
3. [Technology justification](#technology-justification)
4. [Database at a glance](#database-at-a-glance)
5. [Quick start](#quick-start)
6. [Repository layout](#repository-layout)
7. [Rubric map](#rubric-map)
8. [Status and known gaps](#status-and-known-gaps)

---

## What it does

| Area | What a player sees | What the database does |
|---|---|---|
| **Quest Board** (`/board`) | Open sessions on a cork board, filtered by game | `v_open_sessions`, plus block and host-status filters in the query |
| **Camp** (`/camp/[id]`, `/camp/new`) | Party seats, join requests, accept / decline / kick, status changes | `sp_create_session`, `sp_request_join`, `sp_accept_participant` (row lock, so seats cannot be overbooked), triggers keep player counts and status |
| **Hearth** (`/hearth`) | Recommended quests and "kindred spirits" | `sp_recommend_sessions` rule score, then reranked by MongoDB vector similarity (0.6 vector + 0.4 rule) |
| **Character sheet** (`/character/[id]`) | Games, ranks, languages, badges, trust meter, friend / block buttons | `v_player_card`; badges, ratings and trust are kept up to date by triggers |
| **Friends** (`/friends`) | Search players, requests, friends, blocked list | `sp_send_friend_request` … `sp_unblock_user`; `fn_is_blocked` hides blocked pairs everywhere |
| **Sign in / up** | Email + password on a "Press start" title screen | `sp_register_user`; argon2id hashes, HMAC-hashed session tokens |
| **Camp chat** (`/camp/[id]`) | A chat box with a composer, emote picker (`:gg:` tokens show as sprites) and new lines every 4 seconds; muted players see it disabled with the end time, suspended players read only | `sp_send_session_message`, `sp_chat_history`, `sp_delete_own_message`, `sp_my_chat_status`; 20 messages per 30 s, blocked players' lines hidden, deletes audited |
| **Direct messages** (`/messages`, `/messages/[userId]`) | A "Chat" tab in the navigation, inbox and one-to-one threads, a Message link on friend rows and the character sheet, recent DMs on the Hearth | `sp_send_dm`, `sp_dm_thread`, `sp_dm_inbox`, `sp_dm_can_message`; only friends or players who shared a camp, never across a block |
| **Rate your party** (completed camps) | Stars and an optional comment for each teammate; medals for badges on the character sheet | `sp_write_review`, `sp_pending_reviews`; once per pair per completed camp; triggers refresh ratings, trust and badges |
| **Report a player** (`/report/[userId]`) | A "Report" link on the character sheet, camp roster and friend list; "My reports" on `/character` shows status only | `sp_report_user` (rate limited, evidence must be visible to the reporter), `sp_my_reports` |
| **Guild Hall** (`/mod`, moderator and admin) | Overview, report queue (`/mod/reports`), report detail with dismiss / warn / mute / suspend / ban and hide message, sanctions with lift (`/mod/sanctions`), audit log viewer (`/mod/audit`) | `sp_claim_report`, `sp_resolve_report`, `sp_issue_sanction`, `sp_lift_sanction`, `sp_moderate_message`; every action writes `audit_log`; `ev_expire_sanctions` ends suspensions every 5 minutes |
| **Users and roles** (`/admin/users`, admin only) | Search players, grant or revoke roles, see sanction history | `sp_grant_role`, `sp_revoke_role` (refuse removing the last admin or your own admin role) |
| **Vector Lab** (`/admin/vector`, admin only) | Read, update and delete embeddings live, and watch the outbox drain | `embedding_outbox` + 30 sync triggers → worker → MongoDB |

**Privacy rules that hold everywhere:** gamertags, the Discord invite and the camp chat are shown only to the host
and accepted players. Blocks hide both users from each other. Suspended players can read but cannot write. Banned
players cannot sign in. Every sensitive change writes `audit_log` from a trigger, and secrets are never logged.

---

## Architecture

```mermaid
flowchart LR
  subgraph Browser
    UI["Next.js pages"]
  end

  subgraph Web["web/ — Next.js 16 server"]
    RSC["Server components<br/>reads"]
    SA["Server actions<br/>writes"]
    AUTH["Auth<br/>argon2id + HMAC tokens"]
  end

  subgraph MySQL["MySQL 8 — pairadice (source of truth)"]
    T[("45 tables<br/>4 views")]
    R["51 procedures · 9 functions<br/>55 triggers · 1 event"]
    OB[("embedding_outbox")]
  end

  subgraph Vec["vector/ — Node worker"]
    W["worker.js<br/>MiniLM-L6-v2 (384-d)"]
  end

  subgraph Mongo["MongoDB Atlas Local — pairadice_vec"]
    PE[("player_embeddings")]
    SE[("session_embeddings")]
  end

  UI --> RSC & SA & AUTH
  RSC -- "pd_web: pairadice_web_ro (anonymous)" --> T
  AUTH -- "pd_auth: pairadice_auth" --> T
  SA -- "pd_player / pd_mod / pd_admin" --> R
  R --> T
  R -- "AFTER triggers" --> OB
  OB -- "drain" --> W
  W -- "upsert / delete" --> PE & SE
  RSC -- "$vectorSearch (read-only)" --> PE & SE
```

Three ideas carry the design:

1. **MySQL decides, MongoDB suggests.** Every eligibility and safety rule (blocks, bans, free seats, language,
   platform, rank bounds) is enforced in SQL and never relaxed. Vectors only **rerank** the candidates SQL has
   already allowed.
2. **The database enforces roles, not just the app.** The web server uses a different MySQL login for each kind of
   request. An anonymous page read uses `pairadice_web_ro`, which cannot read `auth_account`, `audit_log`, `message`,
   `friendship` or `user_block`, and cannot execute `sp_recommend_sessions`. A signed-in request, read or write, runs
   on the viewer's own role login (`pairadice_player`, `pairadice_moderator` or `pairadice_admin`), and fails closed
   to the anonymous login if the request's session does not match. Sign-in uses `pairadice_auth`, the only role that
   can touch credentials. `pairadice_player` has no direct DML on any table: it
   writes everything (sessions, friendships, blocks, reports, profiles, chat, DMs and reviews) through DEFINER procedures, which reject NULL, suspended and banned actors. It cannot read `message` directly either; it reads chat only through `sp_chat_history`, `sp_dm_thread` and `sp_dm_inbox`, which return only its own conversations. `pairadice_moderator` can read
   reports, sanctions, the audit log and users, but writes only through procedures too (`12_moderation.sql`), which add
   conflict-of-interest and staff-rank rules and write the audit rows. It also holds a direct `SELECT` on `message` as evidence for reports. `pairadice_admin` holds
   only SELECT, INSERT, UPDATE, DELETE and EXECUTE, with no DDL and no GRANT OPTION. The in-app `role` / `permission` tables and `fn_has_permission` are a second
   check inside triggers.
3. **The outbox pattern keeps the two stores in sync.** Triggers record "player 12 changed" in `embedding_outbox` in
   the same transaction as the edit. The worker re-reads MySQL, re-embeds only when the text actually changed, and
   writes MongoDB. A failed embed never blocks or rolls back a user's edit.

---

## Technology justification

### MySQL 8 for the transactional core

- **The data is relational and the rules are relational.** Users, games, modes, ranks, roles, sessions, seats,
  friendships, reports and sanctions are tightly linked (45 tables joined by foreign keys). The important questions
  are joins: *which open sessions need a role I play, on a platform I own, in a language I speak, hosted by someone I
  have not blocked?*
- **Correctness under concurrency.** Two hosts must never fill the same last seat. `sp_accept_participant` runs in a
  transaction with `SELECT … FOR UPDATE` on the session row. That needs real ACID transactions and row locks.
- **Rules live next to the data.** CHECK constraints (8.0.16+) reject plaintext passwords, self-reviews and
  self-sanctions. Triggers keep derived values (player counts, ratings, trust score, badges) correct whatever writes
  them. Procedures give the app a small, safe write API.
- **Roles enforced by the database.** MySQL roles with column-level grants let us prove RBAC at the database
  layer, which is what the rubric asks for.
- **Recursive CTEs** (8.0+) handle the region tree (`geo_region` references itself) and friend-of-friend scoring.
- *Why not PostgreSQL?* It would serve equally well. MySQL 8 has everything this design needs (CHECK, roles,
  recursive CTEs, window functions, JSON, row locks), and the design uses nothing PostgreSQL-specific.

### MongoDB (Atlas Local) for vector similarity

- **SQL cannot score free text.** Tags only match exact words, while bios and quest descriptions carry most of the
  "vibe". A sentence embedding places *"chill late-night builder"* near *"cozy SMP build night"* even though they
  share no tag.
- **Embeddings are documents, not rows.** Each one is a 384-float array plus filter fields and provenance (model,
  source text hash, timestamps). That fits a schema-validated document collection better than a 384-column table.
- **`$vectorSearch` with pre-filters.** Atlas Local runs a real approximate-nearest-neighbour index (cosine, 384-d)
  with filters on status, game, platform and language. The search therefore only compares against eligible
  documents.
- **Easy to rebuild.** MongoDB holds no facts of its own. Its documents are linked to SQL rows by id, so a full
  backfill rebuilds them from MySQL at any time.
- **Authenticated, least privilege.** MongoDB requires a login. The web app connects as `pdApi` (role `pdVecReader`:
  find and index listing only), and the worker and backfill connect as `pdWorker` (role `pdVecWriter`). The root user
  `pdRoot` is used only by setup. A leaked web credential therefore cannot change or delete embeddings.
- **Local model, no API keys.** `Xenova/all-MiniLM-L6-v2` runs inside Node through `@huggingface/transformers` and
  works offline after the first download.

### Next.js 16 (App Router) with server components and server actions

- **Database access stays on the server.** Pages are React Server Components that query MySQL directly with
  parameterised SQL. No credentials, pools or SQL reach the browser, and there is no separate REST layer to keep in
  step with the schema.
- **Server actions are the write path.** Each form posts to a server action. The action checks the session, picks
  the MySQL login for the user's role and calls one stored procedure. The procedure's refusal message is what the
  user sees, so the database stays the single source of rules.
- **Plain HTML forms.** Most controls are ordinary forms bound to server actions. Client components are used only
  where interaction needs them, such as confirm steps and live status messages.
- **TypeScript (strict) + Tailwind CSS v4 + bun** keep the code type-checked and the styling consistent, with
  fast installs and builds.

### Smaller choices

| Choice | Why |
|---|---|
| argon2id (`@node-rs/argon2`) | OWASP's first-choice password hash; a CHECK constraint rejects any `password_hash` not in argon2id format |
| HMAC-SHA256 session tokens | The database stores only `BINARY(32)` hashes, so a leaked `auth_token` table cannot be replayed |
| Socket (`auth_socket`) or Keychain-stored password logins in development | No database passwords in files or shell history |
| UTC everywhere | Every connection runs `time_zone = '+00:00'`; pages render in the viewer's timezone |
| Hand-made SVG sprite pipeline | The cosy pixel-art look without image licences (`web/sprites/`) |

---

## Database at a glance

| Object | Count | Where |
|---|---|---|
| Tables | 45 | `database/01_schema.sql` |
| Views | 4 | `v_open_sessions`, `v_player_card`, `v_session_roster` (02), `v_outbox_dead` (07) |
| Functions | 9 | `fn_is_blocked`, `fn_are_friends`, `fn_user_active`, `fn_trust_score`, `fn_has_permission`, `fn_platform_compatible`, `fn_local_time`, `fn_staff_rank` (12), `fn_dm_refusal` (13) |
| Procedures | 51 | recommendations (02), outbox (07), auth (08), quest lifecycle (09), friends and blocks (10), profile editing (11), moderation and roles (12), chat, DMs and reviews (13) |
| Events | 1 | `ev_expire_sanctions` (12): every 5 minutes runs `sp_expire_sanctions` (needs `event_scheduler = ON`, the MySQL 8 default) |
| Triggers | 55 | 23 integrity / derived-value / audit (02), 30 vector sync (07), 2 recommendation outcome (09) |
| MySQL roles | 6 | `pairadice_web_ro`, `pairadice_auth`, `pairadice_player`, `pairadice_moderator`, `pairadice_admin`, `pairadice_vec_worker` |
| Database checks | 319 | `database/06_constraint_tests.sql`: must-fail statements, exact-error assertions, grant probes and behaviour checks |
| Chat read checks | 46 | `web/scripts/check-chat-reads.ts`: row filtering of the chat read procedures (run with `bun run check:chat`) |
| Sample queries | 18 | `database/05_sample_queries.sql`: joins, nested, correlated, recursive CTEs, windows, procedures |
| MongoDB collections | 2 | `player_embeddings`, `session_embeddings` (strict `$jsonSchema` validators, B-tree and vector indexes) |

The ER diagram (Chen notation, 9 pages) is [`documents/pairadice_erd.drawio`](documents/pairadice_erd.drawio). It is
generated by [`documents/tools/gen_erd.py`](documents/tools/gen_erd.py), and page 9 is built straight from
`01_schema.sql`.

### Load order

| File | Contents |
|---|---|
| `01_schema.sql` | DDL: tables, keys, CHECK constraints, indexes |
| `02_routines.sql` | Functions, core procedures, triggers, views |
| `03_seed.sql` | Sample data: 12 players (one moderator, one admin, one suspended), 3 games, 10 sessions, friendships, reviews, reports and sanctions |
| `04_rbac.sql` | MySQL roles and their grants |
| `05_sample_queries.sql` | Read-only demo queries (Q1–Q18) |
| `06_constraint_tests.sql` | Must-fail tests and a PASS/FAIL summary |
| `07_vector_outbox.sql` | Outbox triggers and procedures for the MongoDB sync |
| `08_auth.sql` | `sp_register_user` and the `pairadice_auth` grants |
| `09_sessions.sql` | Quest lifecycle procedures and recommendation-outcome triggers |
| `10_social.sql` | Friend and block procedures |
| `11_profiles.sql` | Profile-editing procedures (self-only writes) |
| `12_moderation.sql` | Report, sanction, message-moderation and role procedures, `fn_staff_rank`, and the `ev_expire_sanctions` event |
| `13_chat.sql` | Camp chat, DM and review procedures, `fn_dm_refusal` (loaded after 12, before the seed) |

`database/setup.sh` loads them in the order 01, 02, 08, 09, 10, 11, 12, 13, 03, 04, 07 (tests last). You do not need to load them by hand.

---

## Quick start

### Prerequisites

- **MySQL 8.0.19 or newer.** CHECK constraints need 8.0.16, and `INSERT … AS alias` in 07 needs 8.0.19.
- **Node.js 20.9+** and **[bun](https://bun.sh)** for the web app. Node alone is enough for the vector worker.
- **Docker** for MongoDB Atlas Local. This is only needed for the vector features; the rest of the app works without
  it.

### 1. Load the database

```bash
# Over TCP as an admin login (asks for the password on a hidden prompt, or reads $MYSQL_PWD):
./database/setup.sh -u root -y --tests

# Or over the Unix socket with passwordless per-role logins mapped to your OS user (recommended locally):
./database/setup.sh -u <admin_login> -S /var/run/mysqld/mysqld.sock -y --tests --socket-logins "$USER"
```

`--tests` runs 319 checks (must-fail statements, exact-error assertions, grant probes and behaviour checks) and
reports `319/319 passed`. Run `./database/setup.sh --help` for every
option. The script **drops and recreates** the `pairadice` database, and `-y` skips the confirmation.

`--socket-logins` creates `pd_web_sock`, `pd_auth_sock`, `pd_player_sock`, `pd_mod_sock` and `pd_admin_sock`, one
for each MySQL role. It needs the `auth_socket` plugin.

If your server does not have that plugin, create password logins instead. Each of `--web-user`, `--auth-user`,
`--app-user`, `--mod-user` and `--admin-user` creates a login with the matching role. The passwords come from
`PD_WEB_PWD`, `PD_AUTH_PWD`, `PD_APP_PWD`, `PD_MOD_PWD` and `PD_ADMIN_PWD` when set, otherwise from a hidden prompt:

```bash
./database/setup.sh -u <admin_login> -y --tests --web-user pd_web --auth-user pd_auth \
    --app-user pd_api --mod-user pd_mod --admin-user pd_admin
```

On macOS the development convention is to keep those passwords in the Keychain (account `pairadice`, service
`pairadice/<key>`, with keys `pd_web`, `pd_auth`, `pd_api`, `pd_mod`, `pd_admin` and `auth_secret`). For example, add
one with `security add-generic-password -a pairadice -s pairadice/pd_web -w` (it prompts for the value), and
export `PD_WEB_PWD="$(security find-generic-password -a pairadice -s pairadice/pd_web -w)"` before running
`setup.sh`. Never write the real values into a file. To give the vector worker its own MySQL login, add
`--worker-user NAME` (role `pairadice_vec_worker`, password from `PD_WORKER_PWD` or a prompt).

### 2. Start the vector store (optional)

MongoDB requires authentication. `vector/setup.sh` needs three passwords, read from the environment or a hidden
prompt: `MONGO_ROOT_PWD` (root user `pdRoot`, used only by setup), `MONGO_API_PWD` (user `pdApi`, read-only, for the web
app) and `MONGO_WORKER_PWD` (user `pdWorker`, read/write, for the worker, backfill and `demo-rud.js`).

```bash
./vector/setup.sh                       # Atlas Local container on 127.0.0.1:27018, users, collections, indexes, full backfill
./vector/setup.sh --recreate            # once, to switch an older unauthenticated container to auth (wipes Mongo data)
```

`--recreate` removes the container and its volumes. That is safe because MongoDB holds no facts of its own: the
backfill rebuilds everything from MySQL. Setup refuses to continue if it finds a container that still allows anonymous
access.

Run the worker with the `pdWorker` URI. The URI contains a password, so build it from environment variables and never
write it to a file.

```bash
# macOS: the passwords come from Keychain items pairadice/mongo_root, mongo_api and mongo_worker (account pairadice)
. vector/scripts/env-from-keychain.sh    # exports the three passwords and the worker MONGO_URI; prints nothing
node vector/scripts/worker.js --watch    # keeps MongoDB in sync with MySQL edits

# Linux: export the passwords yourself, then build the URI with the password URL-encoded by node
read -rs MONGO_WORKER_PWD; export MONGO_WORKER_PWD
enc="$(node -e 'process.stdout.write(encodeURIComponent(process.env.MONGO_WORKER_PWD))')"
export MONGO_URI="mongodb://pdWorker:${enc}@127.0.0.1:27018/?directConnection=true&authSource=pairadice_vec"
node vector/scripts/worker.js --watch
```

The web app uses the read-only `pdApi` URI in its own `MONGO_URI`. On macOS `bun run dev:kc` builds it from the
Keychain item `pairadice/mongo_api`. Without it the Vector Lab shows Mongo as unavailable.

Run `vector/setup.sh` again whenever you reload MySQL; the backfill reconciles both stores.

### 3. Run the web app

```bash
cd web
bun install
MYSQL_SOCKET=/var/run/mysqld/mysqld.sock \
PD_DB_USER_WEB=pd_web_sock PD_DB_USER_AUTH=pd_auth_sock PD_DB_USER_PLAYER=pd_player_sock \
PD_DB_USER_MODERATOR=pd_mod_sock PD_DB_USER_ADMIN=pd_admin_sock \
PAIRADICE_DEV_AUTH=1 bun run dev
```

With the Keychain items above, `bun run dev:kc` does the same thing: `web/scripts/dev-keychain.sh` loads the five
logins, `AUTH_SECRET`, the Discord items if present and the `pdApi` `MONGO_URI` into the environment and starts `bun run dev` (add `PAIRADICE_DEV_AUTH=1` for the "play as"
switch). `bun run check:db` uses the same loader and proves each login's identity plus one forbidden action each.

Then open <http://127.0.0.1:3000>. `PAIRADICE_DEV_AUTH=1` adds a development-only "play as" switch to the header,
so you can act as any seed player. Sign-in and sign-up are rate limited (per IP, per email and IP, per email, and a global cap), a new sign-in revokes
the old session token, and sign-up errors are fixed messages. The seed accounts have placeholder password hashes, so they cannot sign in with
a password. To try real sign-in, create an account at `/sign-up`.

Every environment variable is listed by name in [`web/.env.example`](web/.env.example). Real values belong in your
shell, never in a file. The vector store uses these:

| Variable | Used by | Meaning |
|---|---|---|
| `MONGO_ROOT_PWD` | `vector/setup.sh` | Root user `pdRoot` password (setup only) |
| `MONGO_API_PWD` | `vector/setup.sh`, `dev-keychain.sh` | Password of `pdApi` (read-only) |
| `MONGO_WORKER_PWD` | `vector/setup.sh`, `env-from-keychain.sh` | Password of `pdWorker` (read/write) |
| `MONGO_URI` | web app, worker, backfill, `demo-rud.js` | Per process: the `pdApi` URI for the web app, the `pdWorker` URI for the others. Form `mongodb://USER:PASSWORD@127.0.0.1:27018/?directConnection=true&authSource=pairadice_vec` |
| `MONGO_ROOT_URI` | `vector/scripts/init-db.js` | Root URI, set by `setup.sh` only |
| `PD_WORKER_PWD` | `database/setup.sh` | Password for the optional `--worker-user` MySQL login |

| Check | Command (in `web/`) |
|---|---|
| Types | `bun run typecheck` |
| Lint | `bun run lint` |
| Unit tests | `bun test` (134 tests) |
| Production build | `bun run build` |
| Database logins and grants | `bun run check:db` (needs the Keychain items) |
| Chat read procedures | `bun run check:chat` (46 checks; reads the password from the `MYSQL_PWD` environment variable, `MYSQL_USER` defaults to `root`) |

---

## Repository layout

```
database/     SQL files 01–13 and setup.sh (MySQL)
vector/       MongoDB vector store: setup.sh, worker, backfill, RUD demo (Node)
  src/          config, embedding, source text, sync, search, schema
  scripts/      init-db.js, backfill.js, worker.js, demo-rud.js
web/          Next.js app
  src/app/      routes: (auth) sign-in/up, (hearth) board, camp, messages, hearth, character, friends, party, mod (Guild Hall), report, admin (vector, users)
  src/lib/      db pools per role, auth, queries, mutations, vector client
  sprites/      pixel-art sources (JSON) → public/sprites/*.svg
documents/    ER diagram (drawio), its generator, rubric PDF, DEMO.md
```

---

## Rubric map

| Rubric item | Marks | Where to look |
|---|---:|---|
| ER diagram | 2 | `documents/pairadice_erd.drawio` (9 pages, Chen notation) |
| Relational schema with keys and constraints | 3 | `01_schema.sql`; drawio page 9 |
| SQL DDL with constraints | 4 | `01_schema.sql`: PK/FK/UNIQUE/CHECK; 319 checks in `06` |
| NoSQL / vector DB creation | 4 | `vector/src/schema.js` (validators, indexes, vector indexes, roles), `vector/scripts/init-db.js` |
| Technology justification | 1 | [Technology justification](#technology-justification) above |
| DML | 4 | `03_seed.sql`; every app write is a procedure in 08–13 |
| Nested / correlated / recursive queries and joins | 4 | `05_sample_queries.sql` Q1–Q13 |
| Procedures, functions, triggers, CTEs | 6 | `02`, `07`–`13`; recursive CTEs in Q8–Q10 |
| NoSQL / vector feature with read, update, delete | 7 | `/admin/vector` Vector Lab; `vector/scripts/demo-rud.js`; hybrid Hearth recommendations |
| Next.js UI | 3 | `web/` |
| Backend / API + DB integration | 2 | Server actions → per-role pools → procedures (`web/src/lib/db.ts`, `web/src/lib/mutations/`) |
| Authentication with 2+ roles and RBAC in the DB | 4 | `04_rbac.sql`, `08_auth.sql`, per-role logins, `requireRole` guards; the moderator role works end to end in `/mod`; the player has no direct DML |
| Documentation and Git/GitHub | 2 | This README, `documents/DEMO.md`, commit history |
| Originality, individual contribution, viva | 4 | `documents/DEMO.md` |

---

## Status and known gaps

Done: the schema, routines, RBAC and tests; the MongoDB vector store with outbox sync and hybrid ranking and
**MongoDB authentication** (least-privilege users `pdApi` and `pdWorker`, verified live: anonymous access fails, `pdApi`
cannot write, `pdWorker` can); email
sign-in with per-role database logins; hosting, joining and managing quests; friends and blocks; profile editing
(`/character/edit`, written through self-only procedures in `database/11_profiles.sql`); the admin Vector Lab; and
**moderation** (Phase 6): player reports, the `/mod` Guild Hall (queue, report detail, sanctions, audit log) and admin
user and role management at `/admin/users`, all written through `database/12_moderation.sql`. Reports, sanctions and
message hiding no longer have direct grants, and expired sanctions are now ended by the `ev_expire_sanctions` event
(the sanctions page also runs the expiry procedure on load, so a server with the scheduler off still converges).
**Camp chat, DMs and reviews** (Phase 5) are done too: composer, emotes, inbox and threads, "Rate your party" and badge
medals, all written through `database/13_chat.sql`. The player role now has no direct DML on any table.

Not done yet (each has a full spec in [`documents/HANDOFF.md`](documents/HANDOFF.md)):

- **Discord login.** The `auth_account` table supports it, but it stays switched off until a Discord app is set up.
- **Polish** (Phase 7): empty / loading / error states, an accessibility and mobile pass, and a final docs and demo sync.
- **Worker MySQL login.** `database/setup.sh --worker-user` can create a login for `pairadice_vec_worker`, but it is not
  created on the owner's machine yet, so the worker still uses `MYSQL_USER` / `MYSQL_PWD`. Check the role's grants against
  what the worker reads and updates before switching.

Known gaps and limits:

- Chat uses polling (every 4 seconds), not websockets, and unread counts are not built.
- An index on `message(sender_id, sent_at)` and one on `message(session_id, message_id)` would speed up the rate limit
  and chat history. They are not applied because existing tables are not to be altered; adding them needs the owner's
  OK.

## Licence

[MIT](LICENSE).
