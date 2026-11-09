# PairADice web

The Next.js app for PairADice, a looking-for-group board for video games. Players post quests, ask to join,
chat, message each other, rate teammates and report problems; moderators and admins have their own screens.
The database design is the core of the project and this app shows it working: every write is a stored
procedure, and every request runs on a MySQL login that matches the viewer's role.

Background, architecture and the database live elsewhere; this file covers only the web app.

- [Root README](../README.md): what it does, architecture, technology justification, database counts, quick start.
- [`documents/HANDOFF.md`](../documents/HANDOFF.md): maintainer's guide (environment, conventions, gotchas, what is left).
- [`documents/DEMO.md`](../documents/DEMO.md): the 10-minute viva script.

## Stack

Next.js 16 (App Router, server components, server actions), React 19, TypeScript (strict), Tailwind CSS v4,
bun (never npm in this folder), `mysql2`, `mongodb` (read-only vector client), `@node-rs/argon2`.

## Run it

Load the database first (`../database/setup.sh`, see the root README), then:

```bash
cd web
bun install
```

**Owner's Mac.** The five MySQL logins, `AUTH_SECRET`, the Discord items (if present) and the read-only Mongo URI
live in the Keychain. `dev:kc` loads them into the environment and starts the dev server:

```bash
PAIRADICE_DEV_AUTH=1 bun run dev:kc
```

**Linux, or any machine with socket logins** (created by `setup.sh --socket-logins`):

```bash
MYSQL_SOCKET=/var/run/mysqld/mysqld.sock \
PD_DB_USER_WEB=pd_web_sock PD_DB_USER_AUTH=pd_auth_sock PD_DB_USER_PLAYER=pd_player_sock \
PD_DB_USER_MODERATOR=pd_mod_sock PD_DB_USER_ADMIN=pd_admin_sock \
PAIRADICE_DEV_AUTH=1 bun run dev
```

Open <http://127.0.0.1:3000> (use that host, not `localhost`: cookies and the Discord redirect are host specific).
`PAIRADICE_DEV_AUTH=1` adds a development-only "play as" switch so you can act as any seed player. Seed accounts
cannot sign in with a password; create a real account at `/sign-up`.

Environment variables are listed by name in `.env.example`. Real values stay in the shell or the Keychain and are
never written to a tracked file.

## The five MySQL logins

The server never uses one all-powerful connection. `src/lib/db.ts` keeps one pool per login, each tied to a MySQL role:

| Env prefix | Role | Used for |
| --- | --- | --- |
| `WEB` | `pairadice_web_ro` | anonymous page reads; cannot see credentials, messages, friendships or blocks |
| `AUTH` | `pairadice_auth` | sign-up, sign-in, sessions, Discord login; the only login that touches credentials |
| `PLAYER` | `pairadice_player` | signed-in players: reads plus DEFINER procedures, no direct DML |
| `MODERATOR` | `pairadice_moderator` | the player role plus read access to reports, sanctions and the audit log |
| `ADMIN` | `pairadice_admin` | DML and EXECUTE only; no DDL, no GRANT OPTION |

Why: the database, not just the app, enforces who may do what. A bug in a page cannot read a password hash, and a
player's login cannot write a table directly.

## Scripts

| Command | What it does |
| --- | --- |
| `bun run dev` | Builds sprites, then `next dev --turbopack -H 127.0.0.1` |
| `bun run dev:kc` | Same, with the logins loaded from the macOS Keychain (`scripts/dev-keychain.sh`) |
| `bun run build` / `bun run start` | Production build (builds sprites first) and server |
| `bun run sprites` | Regenerates `public/sprites/*.svg`, `src/lib/sprites.generated.ts` and the favicon from `sprites/src/*.json` |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run lint` | ESLint |
| `bun test` | Unit tests (there is no `test` script, so `bun run test` does not exist) |
| `bun run check:db` | Proves each login's identity plus one forbidden action each (needs the Keychain items) |
| `bun run check:chat` | Row-filtering checks for the chat read procedures (password from the `MYSQL_PWD` environment variable) |

## Routes

| Route | Who | What |
| --- | --- | --- |
| `/` | anyone | Landing page |
| `/sign-in`, `/sign-up` | anyone | Email sign-in and sign-up on the "Press start" screen |
| `/auth/discord`, `/auth/discord/callback` | anyone | Optional Discord sign-in (404 while switched off) |
| `/board` (optional game slug) | anyone | Quest Board, filtered by game |
| `/camp/[sessionId]`, `/camp/new` | anyone views; players act | Party seats, join requests, chat, "Rate your party"; host a quest |
| `/hearth` | player | Recommended quests, kindred spirits, recent DMs |
| `/character`, `/character/[userId]`, `/character/edit` | player | Own sheet, any sheet, profile editor |
| `/friends`, `/party` | player | Friends and blocks; your parties |
| `/messages`, `/messages/[userId]` | player | DM inbox and threads |
| `/report/[userId]` | player | Report a player |
| `/mod`, `/mod/reports`, `/mod/reports/[id]`, `/mod/sanctions`, `/mod/audit` | moderator, admin | Guild Hall |
| `/admin/users`, `/admin/users/[id]` | admin | Players and roles |
| `/admin/vector` | admin | Vector Lab |
| `/api/chat/[sessionId]`, `/api/dm/[userId]` | player | Polling endpoints (`GET ?after=ID`, JSON, no-store) |
| `/api/admin/vector/snapshot` | admin | Vector Lab snapshot |
| `/styleguide` | development only | Design-system page (404 in production) |

Screens a viewer may not see answer 404, not 403, so they do not reveal that they exist.

## Layout of `src/`

```
proxy.ts          replaces middleware (malformed URLs, dev-only paths)
app/
  (auth)/         sign-in, sign-up, shared actions, Discord start and callback routes
  (hearth)/       the signed-in shell: board, camp, hearth, character, friends, party, messages,
                  mod, admin, report, styleguide; chat/ holds only server actions
  api/            chat and DM polling, Vector Lab snapshot
  actions/        dev "play as" action
components/       ui (Window, Button, Chip, Meter, Sprite, ...), plus hearth, auth, camp, quest, character,
                  social, chat, review, report, mod, admin, lab
lib/
  db.ts, db-roles.ts   per-role pools
  read-login.ts        readCtx: the login for a read
  auth/                guards, viewer, session, tokens, argon2, rate limits, Discord OAuth
  mutations/           one module per area; run.ts holds runAsViewer
  queries*.ts          typed reads, sql-parts.ts for shared fragments
  chat/, moderation/, profile/, report/, review/   plain validation modules with tests
  recommend.ts, vector/   hybrid ranking and the read-only Mongo client
  sprite-names.ts, sprites.generated.ts   sprite contract and generated data
```

## Conventions

- **Writes.** A form posts to a server action; the action calls `runAsViewer` (`lib/mutations/run.ts`), which picks
  the login of the viewer's highest role and runs one stored procedure. Procedure refusals (SQLSTATE 45000) become
  the message the user sees. No SQL for writes in TypeScript.
- **Reads.** Anonymous pages read as the web login. A signed-in read goes through `readCtx(viewer)`, which uses the
  viewer's own login and fails closed to the web login if the viewer does not match the request's session.
- **Guards.** Call `requireRole` in the page and again inside each server action. It calls `notFound()` on failure.
- **Next.js 16.** `params`, `searchParams`, `cookies()` and `headers()` are async; `proxy.ts` replaces middleware.
  `redirect()` throws, so keep it outside `try/catch`. Only plain objects cross from server to client components.
  Read `node_modules/next/dist/docs/` before using an API you have not used here.
- **Tests.** Pure logic lives in modules without `server-only`, with a `*.test.ts` beside it.
- **Secrets.** Never commit a value, never print one. Use environment variables or the Keychain.
- **Design language.** "Cozy dusk": Fredoka for display, Nunito for body, no pixel fonts. Tokens live in
  `src/app/globals.css`. Body text at least 15 px, WCAG 2.2 AA, a visible focus ring, motion respects
  `prefers-reduced-motion`, status never by colour alone.
- **Sprites.** Original pixel art as JSON in `sprites/src/` (16 or 32 px, at most 8 colours). Add the name to
  `lib/sprite-names.ts`, run `bun run sprites`, and draw it with `<Sprite name scale>` at integer scales only.
- **Time.** Every connection runs in UTC and times render in the viewer's timezone.
