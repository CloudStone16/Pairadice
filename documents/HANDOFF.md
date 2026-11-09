# PairADice: maintainer's guide and handoff for Arjun

Last updated: 2026-11-10. All phases (0 to 7) are complete and merged: the schema, vector store, auth, quests, social,
profiles, moderation, chat, DMs and reviews, MongoDB authentication, Discord sign-in and the final polish. What remains is
a short list of optional extras (section 3). The Phase 7 summary is in section 12.
This file is now the maintainer's guide: where things are, how to run them, the conventions and the traps. It is tracked
in git on purpose: `docs/` is gitignored, so anything written there is invisible to you.

You wrote the root README and `documents/DEMO.md` and pushed about 48 commits, so this skips the basics.

Rules for this file: it never contains a password, key or token, only the names of environment variables and
Keychain items. Keep it that way if you edit it.

## Contents

1. [State of the project](#1-state-of-the-project)
2. [Rubric map](#2-rubric-map)
3. [What to do next if you continue](#3-what-to-do-next-if-you-continue)
4. [Environment and running](#4-environment-and-running)
5. [Seed users and test accounts](#5-seed-users-and-test-accounts)
6. [File map](#6-file-map)
7. [Conventions and gotchas](#7-conventions-and-gotchas)
8. [Phase 6: Moderation (done)](#8-phase-6-moderation-done)
9. [Phase 5: Camp chat, DMs and reviews (done)](#9-phase-5-camp-chat-dms-and-reviews-done)
10. [MongoDB authentication (done)](#10-mongodb-authentication-done)
11. [Discord OAuth sign-in (done)](#11-discord-oauth-sign-in-done)
12. [Phase 7: Polish (summary)](#12-phase-7-polish-summary)
13. [Sprites needed per phase](#13-sprites-needed-per-phase)
14. [Definition of done](#14-definition-of-done)
15. [First hour checklist](#15-first-hour-checklist)
16. [Known stale docs and unverified items](#16-known-stale-docs-and-unverified-items)

---

## 1. State of the project

PairADice is an LFG (looking-for-group) board for video games, a PES University DBMS mini-project (Experiential
Learning Level 3, Aug to Dec 2026, 50 marks). The database design is what is graded; the web app shows it working.
Repo: `CloudStone16/Pairadice`, branch `main`.

Everything is built and merged to `main`: Phases 0 to 7, profile editing, MongoDB authentication and Discord sign-in. From `git log`, in the order the early work landed:

| Area | Commits (newest last in each row) |
|---|---|
| Schema, routines, seed, ER diagram | `a59f776` schema, `c2a708d`/`d1ea8b8` ER diagram |
| Vector store | `5efead2` store, `cb3e8e4` outbox gaps, `40c46b4` score normalising, `1186064` UTF-8/UTC |
| Phase 1 web skeleton | `b5b94e3` |
| Phase 2 auth and per-role pools | `8439b6b` `pairadice_auth` + `sp_register_user`, `c813df7` pools, `0ada679` argon2id/tokens/rate limits, `5bc7c8e` and `601d7a1` sign-in/up and the Press Start screen, `8a9cd9b` viewer |
| Phase 4 quests | `a8aee23` procedures, `7121203` host form, `a92aafe` actions, `e20ed55` camp controls, `a50423d`/`4bd4d7b` hybrid and kindred spirits |
| Vector Lab | `f779f34`, `c2f7d70`, `f69f237` |
| Friends and blocks | `edeb1d2` procedures, `ec78788`/`5a6001a`/`7cb7026` web |
| Hardening | `a094618` closed procedure auth holes, `9399e2b` reads on the viewer's own login, `a0d1273` accessibility |
| Profile editing | `fdc9b97` procedures, `894396a` actions and loader, `f493469` editor UI |
| Docs | `741007f` README, `c581614` DEMO, `e6ba1ac` sync, `83f46be` handoff |
| Phase 6 moderation | `38bcbc7` procedures, `36aaf2b` icons, `439bdcb` web, `cba9043` docs: `12_moderation.sql`, RBAC and routine changes, `/mod`, `/admin/users`, `/report` |
| Phase 5 chat | `13_chat.sql`, RBAC changes, `check-chat-reads.ts`, chat, DM and review screens, 13 sprites |
| Later | MongoDB authentication (`15c1d16`), `14_discord.sql` and Discord sign-in (`7c8982f`, `6415bb0`), then Phase 7 polish on `phase-7-polish` |

Counts, taken from the SQL files on 2026-11-10 (the 336 check total is from a `--tests` run):

| Object | Count |
|---|---|
| Tables | 45 (`01_schema.sql`) |
| Views | 4 (`v_open_sessions`, `v_player_card`, `v_session_roster`, `v_outbox_dead`) |
| Functions | 9: `fn_has_permission`, `fn_is_blocked`, `fn_user_active`, `fn_are_friends`, `fn_platform_compatible`, `fn_local_time`, `fn_trust_score`, `fn_staff_rank`, `fn_dm_refusal` |
| Procedures | 52: 6 in 02, 2 in 07, 1 in 08, 7 in 09, 7 in 10, 9 in 11, 9 in 12, 10 in 13, 1 in 14 (the 3 `t_*` test helpers in 06 are not counted) |
| Events | 1: `ev_expire_sanctions` (12), every 5 minutes |
| Triggers | 55: 23 in 02, 30 in 07 (vector sync), 2 in 09 |
| DB checks | 336 in `06_constraint_tests.sql` (263 `CALL t_expect_error`, `t_expect_msg` and `t_probe` rows plus 73 behaviour rows) |
| Chat read checks | 46 in `web/scripts/check-chat-reads.ts` (`bun run check:chat`; needs `MYSQL_PWD` in the environment) |
| Web unit tests | 149 across 16 files, all passing (`bun test`) |
| Sprites | 136 JSON sources in `web/sprites/src/` (Phase 5 added `icon-send`, `icon-emoji`, 8 emotes and 3 badge medals; Phase 7 added the cat poses `mascot-cat-wave`, `mascot-cat-sleep`, `mascot-cat-sad`) |

What works today: schema, routines and RBAC; MongoDB vector store with outbox sync and hybrid ranking; email sign-in
with a different MySQL login per role; hosting, joining and managing quests; friends and blocks; profile editing at
`/character/edit`; the admin Vector Lab at `/admin/vector`; moderation: player reports at `/report/[userId]`, the Guild Hall
at `/mod` (overview, `/mod/reports`, `/mod/reports/[id]`, `/mod/sanctions`, `/mod/audit`) and admin users and roles at
`/admin/users` and `/admin/users/[id]`; camp chat with a composer and emotes (polled every 4 seconds), DM inbox and threads at `/messages`, "Rate your party" on completed camps, and badge medals on the character sheet; optional Discord sign-in (section 11). The player role has no direct DML on any table.

MongoDB now requires authentication (section 10): `pdApi` for the web app, `pdWorker` for the worker, backfill and `demo-rud.js`.

What does not exist: unread counts, websockets, a dedicated MySQL login for the worker (section 10), the two `message` indexes (section 9), linking Discord to an existing email account, and sound and motion toggles.

The site mascot is `mascot-cat`, a white maneki-neko cat with a die standing on its corner (32 px sprite). The favicon is
generated from it by `bun run sprites`. The Discord application icon is `brand/discord-icon.png`.

## 2. Rubric map

Source of truth is `documents/DBMS Level 3.pdf`. This reuses the README's map and adds where each item stands.

| Rubric item | Marks | Status | Where | What would move it |
|---|---:|---|---|---|
| ER diagram | 2 | Done | `documents/pairadice_erd.drawio` (9 pages, generated by `documents/tools/gen_erd.py`) | Only if you add tables: add them to the generator and rerun (section 7) |
| Relational schema, keys, constraints | 3 | Done | `01_schema.sql`; drawio page 9 | Any new table needs adding to the generator |
| SQL DDL with constraints | 4 | Done | `01_schema.sql`; 336 checks in `06` | Keep the check count in README and DEMO in sync |
| NoSQL / vector DB creation | 4 | Done | `vector/src/schema.js`, `vector/scripts/init-db.js` | Mongo users `pdApi` and `pdWorker` are bound to the roles (section 10) |
| Technology justification | 1 | Done | README, "Technology justification" (MySQL, MongoDB with auth, Next.js, plus a table incl. OAuth) | None |
| DML | 4 | Done | `03_seed.sql`; every app write is a procedure in 08 to 13; the player has no direct DML | None |
| Nested / correlated / recursive, joins | 4 | Done | `05_sample_queries.sql` Q1 to Q18 | None |
| Procedures, functions, triggers, CTEs | 6 | Done | `02`, `07` to `14` | None |
| NoSQL / vector feature with RUD | 7 | Done | `/admin/vector`, `vector/scripts/demo-rud.js`, hybrid Hearth | Vector Lab verified working through Mongo auth (section 10) |
| Next.js UI | 3 | Done | `web/`; chat, DMs, reviews and polish are covered | None |
| Backend / API + DB integration | 2 | Done | server actions, per-role pools, `web/src/lib/mutations/` | None |
| Authentication, 2+ roles, RBAC in the DB | 4 | Done | `04_rbac.sql`, `08_auth.sql`, `12_moderation.sql`, `13_chat.sql`, `requireRole`, per-role logins | Phase 6 made the moderator role visible in the app (`/mod`); a moderator gets 404 on `/admin/users` |
| Documentation and Git/GitHub | 2 | Done | README, `web/README.md`, DEMO, this file, history | Keep counts in sync |
| Originality, individual contribution, viva | 4 | Depends on you | `documents/DEMO.md` | Rehearse; keep the app explainable |

## 3. What to do next if you continue

Nothing here is needed for the project to be complete. In rough order of value:

1. **Worker MySQL login.** Create it with `database/setup.sh --worker-user NAME`, check the grants of
   `pairadice_vec_worker` against what the worker reads and updates (section 10), run the worker with it, then drop the
   gap from the README.
2. **Message indexes.** `message(sender_id, sent_at)` and `message(session_id, message_id)` speed up the chat rate limit
   and history. They alter an existing table, so they need the owner's OK first.
3. **Unread counts.** Needs a new read-tracking table (for example `message_read`), added in a new numbered file and to
   the ER generator.
4. **Websockets** instead of the 4-second polling of `/api/chat/[sessionId]` and `/api/dm/[userId]`.
5. **Link Discord to an existing email account** from a settings screen (a `sp_link_discord` procedure). Never link
   automatically by email or username: that is an account takeover path.
6. **Sound and motion toggles** (sprites `icon-sound-on`, `icon-sound-off`, `icon-motion-on`, `icon-motion-off`).
7. Admin game-catalogue management.

Never skip, whatever you build: tests for it, the README and DEMO sync, and a full rehearsal of the DEMO.

## 4. Environment and running

### Machine

- MySQL 9.7 at `127.0.0.1:3306`, database `pairadice`. The README asks for 8.0.19 or newer.
- Node 20.9 or newer (the owner's Mac has Node 26), bun 1.4.0, Docker for MongoDB.
- Next.js 16.4.3, React 19.3, TypeScript strict, Tailwind v4. Use bun in `web/`, never npm. `vector/` is a plain
  Node project with `package-lock.json`; leave it on npm.
- If pages show a MySQL connection error on a Mac, the server may have stopped: `mysql.server start`.

### Load the database

`database/setup.sh` drops and recreates `pairadice`, so a reload wipes all data. The seed's session dates shift by
whole weeks to the day you load, so "upcoming" sessions stay upcoming. Run `./database/setup.sh --help` for every
option. Flags that matter:

| Flag | Effect |
|---|---|
| `-u USER`, `-h`, `-P`, `-S PATH` | admin login, host, port, or a Unix socket (socket means no password) |
| `-y` | skip the drop confirmation |
| `--tests` | run `06_constraint_tests.sql` and print `N/N passed` (every row must PASS) |
| `--no-seed`, `--no-rbac`, `--no-vector` | skip parts |
| `--web-user`, `--auth-user`, `--app-user`, `--mod-user`, `--admin-user NAME` | create one password login per role |
| `--socket-logins OSUSER` | create passwordless `auth_socket` logins `pd_web_sock`, `pd_auth_sock`, `pd_player_sock`, `pd_mod_sock`, `pd_admin_sock` |

Passwords for the five login flags come from `PD_WEB_PWD`, `PD_AUTH_PWD`, `PD_APP_PWD`, `PD_MOD_PWD` and
`PD_ADMIN_PWD` when set, otherwise from a hidden prompt. Re-running resets those passwords, and re-running
`04_rbac.sql` detaches existing logins, so pass every login you want to keep on every run.

Actual load order inside `setup.sh`: 01, 02, 08, 09, 10, 11, 12, 13, 14, then 03 (seed), 04 (RBAC), 07 (vector triggers), then
06 (tests) at the end. 04 must come after every procedure it grants on.

Passwordless path (recommended on Linux, needs the `auth_socket` plugin):

```bash
SOCK=/var/run/mysqld/mysqld.sock
./database/setup.sh -u your_admin_login -S "$SOCK" -y --tests --socket-logins "$USER"
```

Password path (works anywhere). The password variables can stay unset to get hidden prompts:

```bash
./database/setup.sh -u root -y --tests --web-user pd_web --auth-user pd_auth \
    --app-user pd_api --mod-user pd_mod --admin-user pd_admin
```

### The five logins

| MySQL login | MySQL role | Used for | Web env prefix |
|---|---|---|---|
| `pd_web` | `pairadice_web_ro` | anonymous page reads; no `message`, `friendship`, `user_block`, `auth_*`, `report`, `sanction`, `audit_log`; no EXECUTE on any routine | `WEB` |
| `pd_auth` | `pairadice_auth` | sign-up, sign-in, sessions; the only login that touches `auth_account` and `auth_token` | `AUTH` |
| `pd_api` | `pairadice_player` | signed-in players: reads plus DEFINER procedures | `PLAYER` |
| `pd_mod` | `pairadice_moderator` | the player role plus SELECT on `report`, `sanction`, `audit_log` and `users`, and EXECUTE on `sp_expire_sanctions`, `sp_claim_report`, `sp_resolve_report`, `sp_issue_sanction`, `sp_lift_sanction`, `sp_moderate_message` and `fn_staff_rank`; no direct writes | `MODERATOR` |
| `pd_admin` | `pairadice_admin` | SELECT, INSERT, UPDATE, DELETE and EXECUTE on `pairadice.*`; no DDL, no GRANT OPTION | `ADMIN` |

A sixth role, `pairadice_vec_worker`, exists but has no login yet; the vector worker still connects as whatever
`MYSQL_USER` is (default `root`). Giving it a login is a small open item (section 10).

### Web environment

Names only. `web/.env.example` is the full list. Never write values into a file that git tracks.

| Variable | Meaning |
|---|---|
| `PD_DB_USER_WEB`, `PD_DB_USER_AUTH`, `PD_DB_USER_PLAYER`, `PD_DB_USER_MODERATOR`, `PD_DB_USER_ADMIN` | login names |
| `PD_DB_PWD_WEB` and the other four | passwords (TCP only) |
| `MYSQL_SOCKET` | optional; when set, passwords are ignored and the socket is used |
| `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE` | defaults 127.0.0.1, 3306, `pairadice` |
| `AUTH_SECRET` | HMAC key for session tokens, at least 32 bytes; required in production |
| `PAIRADICE_DEV_AUTH` | `1` enables the dev "play as" switch (and only when `NODE_ENV=development`) |
| `PAIRADICE_DEV_DB_FALLBACK` | `1` lets the web login fall back to `MYSQL_USER` / `MYSQL_PWD` in development |
| `PAIRADICE_DISCORD_LOGIN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | Discord sign-in (section 11): off unless the flag is `1` and both credentials are set; export the flag in the shell, `dev:kc` loads only the two credentials |
| `PAIRADICE_PUBLIC_URL` | production only: the public `https:` origin used to build the Discord redirect URI; login stays off without it |
| `MONGO_URI` | per process, built from the environment and never written to a file: the `pdApi` URI for the web app, the `pdWorker` URI for the worker, backfill and `demo-rud.js`. Form `mongodb://USER:PASSWORD@127.0.0.1:27018/?directConnection=true&authSource=pairadice_vec` (password URL-encoded) |
| `MONGO_DB` | database name, default `pairadice_vec` |
| `MONGO_ROOT_PWD`, `MONGO_API_PWD`, `MONGO_WORKER_PWD` | passwords of `pdRoot` (setup only), `pdApi` and `pdWorker`; read by `vector/setup.sh` (or a hidden prompt) |
| `MONGO_ROOT_URI` | root URI for `vector/scripts/init-db.js`, set by `setup.sh` |
| `PD_WORKER_PWD` | password for the optional `database/setup.sh --worker-user` MySQL login |

Start the app:

- Owner's Mac: `bun run dev:kc` runs `web/scripts/dev-keychain.sh`, which loads the five logins and `AUTH_SECRET` from
  the Keychain (account `pairadice`, services `pairadice/pd_web`, `pd_auth`, `pd_api`, `pd_mod`, `pd_admin`,
  `auth_secret`) and starts `bun run dev`. It warns about any item it cannot find. It also builds the web `MONGO_URI`
  (user `pdApi`) from the item `pairadice/mongo_api`, and loads `discord_client_id` and `discord_client_secret` quietly
  when they exist.
- Linux, or anywhere without that Keychain: put the same variables in `web/.env.local` (gitignored by `.env*.local`)
  or export them in the shell. With socket logins:

```bash
cd web
bun install
MYSQL_SOCKET=/var/run/mysqld/mysqld.sock \
PD_DB_USER_WEB=pd_web_sock PD_DB_USER_AUTH=pd_auth_sock PD_DB_USER_PLAYER=pd_player_sock \
PD_DB_USER_MODERATOR=pd_mod_sock PD_DB_USER_ADMIN=pd_admin_sock \
PAIRADICE_DEV_AUTH=1 bun run dev
```

Open <http://127.0.0.1:3000>. The server binds to 127.0.0.1, so use that host and not `localhost` (cookies are host
specific, and the Discord redirect URI in section 11 uses the same host).

`bun run check:db` (also Keychain-based) connects as each login and proves its identity plus one forbidden and one
allowed action. Run it after any change to `04_rbac.sql`, and add a probe there for each new grant you want proven.

### Dev "play as"

`PAIRADICE_DEV_AUTH=1` with `NODE_ENV=development` makes the `pd_dev_user` cookie choose the acting user, and shows
the "Dev: play as" menu in the header. A real session cookie always wins, and while a real session exists the menu
is hidden. To switch from a signed-up account back to a seed player, sign out first.

### Vector store

```bash
./vector/setup.sh              # container pairadice-mongo on 127.0.0.1:27018, users, collections, indexes, full backfill
./vector/setup.sh --recreate   # once, for a container made before auth: WIPES Mongo data, backfill rebuilds it from MySQL
# macOS: exports the three passwords from Keychain and the pdWorker MONGO_URI; prints nothing
. vector/scripts/env-from-keychain.sh
node vector/scripts/worker.js --watch   # drains embedding_outbox into MongoDB
```

Linux: export `MONGO_ROOT_PWD`, `MONGO_API_PWD` and `MONGO_WORKER_PWD` yourself (a hidden `read -rs`), then build
`MONGO_URI` with the password URL-encoded by node from the environment (the pattern is in the header of
`vector/scripts/env-from-keychain.sh`).

The worker must keep running for edits to reach MongoDB. The first run downloads a model of about 90 MB. When Mongo
is unreachable the app falls back to SQL-only ranking, and the Vector Lab says so. Re-run `vector/setup.sh` after
every MySQL reload.

### Verification commands

Run from `web/`:

```bash
bun run typecheck      # tsc --noEmit
bun run lint           # eslint
bun test               # 149 pass, 0 fail in 16 files today
MYSQL_PWD=... bun run check:chat   # 46 chat read checks; export MYSQL_PWD from the Keychain or a hidden prompt first
bun run build          # runs bun run sprites first
```

There is no `test` script in `package.json`, so `bun run test` does not exist; use `bun test`. Add a script if you
want the longer form. For the database: `./database/setup.sh ... --tests`. If `typecheck` reports errors in files you
did not touch, delete `web/.next` and rerun; stale generated types cause phantom errors.

## 5. Seed users and test accounts

From `database/03_seed.sql`. IDs are fixed.

| ID | Username | Notes |
|---:|---|---|
| 1 | `aarav_plays` | default dev user; Valorant duelist; blocked toxic_tyler |
| 2 | `priya_gg` | hosts session 10 |
| 3 | `mei_tanaka` | Bedwars builder |
| 4 | `lukas_mc` | not Aarav's friend; DM with Mei in the seed |
| 5 | `sofia_bw` | email account with `email_verified` false |
| 6 | `tom_builds` | |
| 7 | `jake_fn` | target of the DEMO sanction and report (lifted again) |
| 8 | `rohan_duelist` | hosts session 8 |
| 9 | `mod_alex` | **moderator** (role granted by user 10) |
| 10 | `admin_sam` | **admin** (bootstrap row, `assigned_by` NULL) |
| 11 | `toxic_tyler` | **suspended** by a 7 day sanction; target of reports 1 and 2; blocked by users 1 and 2 |
| 12 | `kiara_ctrl` | the recursive-CTE example; accepted into session 1 |

Every user also has the `player` role. Seed data for testing moderation: reports 1 and 2 (harassment against Tyler,
both now `actioned`), a `warn` and a `suspend` sanction on Tyler, message 4 (the abusive chat line) and an audit log
filled by triggers. Seed messages: 1 to 5 are session chat, 6 to 8 are DMs (1<->8, 4->3), 9 is session 7 chat.
The seed has no `open` report, so file one as a player at `/report/7` (or any user id) to test the queue.

Test accounts. The seed password hashes are placeholders (`SEED-PLACEHOLDER-NOT-A-REAL-HASH`), so **no seed user
can sign in with a password**. They are reachable only through the dev "play as" switch. Several seed users also have
`discord` rows in `auth_account` with fake snowflake ids; a real Discord login will never match them. To test real
sign-in, create an account at `/sign-up`, which runs `sp_register_user` and gives the `player` role. To test the
moderator or admin role through a real session you would need to grant it from SQL as the admin loader; the dev
switch is simpler. The admin role-management screen (`/admin/users/[id]`) can now do it.

## 6. File map

```
database/
  01_schema.sql           45 tables
  02_routines.sql         functions, core procedures, 23 triggers, 3 views
  03_seed.sql             12 users, 3 games, 10 sessions, reports, sanctions
  04_rbac.sql             six MySQL roles and every grant
  05_sample_queries.sql   Q1..Q18
  06_constraint_tests.sql 336 checks; helpers t_expect_error, t_expect_msg, t_probe
  07_vector_outbox.sql    30 sync triggers, outbox procedures, v_outbox_dead
  08_auth.sql             sp_register_user
  09_sessions.sql         quest lifecycle procedures, 2 recommendation-outcome triggers
  10_social.sql           friend and block procedures
  11_profiles.sql         9 profile-editing procedures
  12_moderation.sql       fn_staff_rank, 9 moderation and role procedures, ev_expire_sanctions
  13_chat.sql             fn_dm_refusal, 10 chat, DM and review procedures
  14_discord.sql          sp_discord_login (EXECUTE to pairadice_auth only)
  setup.sh                loader (read --help)
  README.md               agent guide, GITIGNORED (local only)
vector/
  setup.sh                container, collections, indexes, backfill
  src/                    config, db, embedding, source text, sync, search, schema
  scripts/                init-db.js, backfill.js, worker.js, demo-rud.js
web/
  scripts/                build-sprites.ts, check-db-roles.ts, check-chat-reads.ts, dev-keychain.sh
  sprites/src/*.json      pixel sources; public/sprites/*.svg are generated
  src/proxy.ts            replaces middleware
  src/app/(auth)/         sign-in, sign-up, actions.ts, auth/discord/route.ts and auth/discord/callback/route.ts
  src/app/(hearth)/       hearth, board, camp/[id], camp/new, party, friends, character,
                          character/edit, mod/** (Guild Hall), admin/vector, admin/users/**,
                          report/[userId], messages, messages/[userId], styleguide
                          (chat/ holds only the chat server actions)
  src/app/api/admin/vector/snapshot/route.ts
  src/app/api/chat/[sessionId]  camp chat polling route (GET ?after=ID)
  src/app/api/dm/[userId]       DM thread polling route
  src/components/         ui, hearth, auth, camp, character, quest, social, lab, mod, admin, report, chat, review
  src/lib/
    db.ts, db-roles.ts            per-role pools: queryAs, execAs, callProcAs, transactionAs
    auth/                         guards, viewer, session, token, password, rate-limit, safe-next, signup-errors,
                                  discord-core.ts (pure: PKCE, state, URLs, cookie), discord.ts (token exchange, identity),
                                  client-ip.ts, timezone.ts
    read-login.ts                 readCtx: picks the login for a read, fails closed to "web"
    mutations/                    run.ts (runAsViewer), sessions, participants, social, profile, moderation, report, admin, chat, review
    moderation/, report/, chat/, review/   plain validation modules with tests
    queries*.ts                   typed reads (queries-mod.ts, queries-admin.ts for Phase 6; queries-chat.ts for Phase 5); sql-parts.ts shared fragments
    recommend.ts, vector/         hybrid ranking and the read-only Mongo client
    sprite-names.ts               the sprite contract list
documents/
  DEMO.md, HANDOFF.md, pairadice_erd.drawio, tools/gen_erd.py, DBMS Level 3.pdf
brand/                    Discord icon (see section 1)
docs/                     GITIGNORED local context; do not rely on it
```

Gitignored and therefore not on GitHub: `docs/`, `database/README.md`, `web/AGENTS.md`, `.claude/`, `docs.zip`.
`web/README.md` is tracked and current.

## 7. Conventions and gotchas

These are the rules the existing code follows. Break one and the tests or the review will catch it.

**Next.js 16 is not the Next.js you remember.** `params`, `searchParams`, `cookies()` and `headers()` are async.
`src/proxy.ts` replaces middleware. `forbidden()` is not enabled, so `requireRole` calls `notFound()`: a player who
opens `/mod` sees a 404, which hides that the page exists. Read the guide in `web/node_modules/next/dist/docs/`
before using an API you have not used here.

**Server actions.** Forms use `useActionState` with a server action. `redirect()` throws internally, so it must stay
outside any `try/catch`. Guard inside every action too, not only in the page (see `admin/vector/actions.ts`, which
calls `requireRole("admin", PATH)` in each action).

**Only plain objects cross from server components or server actions to client components.** An action that returned
`Object.create(null)` crashed every failed save once. Return object literals, strings, numbers, arrays.

**Every app write is a DEFINER procedure.** The player login has no direct DML on sessions, participants,
friendships, blocks, the profile tables, messages or reviews. A web mutation is one `CALL` through `runAsViewer` (`mutations/run.ts`),
which picks the login of the viewer's highest role and turns SQLSTATE 45000 messages into user-visible text. No direct
grants are left: Phase 5 replaced the player's `INSERT` on `message` and `review` and its `SELECT` on `message`.

**Procedure pattern.** Copy `database/09_sessions.sql` or `10_social.sql`:

1. `DEFINER` procedure, actor id as the first parameter.
2. `IF NOT fn_user_active(p_actor_id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Your account cannot do that right now.'`.
   This also rejects NULL, unknown, suspended and banned actors.
3. Every refusal is `SIGNAL SQLSTATE '45000'` with a message a user can read. The web layer shows it as is.
4. Its own `START TRANSACTION` ... `COMMIT`, and `DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END`.
5. If it sets `@audit_actor` (so `trg_users_au` records who acted), clear it in the handler and at the end. A test
   checks that failed procedures leave `@audit_actor` NULL.
6. Add the `GRANT EXECUTE` to `04_rbac.sql`, load the file from `setup.sh` (and add it to the file list near line 133),
   and write tests in `06`.

**Procedures COMMIT their own transactions**, so a test after one cannot roll back with an earlier
`START TRANSACTION`. Any data-changing test after a PROC test needs its own `START TRANSACTION` plus explicit
restore logic. Look at how the profile tests save and restore user 1 (temporary tables `s_users`, `s_ul`, ...).

**Grant probes.** `player_game_profile` has a column-level SELECT that excludes `in_game_name` for `web_ro` and the
player. A probe for a column grant must check `information_schema.COLUMN_PRIVILEGES`, not `TABLE_PRIVILEGES`. Use
`t_probe(name, condition)` with an `information_schema` query as in the existing admin probe.

**Triggers.** They raise business errors with SQLSTATE 45000 and a readable message. A trigger cannot modify the
table its own statement uses (error 1442), and foreign-key cascades fire no triggers. After inserting an
`lfg_session`, insert the host's participant row yourself. Keep the
`/*+ SET_VAR(optimizer_switch='semijoin=off') */` hints on the recommendation queries: MySQL 9.7 drops rows without
them.

**New tables instead of altering existing ones.** The owner settled the schema up front. If a feature needs storage,
add a table in a new numbered file. Editing a routine or a grant is fine and is expected. After adding a table, add it
to `documents/tools/gen_erd.py` and rerun it (`python3 documents/tools/gen_erd.py`, expect `problems=0`); never
hand-edit the drawio XML.

**Reads.** Anonymous pages read as `pd_web`. A signed-in read uses the viewer's own login through
`readCtx(viewer)` in `read-login.ts`, which fails closed to the anonymous login if the viewer does not match the
request's session. `web_ro` deliberately has no SELECT on `message`, `friendship` or `user_block`; anything that
needs them must skip the query for anonymous visitors (see `getSessionChat`).

**Stale sessions.** After a DB reload, an old `pd_session` cookie matches no session. The app falls back (dev user
if enabled) and reports `sessionExpired`, which `SignInGate` shows as "your session ended".

**Secrets.** Never commit credentials; pass them through the environment only. Never print them. Passwords reach
scripts through `PD_*_PWD`-style variables or a hidden `read -rs` prompt, never as command arguments. In anything you
paste into a shell, do not use angle-bracket placeholders: zsh reads `<` as a redirect. Use a variable or a quoted
literal.

**Design language.** "Cozy dusk", SNES-RPG. Fredoka for display and Nunito for body. No pixel fonts. Tokens are in
`src/app/globals.css`: `night`, `dusk`, `plum`, `lavender`, `parchment` (ink text), `wood`, `brass`, `ember`, and the
four SFC button colours. Lilac `#a094d6` passes contrast only on night, dusk and plum, never on parchment. Body text
at least 15 px, WCAG 2.2 AA, a visible 3 px focus ring, motion that respects `prefers-reduced-motion`, and status
never shown by colour alone. Sprites are drawn at integer scales only.

**Tests.** Pure logic gets a `*.test.ts` next to the module (`bun test`). Examples: `components/quest/validate.test.ts`,
`lib/profile/validate.test.ts`, `lib/auth/auth.test.ts`. Keep validation in plain modules without `server-only` so
it is unit-testable.

## 8. Phase 6: Moderation (done)

Built on branch `phase-6-moderation`. Moderation, reporting and role management work in the browser, and every write is
a procedure. The old direct grants are gone: player `INSERT` on `report`, and moderator `INSERT` on `sanction`,
`UPDATE` on `report` and `UPDATE (is_deleted)` on `message`. Probes in `06` prove each revoke.

**Database** (`database/12_moderation.sql`, loaded after 11 and before the seed; grants in `04_rbac.sql`):

| Routine | Who | What |
|---|---|---|
| `fn_staff_rank(user)` | any | 0 player, 1 moderator, 2 admin |
| `sp_report_user`, `sp_my_reports` | player and up | file a report (rate limited, evidence must be visible to the reporter); list your own reports (no handler, no sanction) |
| `sp_claim_report`, `sp_resolve_report` | moderator, admin | `open` to `reviewing`, then `dismissed` or `actioned` with a note merged into the audit row |
| `sp_issue_sanction`, `sp_lift_sanction` | moderator, admin | warn / mute / suspend / ban; ban and lifting a ban need `user.ban` (admin) |
| `sp_moderate_message` | moderator, admin | hide or restore a message, with an audit row |
| `sp_grant_role`, `sp_revoke_role` | admin only | the moderator login has no EXECUTE on them |
| `ev_expire_sanctions` | system | every 5 minutes runs `sp_expire_sanctions`, which now rewrites only trust scores that change |

**Web.** Routes `/mod`, `/mod/reports`, `/mod/reports/[id]`, `/mod/sanctions`, `/mod/audit` (moderator and admin),
`/admin/users` and `/admin/users/[id]` (admin), `/report/[userId]` (any signed-in player). "Report" links sit on the
character sheet, camp roster and friend list, and `/character` shows "My reports". Code: `src/app/(hearth)/mod/**`,
`admin/users/**`, `report/**`, `lib/queries-mod.ts`, `lib/queries-admin.ts`, `lib/mutations/{moderation,report,admin}.ts`,
`lib/moderation/*`, `lib/report/*`, `components/{mod,admin,report}/*`. The `safeNext` helper now also rejects dot
segments such as `/.//evil.com`, which protects the sign-in `next` and the report `back` redirects.

**Design decisions to keep.**

- No new tables. Lifting a sanction sets `ends_at = GREATEST(UTC_TIMESTAMP(), starts_at + 1 second)` and writes an audit
  row `sanction` / `lift` holding who and why. The mute check, trust score and expiry already honour `ends_at`.
- A warning never counts as active. It is "on record", has no end date, and affects neither status nor trust.
- Expiry has two paths: the event every 5 minutes (needs `event_scheduler = ON`, the MySQL 8 default) and a call to
  `sp_expire_sanctions` when the sanctions page loads, so a server with the scheduler off still converges.
- Conflict of interest: nobody handles a report they filed or are the subject of, or sanctions or lifts their own
  sanction. A moderator cannot sanction or lift sanctions on staff, an admin cannot sanction another admin, and only an
  admin takes over a report that another moderator holds. Sanctions last at most 90 days.
- The procedures COMMIT, so a caller cannot wrap them in a transaction and roll back (this is why the DEMO step changed).
- Audit rows never contain message bodies or password hashes. The ER diagram is unchanged.

## 9. Phase 5: Camp chat, DMs and reviews (done)

Built on branch `phase-5-chat`. No new tables.

**Database** (`database/13_chat.sql`, loaded after 12 and before the seed; grants in `04_rbac.sql`):

| Object | What it does |
|---|---|
| `fn_dm_refusal(actor, other)` | the reason a DM is refused, or NULL: friends, or both accepted (or later left) in the same camp; never across a block |
| `sp_send_session_message`, `sp_send_dm` | active actor, 1 to 1000 characters after trimming, 20 messages per 30 seconds per player (named lock via `GET_LOCK`, shared by chat and DMs); the `message` trigger still checks membership, mute and blocks |
| `sp_delete_own_message` | soft delete; refused while the line is reported or after a moderator acted; audited |
| `sp_write_review` | once per pair in a completed camp, both players accepted, 1 to 5 stars, comment up to 500 characters; the review triggers refresh ratings, trust and badges |
| `sp_chat_history`, `sp_dm_thread`, `sp_dm_inbox` | the actor's own conversations only; blocked players' lines are hidden; a deleted line returns no body |
| `sp_dm_can_message`, `sp_my_chat_status`, `sp_pending_reviews` | composer state (can message plus the reason), mute end time and suspension, teammates not yet reviewed |

Reads allow active and suspended players (suspended is read-only). RBAC: the player lost `SELECT` and `INSERT` on
`message` and `INSERT` on `review`, so it has no direct DML on any table. The moderator got an explicit `SELECT` on
`message` as report evidence. `06_constraint_tests.sql` grew to 319 checks (writes, rules, grant probes). MySQL cannot
capture `CALL` result sets in SQL, so `web/scripts/check-chat-reads.ts` (`bun run check:chat`, 46 checks, password from
the `MYSQL_PWD` environment variable) proves the row filtering of the read procedures.

**Web.**
- Camp chat: `components/chat/ChatRoom.tsx` and `Composer.tsx` on `/camp/[id]`. The server action is in
  `app/(hearth)/chat/actions.ts`; mutations in `lib/mutations/chat.ts`; reads in `lib/queries-chat.ts`.
- Polling design: no websockets. A client component polls `GET /api/chat/[sessionId]?after=ID` (DMs:
  `/api/dm/[userId]`) every 4 seconds. The route runs `requireViewer`, calls the history procedure, sends
  `Cache-Control: no-store` and returns JSON. Lines are rendered as text only; the stored text keeps the token.
- Emotes: tokens such as `:gg:` (8 emotes) become sprites at render time (`lib/chat/emotes.ts`), with a picker.
- DMs: `/messages` inbox and `/messages/[userId]` thread, Message links on friend rows and the character sheet, a
  "Chat" tab in the navigation, and Hearth `RecentDms` linking to threads.
- States: muted players see the composer disabled with the end time; suspended players are read-only; a blocked or
  stranger DM with no history returns 404 (no name or presence leaks); an existing thread that can no longer be
  messaged is shown read-only with the refusal reason and no composer or presence.
- Reviews: `components/review/RatePartyPanel.tsx` ("Rate your party") on completed camps; badge medals via
  `components/character/BadgeShelf.tsx`.

**Design decisions.** Procedures take the actor, never a sender id, so a forged sender is impossible. The rate limit
uses a named lock rather than a new table. Comments and chat are never rendered as HTML.

**Cut on purpose.** Unread counts (they need a read-tracking table, `message_read`, which would be a new table) and
websockets (polling is simpler and enough). Not applied: an index on `message(sender_id, sent_at)` and on
`message(session_id, message_id)` would speed up the rate limit and chat history, but the owner's rule is not to alter
existing tables; it needs the owner's OK.

## 10. MongoDB authentication (done)

Built on branch `mongo-auth` and verified live on 2026-11-10. MongoDB now requires a login. Users in the database
`pairadice_vec`: `pdApi` (role `pdVecReader`: find, listIndexes, listSearchIndexes) for the web app; `pdWorker` (role
`pdVecWriter`) for the worker, the backfill and `demo-rud.js` (it writes through the outbox drain, so it needs
`pdWorker`). The root user `pdRoot` is used only by setup.

- `vector/setup.sh` reads `MONGO_ROOT_PWD`, `MONGO_API_PWD` and `MONGO_WORKER_PWD` (or a hidden prompt), creates the
  container with the root user, refuses to continue if the container still allows anonymous access, and prints URIs
  with `***`. `--recreate` removes the container and volumes first. It is needed once and wipes the Mongo data, which
  the backfill rebuilds from MySQL.
- **Gotcha:** Atlas Local reads `MONGODB_INITDB_ROOT_USERNAME` and `MONGODB_INITDB_ROOT_PASSWORD`. The older
  `MONGO_INITDB_*` names are ignored, so the container would start with no auth. `setup.sh` exports and passes both
  sets by name, so no password is on a command line.
- `vector/scripts/init-db.js` connects as root (`MONGO_ROOT_URI` in `vector/src/config.js`) and creates or updates the
  two users from `MONGO_API_PWD` and `MONGO_WORKER_PWD`.
- `MONGO_URI` is per process (`pdApi` for the web app, `pdWorker` for the rest), with `authSource=pairadice_vec`.
  macOS: `. vector/scripts/env-from-keychain.sh` for the worker side, `bun run dev:kc` for the web side. Without a
  `MONGO_URI` the web client warns once and uses an unauthenticated default, so the Vector Lab shows Mongo as
  unavailable.
- Docs updated: README quick start, variable table and gaps; `documents/DEMO.md` (credentialed `mongosh` through
  `process.env.PW`, plus a 20-second proof that anonymous access fails and `pdApi` cannot write).

Verified: anonymous `getCollectionNames()` fails with "requires authentication"; `pdApi` can find but insert is
"Unauthorized"; `pdWorker` can insert and delete; the worker drains the outbox; `/admin/vector` shows matching counts.

Remaining: the worker still connects to MySQL as `MYSQL_USER` / `MYSQL_PWD`. `database/setup.sh --worker-user NAME`
now creates a login for the role `pairadice_vec_worker` (password from `PD_WORKER_PWD` or a prompt), but it is not
created on the owner's machine yet. Before switching, check the role's grants in `04_rbac.sql` against what the worker
reads and updates (outbox, source tables, procedures), run the worker with it, and then update the README gap list.

## 11. Discord OAuth sign-in (done)

Automated checks pass, and the real end-to-end login was verified live on 2026-11-10 (consent, callback, a new player created, session started, PKCE accepted by Discord).

- **Switch.** Off unless `PAIRADICE_DISCORD_LOGIN=1` and `DISCORD_CLIENT_ID` + `DISCORD_CLIENT_SECRET` are set;
  production also needs an `https:` `PAIRADICE_PUBLIC_URL`. Off: both routes return 404 and the button stays disabled.
- **Start** (`web/src/app/(auth)/auth/discord/route.ts`): sets a 10-minute HttpOnly, SameSite=Lax cookie with the state,
  the PKCE verifier and the safe `next` (`__Host-pd_discord` in production), then redirects to
  `https://discord.com/oauth2/authorize` with scope `identify`, the state and an S256 code challenge.
- **Callback** (`.../discord/callback/route.ts`): deletes the cookie, checks the state in constant time, exchanges the code
  at `https://discord.com/api/v10/oauth2/token` (HTTP Basic, form encoded, 8 s timeout), reads `id`, `username` and
  `global_name` from `/users/@me`, discards the token, calls `sp_discord_login` on the auth login, starts the normal
  session and redirects to `next`. Failures go to `/sign-in?error=discord`; a banned account to
  `/sign-in?error=discord_refused`.
- **`sp_discord_login`** (`database/14_discord.sql`, EXECUTE to `pairadice_auth` only): finds accounts only by Discord id
  (never by email or username), refuses banned accounts, creates a new player (username sanitised from the Discord
  username, `_2`, `_3` on collision) with no email or password, and retries on a duplicate-key race.
- **PKCE** is sent as defence in depth; Discord's docs do not document it for the code grant. The constant
  `DISCORD_PKCE` in `discord-core.ts` turns it off if Discord ever rejects it.
- **Portal redirect URI**, exactly: `http://127.0.0.1:3000/auth/discord/callback`. On the owner's Mac `bun run dev:kc`
  loads the two Keychain items (account `pairadice`); export the flag yourself. Others create their own Discord
  application or get the credentials privately. Never commit, log or screenshot them.
- **Not built:** linking Discord to an existing email account (a `sp_link_discord` reached from settings). Auto-linking
  by email or username must stay out; it would be an account takeover path.
- **Tests:** `discord-core.test.ts` (state, PKCE, URLs, cookie, flag gating, username rules), 17 more DB checks in `06`.
  The seed's fake Discord ids never match a real login.

## 12. Phase 7: Polish (summary)

Phase 7 polish is done (2026-11-10):

- Accessibility pass (WCAG 2.2 AA, by code review) on the moderation, admin, report, chat, DM, review and sign-in
  screens: heading order, 24 px targets, focus moved to the suspend/ban confirm button, the emote panel always in the
  DOM so `aria-controls` resolves, the chat refresh note announced, audit labels as screen-reader text, no lilac on
  parchment in the Discord button.
- Mobile: no horizontal scroll at 375 px on any page for player, moderator or admin (checked in the browser).
- States: rating the last teammate now shows "Thanks, your party is rated." (`?rated=1`); suspended or banned DM
  partners show "Unavailable"; admin search has an empty state.
- Mascot: `mascot-cat-wave` on the Hearth, `mascot-cat-sleep` as the default in `EmptyState`
  (`mascot={false}` restores the per-screen icon), `mascot-cat-sad` on the error and 404 pages. `icon-hide-message`
  and `icon-restore` redrawn.
- Docs: `web/README.md` rewritten; README, DEMO and this file synced; a repository scan found no committed secrets.
- Rehearsal: clean reload 336/336, `check:chat` 46/46, `check:db` all OK, the DEMO SQL steps run as written,
  typecheck, lint, 149 unit tests and the build pass.
- Cut on purpose: sound and motion toggles, extra decorations.

## 13. Sprites needed per phase

Pipeline: write `web/sprites/src/<name>.json` (`size` 16 or 32, a `palette` of at most 8 colours, `rows` of exactly
`size` strings of `size` characters, `.` transparent), add the name to `SPRITE_NAMES` in `web/src/lib/sprite-names.ts`,
and run `bun run sprites`. `web/scripts/build-sprites.ts` validates names (lowercase words joined by hyphens), sizes,
row lengths, palette keys and the 8 colour cap, and fails if a listed name has no source. It writes
`public/sprites/<name>.svg`, `src/lib/sprites.generated.ts`, the favicon `src/app/icon.svg` (from `mascot-cat`) and
`public/sprites/_preview.html` (open it in the dev server to eyeball silhouettes at 1x and 2x). `predev` and `prebuild`
run it. Draw with the design tokens plus ink `#120e1f` outlines, everything original. Use `<Sprite name scale>` at
integer scales only; give meaningful sprites an accessible label at the call site.

Already built, so do not redo: the Phase 5 set (see the table), the moderation set (`icon-hide-message`, `icon-restore`, `icon-lift`, `icon-claim`, `icon-users`, `icon-gavel`, `icon-ledger`, `icon-ban`, `icon-mute`,
`icon-scales`, `icon-report-queue`, `icon-eye-review`, `guild-hall-banner-32`), `icon-flag` for reports, `icon-block`
and `icon-unblock`, `icon-user-add`, `icon-user-check`, `icon-user-remove`, `icon-chat`, `icon-mail`,
`icon-mail-incoming`, `icon-accept`, `icon-decline`, `icon-copy`, `icon-link`, rank medals, role icons, seat frames,
platform glyphs, and the avatars `avatar-01` to `avatar-12`.

| Phase | Needed (16 px unless noted) | Used for |
|---|---|---|
| 5 (built) | `icon-send`, `icon-emoji`, emotes `emote-gg`, `emote-wave`, `emote-laugh`, `emote-cheer`, `emote-sad`, `emote-heart`, `emote-fire`, `emote-gg-wp`, and badge medals `badge-veteran`, `badge-great-teammate`, `badge-mentor` | chat composer, emote picker, character sheet badges; `icon-unread` was not needed because unread counts were cut |
| 11 (Discord) | none (the existing `icon-discord` is an original glyph, not the Discord logo) | Discord button |
| 7 (extras not built; see section 3) | `icon-sound-on`, `icon-sound-off`, `icon-motion-on`, `icon-motion-off`; cat poses `mascot-cat-wave`, `mascot-cat-sleep`, `mascot-cat-sad` (32 px) for empty and error states; decorations `deco-cloud`, `deco-tree`, `deco-tent`, `deco-lantern`; optional `avatar-13` to `avatar-16` | polish; update the modulo in `Avatar.tsx` if you add avatars |

## 14. Definition of done

A phase is done when every line holds.

**Database**

- New procedures follow the pattern in section 7 and are granted to the right role in `04_rbac.sql`.
- Direct grants that the procedures replace are revoked, and a probe proves it (Phases 6 and 5 did this for report, sanction, message moderation, chat and review).
- `./database/setup.sh ... --tests` reports every row PASS (the total goes up; no FAIL rows).
- Seed and `setup.sh` file list updated if you added a file; ER generator updated if you added a table.
- `bun run check:db` still passes, with new probes for new privileges.

**Web**

- From `web/`: `bun run typecheck`, `bun run lint`, `bun test` and `bun run build` all green.
- New pure logic has unit tests. No credentials in files. No `<placeholder>` text in any command you document.

**Browser walkthrough**, on a freshly reloaded database with the dev switch on, at 1280 px and 375 px, as:

- a **player** (user 1): the new player-facing screens work; the moderator screens return 404 (for example `/mod`);
- a **moderator** (user 9): the queue, detail actions, sanctions and audit pages work; ban is not offered; the admin
  pages return 404;
- an **admin** (user 10): everything above plus ban, lift a ban and user roles;
- a **suspended** user (11) or a muted one where relevant: read-only behaviour and readable messages;
- keyboard only, once, with the browser console open for errors.

**Documents**

- README: counts, load order, the "What it does" table and the "Status and known gaps" section.
- `documents/DEMO.md`: counts, plus any step your change breaks. The sanction step is already fixed: it shows the
  denied direct `INSERT` as `pd_mod`, then `sp_issue_sanction` and `sp_lift_sanction`. The RBAC step
  that ran `SELECT COUNT(*) FROM message` as the player is fixed in Phase 5: it now shows the denied direct read, then
  `CALL sp_chat_history(1, 3, NULL, 5)`. The MongoDB `mongosh` line is fixed for Mongo auth: it uses `process.env.PW`, so no password is on the command line.
- `web/README.md`: routes, scripts and conventions.
- This file: move the finished work out of the "next" list and update the counts.

## 15. First hour checklist

1. `git pull` on `main`; confirm `git log --oneline -1` and read `git status` (the mascot change may be uncommitted
   on the owner's machine).
2. Read this file and the README's "Architecture" and "Status" sections. Skim `database/04_rbac.sql` and
   `database/09_sessions.sql`: they are the two files whose patterns you will copy.
3. Check MySQL is up (`mysql.server start` on a Mac) and Docker is running (`docker ps` shows `pairadice-mongo`).
4. Reload the database with a login path from section 4, with `--tests`. Expect 336 of 336 passed.
5. `./vector/setup.sh` (add `--recreate` once if the container predates auth), then start the worker in a second terminal with the pdWorker `MONGO_URI` (section 4).
6. In `web/`: `bun install`, then `bun run typecheck`, `bun run lint`, `bun test` (149 pass) and `bun run build`.
   Delete `web/.next` if typecheck shows errors in files you did not touch.
7. `bun run dev:kc` (Mac) or the socket command (Linux) with `PAIRADICE_DEV_AUTH=1`. Visit `/hearth`, `/board`,
   `/camp/10`, `/camp/3` (chat), `/messages`, `/character/1`, `/friends`, `/mod` as user 9, and `/admin/vector` and `/admin/users` as user 10.
8. Run `bun run check:db` (Mac with Keychain) to see the five logins prove their limits.
9. Skim `database/12_moderation.sql` (the newest procedure file, a good pattern to copy) and open `/mod` as user 9.
10. Branch, then pick an item from section 3, tests first.

## 16. Known stale docs and unverified items

Corrected or found stale while writing this:

- The old `docs/handoff.md` (local, gitignored) described a project around Phases 1 and 2. It said no root README, no
  per-role pools, no Phase 4, 48 tests, 46 sprites, a Mongo container that fails to start, and logins "in progress";
  all of that is out of date. Do not use it.
- The root README counts were recounted from the SQL files in Phase 7: 52 procedures, 9 functions, 55 triggers, 1 event, 336 checks (Discord sign-in added).
- `web/README.md` was stale (read-only Phase 1 app) and was rewritten in Phase 7.
- `bun run test` does not exist; the command is `bun test`.
- Closed: the player's direct `SELECT`/`INSERT` on `message` and `INSERT` on `review` (Phase 5), the unscheduled
  `sp_expire_sanctions` (now `ev_expire_sanctions`) and the direct grants on `report`, `sanction` and message
  moderation (Phase 6). No direct player or moderator write grants remain.
- Open: the two `message` indexes in section 9 need the owner's OK; unread counts and websockets are not built.
- Seed users cannot sign in with a password (placeholder hashes). Only `/sign-up` accounts and the dev switch work.

Verified on 2026-11-10: the Keychain items `pairadice/mongo_root`, `mongo_api` and `mongo_worker` exist and work, and MongoDB authentication works end to end (section 10).

Verified on 2026-11-10 for Discord sign-in: the Keychain items `pairadice/discord_client_id` and `pairadice/discord_client_secret` are present; the authorize and token endpoints and the `identify` scope were checked against Discord's docs; automated checks pass (start route redirects with the right parameters and cookie, a callback without the cookie goes to `/sign-in?error=discord`, the sign-in page shows the enabled button, 336/336 DB checks, `check:db` probes: auth may run the procedure, player may not).

Not verified on 2026-11-10:

- The live MySQL state beyond the `--tests` run (336 of 336). Reload and rerun it first.
- The real end-to-end Discord login (consent, callback, new account) was verified live on 2026-11-10.
- The grants of `pairadice_vec_worker` against what the worker actually needs (section 10); the MySQL login for it does not exist yet.
- The viva date and any submission deadline are not recorded in the repo.
