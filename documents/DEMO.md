# PairADice: 10-minute viva demo

A walkthrough in rubric order. The SQL commands below have been run against the seed data. Times are a guide, so
skip a step if the examiner moves on. The [README](../README.md) has the background and the technology
justification.

---

## Before the viva (5 minutes, not timed)

Reload everything so the seed dates are fresh ("upcoming" sessions really are upcoming) and the tests run on a
clean database.

```bash
cd Pairadice
ADMIN=root                              # or your own auth_socket admin login
SOCK=/var/run/mysqld/mysqld.sock

./database/setup.sh -u "$ADMIN" -S "$SOCK" -y --tests --socket-logins "$USER"   # reports 336/336 passed
./vector/setup.sh                                                               # needs Docker running and the three Mongo passwords (see the README)
```

If your MySQL has no `auth_socket` plugin, create password logins instead and keep their passwords in the macOS
Keychain (account `pairadice`, services `pairadice/pd_web`, `pd_auth`, `pd_api`, `pd_mod`, `pd_admin` and
`pairadice/auth_secret`). Export `PD_WEB_PWD`, `PD_AUTH_PWD`, `PD_APP_PWD`, `PD_MOD_PWD` and `PD_ADMIN_PWD` from the Keychain
with `security find-generic-password -a pairadice -s pairadice/pd_web -w` (and the same for the others), or leave them unset for hidden prompts:

```bash
./database/setup.sh -u "$ADMIN" -S "$SOCK" -y --tests --web-user pd_web --auth-user pd_auth \
    --app-user pd_api --mod-user pd_mod --admin-user pd_admin
```

Terminal B then starts with `PAIRADICE_DEV_AUTH=1 bun run dev:kc` (it loads the logins from the Keychain). With password logins, use
`pd -u pd_api -p` style commands in the RBAC step below, which prompt for the password.

Open three terminals:

| Terminal | Command |
|---|---|
| **A** (worker) | `. vector/scripts/env-from-keychain.sh && node vector/scripts/worker.js --watch` (macOS; this sets the `pdWorker` `MONGO_URI` from the Keychain and prints nothing. On Linux export `MONGO_URI` yourself, see the README) |
| **B** (web) | the `bun run dev` command from the README, with `PAIRADICE_DEV_AUTH=1` |
| **C** (SQL) | stays at a shell; the `mysql` commands below run here |

Helpers for terminal C:

```bash
pd() { mysql -S "$SOCK" -t pairadice "$@"; }       # usage: pd -u pd_player_sock -e "SELECT 1"
q()  { awk -v a="^-- Q$1 " -v b="^-- Q$(( $1 + 1 )) " '$0~a{p=1} $0~b{p=0} p' database/05_sample_queries.sql; }
```

`q 10` prints sample query Q10 from `05_sample_queries.sql`, and `q 10 | pd -u "$ADMIN"` runs it.

Have these open: <http://127.0.0.1:3000/board>, `documents/pairadice_erd.drawio` in draw.io, and
`database/01_schema.sql`. The header's **Dev: play as** menu switches between seed players.

### Seed IDs worth remembering

| ID | User | Why |
|---:|---|---|
| 1 | `aarav_plays` | the default "play as" player; plays Valorant as a Duelist |
| 2 | `priya_gg` | hosts session 10 |
| 4 | `lukas_mc` | not yet Aarav's friend, so useful for the friend-request step |
| 7 | `jake_fn` | target of the sanction and report demos (the sanction is lifted again) |
| 9 | `mod_alex` | moderator |
| 10 | `admin_sam` | admin, so has access to `/mod`, `/admin/users` and the Vector Lab |
| 11 | `toxic_tyler` | suspended; his open session 9 does not appear on the board |
| 12 | `kiara_ctrl` | the recursive-CTE example |

| ID | Session | Status |
|---:|---|---|
| 10 | Chill unrated, all ranks welcome (host Priya, Valorant) | open, used for the join demo |
| 8 | Spike Rush with friends (host Rohan) | open, Aarav's top recommendation |
| 9 | Late night unrated NA (host Tyler) | open but hidden: host suspended |
| 5 | Saturday squads | full |
| 3, 4 | warm-up / Zero Build ranked push | completed |

---

## 0:00 – 0:30 · What it is

> "PairADice is a looking-for-group board. A host posts a quest, players ask to join, the host fills party seats.
> MySQL is the source of truth and enforces every rule; MongoDB holds embeddings that only rerank what MySQL has
> already allowed."

Show the architecture diagram in the README.

## 0:30 – 1:30 · ER diagram and relational schema (2 + 3 marks)

1. In draw.io, show **page 0 (Big Picture)**, then **page 5 (Sessions & Matching)**:
   - `SESSION_SLOT` and `SESSION_PARTICIPANT` are **weak entities** (double border) owned by `LFG_SESSION`.
   - The M:N diamonds become junction tables (`session_language`, `user_tag` …).
   - `GEO_REGION` has a **self-referencing** relationship (the region tree), used later by a recursive CTE.
   - The dashed boxes on page 8 are the **MongoDB** collections, linked by id only.
2. Show **page 9**, the relational schema generated from `01_schema.sql`.

## 1:30 – 2:30 · DDL and constraints (4 marks)

```bash
pd -u "$ADMIN" -e "SHOW CREATE TABLE sanction\G"
```

Point at the FKs, `ck_sn_period` (ends after it starts) and `ck_sn_self` (cannot sanction yourself). Then mention
the other kinds of constraint:

- `auth_account`: a CHECK rejects any `password_hash` not in argon2id format, so a plaintext password cannot be
  stored even by mistake.
- Composite FKs: a Valorant rank cannot be attached to a Minecraft profile, and a slot role must belong to the
  session's game.

```bash
grep -cE "^CALL t_(expect_error|expect_msg|probe)" database/06_constraint_tests.sql   # 263, plus 73 behaviour rows = 336
grep -o "t_expect_error('[^']*'" database/06_constraint_tests.sql | head -12
```

> "336 checks: statements the database **must reject**, exact-error-text assertions, grant probes and behaviour
> checks, covering CHECKs, FKs, triggers, RBAC and procedure rules. The setup run ended with 336/336 passed."

## 2:30 – 4:00 · DML and queries (4 marks)

Every write in the app goes through a procedure (shown later). Here are reads of each required kind:

```bash
q 4  | pd -u "$ADMIN"     # NESTED (NOT IN): players never rated below 4 stars
q 7  | pd -u "$ADMIN"     # CORRELATED (EXISTS / NOT EXISTS): who could join which open session
q 10 | pd -u "$ADMIN"     # RECURSIVE CTE: Kiara's friends (degree 1) and friends-of-friends (degree 2)
```

Expected Q10 result: `aarav_plays` 1, `priya_gg` 2, `rohan_duelist` 2.

Also available if asked: Q1–Q3 multi-table joins, Q8–Q9 recursive region tree ("every player anywhere in Asia"),
Q12 window function (`RANK() OVER (PARTITION BY game_id …)`) and Q13 `GROUP BY … HAVING`.

## 4:00 – 5:30 · Procedures, functions, triggers (6 marks)

**Procedure: the matching engine.**

```bash
pd -u "$ADMIN" -e "CALL sp_recommend_sessions(1, 5, FALSE)"
```

> "Hard filters first: free seat, a role Aarav plays, his platform, a shared language, no block either way, host not
> suspended. Then a weighted score from rank, availability, tags, rating, friends and region, one column each.
> Session 8 scores about 0.73 because its host is a friend (`social_fit` = 1)."

`FALSE` means "do not log". With `TRUE` it writes `match_recommendation` rows, and a trigger later marks them
`joined` when the player is accepted.

**Procedures and triggers: a sanction suspends a user, and the moderator cannot bypass the procedure.** First the
proof that the direct write is gone, as the **moderator** login:

```bash
pd -u pd_mod_sock -e "INSERT INTO sanction (user_id, issued_by, sanction_type, reason, ends_at)
  VALUES (7, 9, 'suspend', 'Demo', UTC_TIMESTAMP() + INTERVAL 1 DAY)"
# ERROR 1142 (42000): INSERT command denied to user ... for table 'sanction'
```

Then the allowed path, one session so `@sid` survives. The procedure commits its own transaction, so this changes
data until the lift at the end:

```bash
pd -u pd_mod_sock -e "
CALL sp_issue_sanction(9, 7, 'suspend', 'Demo suspension', UTC_TIMESTAMP() + INTERVAL 1 DAY, NULL, @sid);
SELECT user_id, username, status FROM users WHERE user_id = 7;
SELECT entity, action, new_value FROM audit_log ORDER BY log_id DESC LIMIT 2;
CALL sp_lift_sanction(9, @sid, 'Demo over');
SELECT status AS after_lift FROM users WHERE user_id = 7;
SELECT entity, action, new_value FROM audit_log ORDER BY log_id DESC LIMIT 2;"
```

Expected output: Jake is `suspended`, two audit rows appear (`users status_change`, `sanction issue`), and after the
lift he is `active` again with a `sanction lift` row that carries the reason.

> "The moderator has no INSERT on `sanction` and no UPDATE on `report`. Every write goes through a procedure that
> checks `fn_has_permission`, the staff rank (a moderator cannot sanction staff), conflict of interest and duration
> limits, then lets the triggers flip the status and write the audit log. A player cannot issue a sanction, and a
> moderator cannot issue a **ban**; only admins hold `user.ban`. All of that is among the 336 checks."

**Transaction with a row lock.** `sp_accept_participant` locks the session row (`SELECT … FOR UPDATE`) before it
fills a seat, so two accepts at the same moment cannot overbook. You will see it live in the UI step below.

## 5:30 – 7:00 · Authentication and RBAC in the database (4 marks)

Three MySQL roles, three different answers to the same kind of question:

```bash
pd -u pd_web_sock    -e "SELECT CURRENT_ROLE(); SELECT * FROM auth_account LIMIT 1"   # denied
pd -u pd_player_sock -e "SELECT CURRENT_ROLE(); SELECT * FROM audit_log LIMIT 1"      # denied
pd -u pd_mod_sock    -e "SELECT CURRENT_ROLE(); SELECT COUNT(*) FROM audit_log"       # allowed
```

With password logins, the sharpest one-liner is the same query as two logins (add `-p` if you did not export
`MYSQL_PWD`):

```bash
pd -u pd_web -e "SELECT COUNT(*) FROM message"   # ERROR 1142: SELECT command denied
pd -u pd_api -e "SELECT COUNT(*) FROM message"   # ERROR 1142: SELECT command denied (the player has no direct read either)
pd -u pd_api -e "CALL sp_chat_history(1, 3, NULL, 5)"   # the same data, through the procedure: only Aarav's camp 3 lines
```

Then let the script prove every login at once:

```bash
cd web && bun run check:db     # each login's identity, one forbidden action each, and one allowed action
```

> "Anonymous page reads use `pairadice_web_ro`, which cannot see the credentials table, private messages,
> friendships or blocks, and cannot run the recommender. A signed-in request, read or write, runs on the viewer's own
> role login and fails closed to the anonymous one if the session does not match. The player role has no direct DML
> on any table, not even reading or inserting `message`; it reads and writes only through DEFINER procedures, which refuse NULL or suspended actors and return only the caller's own conversations. The
> admin role has no DDL and no GRANT OPTION. Only `pairadice_auth` touches `auth_account` and `auth_token`, so even
> an SQL-injection bug in a page read could not reach a password hash."

Then in the browser:

1. Go to `/sign-up` and create an account with any new username and email. That runs `sp_register_user` through
   `pd_auth_sock`. The password is stored as an argon2id hash, and the cookie holds a random token whose HMAC is
   the only thing stored in `auth_token`.
2. Visit `/mod` as that new player: the page returns **404**, because the guard does not reveal that it exists.
   Then **sign out**. A real session hides the "play as" menu and always wins over it, so the menu only comes back
   after sign-out.
3. **Guild Hall.** Switch "play as" to **1 `aarav_plays`**, open `/character/7` and click **Report** on `jake_fn`
   (`sp_report_user`). Switch to **9 `mod_alex`**, open `/mod/reports`, choose **Take it** (`sp_claim_report`), then
   **Suspend 1 day** with a reason and confirm (`sp_issue_sanction`). Open `/mod/audit` to show the rows, and lift
   the sanction from `/mod/sanctions` (`sp_lift_sanction`). As mod_alex, `/admin/users` returns **404**; as the
   player, `/mod` does. Switch to **10 `admin_sam`**: `/mod` and `/admin/vector` load, and `/admin/users/12` lets
   him grant or revoke roles (`sp_grant_role`, `sp_revoke_role`).

## 7:00 – 8:45 · NoSQL vector store: create, read, update, delete (4 + 7 marks)

**Creation (4).** Show `vector/src/schema.js`: the strict `$jsonSchema` validators, the B-tree indexes, and the
vector search indexes (cosine, 384 dims, with filter fields). Then a live document:

MongoDB requires a login. The password goes in through the environment (`PW` is passed by name, so it never appears
on a command line or in `ps`). In terminal C, with `MONGO_API_PWD` exported (macOS: `. vector/scripts/env-from-keychain.sh`):

```bash
mp() { PW="$MONGO_API_PWD" docker exec -e PW pairadice-mongo mongosh --quiet --eval \
  "const d = db.getSiblingDB('pairadice_vec'); d.auth('pdApi', process.env.PW); $1"; }
mp "printjson(d.player_embeddings.findOne({_id: 12}, {embedding: {\$slice: 4}, source_text: 1, model: 1, updated_at: 1}))"
```

**Authentication proof (20 seconds).** Same helper, then an anonymous attempt:

```bash
docker exec pairadice-mongo mongosh --quiet --eval "db.getSiblingDB('pairadice_vec').getCollectionNames()"
mp "d.player_embeddings.insertOne({_id: 9999})"
```

> "The first command has no login and fails with 'requires authentication'. The second is the web app's read-only user
> `pdApi`: it can find, but its insert fails with 'Unauthorized'. Only `pdWorker` can write, and the root user is used
> only by setup."

**RUD (7).** As **10 `admin_sam`**, open `/admin/vector` (the Vector Lab). Keep terminal A visible.

| Panel | What to say |
|---|---|
| **Pipeline status** | Outbox backlog, attempts and dead letters. MySQL is the source of truth; MongoDB is a derived copy. |
| **C · Create a demo player** | Inserting a MySQL user fires a trigger, which adds an outbox row; the worker embeds it and a new document appears. |
| **R · Read: kindred spirits** | `$vectorSearch` neighbours. For Kiara (12) in Valorant: Priya ≈ 0.87, Rohan ≈ 0.80, Aarav ≈ 0.79. A "chill builder" bio finds Tom and Mei. |
| **U · Update bio and tags** | Change the bio to a "Bedwars tryhard". The **before and after** document is shown, and the neighbours change (Sofía moves to the top). |
| **D · Delete (ban) and restore** | Banning the demo player **deletes** its MongoDB document, so banned players are never suggested. Restoring re-creates it. |

> "The edit is one MySQL transaction. The trigger records the change in the outbox inside that transaction, so it
> cannot be lost. The worker re-embeds only if the text hash changed. Hard filters stay in SQL; vectors only rerank.
> The Hearth blends 0.6 × vector + 0.4 × the SQL score."

As a backup, the terminal version is `node vector/scripts/demo-rud.js`. It writes through the outbox drain, so run it with the `pdWorker` `MONGO_URI` (terminal A's environment; the same Keychain script sets it). It runs the same create, read, update and
delete steps and prints each one.

## 8:45 – 9:40 · Next.js UI and backend integration (3 + 2 marks)

1. As **1 `aarav_plays`**, open `/board`. Tyler's open session 9 is missing (host suspended). Open session 10,
   **Chill unrated**: Priya's gamertag is hidden.
2. Choose the **Duelist** role and an account, then click **Knock to join** (`sp_request_join`).
3. Switch "play as" to **2 `priya_gg`**, open camp 10, and **Accept** Aarav (`sp_accept_participant`). The seat
   fills, and a trigger updates `current_players`.
4. Switch back to **1 `aarav_plays`**: "You're in the party", and every seat now shows its gamertag (and the
   Discord invite would show too, if the host had set one; no seed session has one).
5. Go to `/friends`, search `lu`, and click **Add friend** on Lukas (`sp_send_friend_request`). Then use **Cancel
   request**. Blocked and suspended players never appear in search, and the procedures refuse them anyway.

6. **Chat.** As **1 `aarav_plays`**, open `/camp/3` and send `gg :gg:` (the token shows as a sprite). In a second tab
   as **2 `priya_gg`**, open `/camp/3`: the line appears within 4 seconds (the page polls
   `GET /api/chat/3?after=ID`). Then open `/messages/8` as Aarav to show a DM thread with Rohan (`sp_send_dm`: allowed
   because they are friends). Optional: on a completed camp, show the "Rate your party" panel (`sp_write_review`).

7. **Discord sign-in (optional, about 20 seconds; only if the feature is switched on).** Sign out and open `/sign-in`:
   the "Continue with Discord" button is enabled. Click it and stop at Discord's consent screen, which shows only the
   `identify` scope. Do not type or show any credentials or keys. Say: "State and a PKCE challenge go out, the callback
   checks them, and `sp_discord_login` finds the account by Discord id only, never by email, so a Discord profile
   cannot take over an email account. No token is stored." If it is switched off the button is disabled, and that is
   fine to show. The real end-to-end login was verified live on 2026-11-10.

Hosting a new quest at `/camp/new` (`sp_create_session`) also works, if there is time.

> "Pages are server components reading MySQL directly with parameterised SQL. Every form is a server action that
> picks the MySQL login for the user's role and calls one procedure. There is no SQL in the browser and no business
> rule duplicated in TypeScript."

## 9:40 – 10:00 · Wrap-up

- Docs: the README (architecture, technology justification, rubric map) and this script. Git history: small,
  focused commits for each piece.
- Honest gaps: Discord accounts are not linked to existing email accounts, the worker still uses the general MySQL login instead of its own `pairadice_vec_worker` login, chat polls every 4
  seconds instead of using websockets, and unread counts are not built. Two `message` indexes are possible but not
  applied, because existing tables are not to be altered.

---

## If something goes wrong

| Symptom | Fix |
|---|---|
| Vector Lab says MongoDB is unreachable | Start Docker (on Linux Docker Desktop: `systemctl --user start docker-desktop`), then rerun `./vector/setup.sh` |
| Outbox backlog never drains | The worker in terminal A is not running |
| A neighbour list is empty right after an edit | The vector index is eventually consistent (hundreds of ms); refresh |
| "Upcoming" sessions are in the past | Reload: `./database/setup.sh … -y --tests`, then `./vector/setup.sh` |
| "Knock to join" refused after an earlier rehearsal | Aarav is already in camp 10; reload the database |
| "You already reported this player" | Aarav has an open report on Jake from a rehearsal; reload the database |
| Test summary below 336/336 | Reload once and rerun before investigating |
