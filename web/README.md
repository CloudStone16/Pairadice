# PairADice web

The cozy front door for PairADice, a looking-for-group board: browse open quests on a cork board, peek
into a camp's party seats, and check a player's character sheet. Next.js 16 (App Router), React 19,
TypeScript (strict), Tailwind CSS v4, bun, and a read-only MySQL data layer.

## Setup

1. Load the database first (`../database/setup.sh`, which also loads the seed data).
2. Install dependencies: `bun install`
3. Start the dev server, exporting secrets in the shell (they are never stored in files):

   ```bash
   PAIRADICE_DEV_AUTH=1 MYSQL_PWD=... bun run dev
   ```

   The server binds to `127.0.0.1:3000`. Without `PAIRADICE_DEV_AUTH=1` every page shows the
   "Sign-in arrives in Phase 2" gate.

## Environment variables (names only, see `.env.example`)

| Name | Purpose |
| --- | --- |
| `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE` | Where the database lives (defaults: 127.0.0.1, 3306, pairadice) |
| `MYSQL_USER` | Prefer the read-only `pairadice_web_ro` login. `root` is tolerated in development (with a warning) and refused in production |
| `MYSQL_PWD` | Password. Required, shell only |
| `PAIRADICE_DEV_AUTH` | `1` enables the dev "play as" switch. Honoured only when `NODE_ENV=development` |

## Scripts

| Command | What it does |
| --- | --- |
| `bun run dev` | Builds sprites, then `next dev --turbopack -H 127.0.0.1` |
| `bun run build` / `bun run start` | Production build and server |
| `bun run sprites` | Regenerates `public/sprites/*.svg`, `src/lib/sprites.generated.ts` and the app icon from `sprites/src/*.json` |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run lint` | ESLint |

## Phase notes

**Phase 1 (this app) is read-only.** It runs `SELECT` statements and a single procedure call,
`CALL sp_recommend_sessions(?, ?, FALSE)` (the `FALSE` means nothing is logged). It never writes.
It never reads `auth_account`, `auth_token`, `platform_account`, `sanction`, `report` or `audit_log`.

- **Identity:** there are no accounts yet. The only identity is the development "play as" cookie, which
  works solely with `NODE_ENV=development` and `PAIRADICE_DEV_AUTH=1`.
- **Privacy:** gamertags, the session chat log and the Discord invite are shown only to a camp's host or
  an accepted participant. Everyone else sees seats, roles and names plus a friendly lock note.
  Users blocked in either direction are hidden from friends and DMs.
- **Time:** every connection runs in UTC and times are rendered in the viewer's timezone.

**Phase 2** adds real sign-in, hosting and joining quests, and live chat.
