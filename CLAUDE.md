# PairADice: instructions for coding agents

Read `documents/HANDOFF.md` first. It is the maintainer's guide: state, environment, conventions, and the list of
what is still left (section 3).

## How to work here

Follow `documents/HANDOFF.md` section 17. In short:

- **Use ECC (Everything Claude Code). It is required for efficiency.** Run the work through `ecc:*` agents:
  `ecc:tdd-guide` for SQL and tests, `ecc:gan-generator` for web and sprites, `ecc:database-reviewer` and
  `ecc:security-reviewer` before merging, `ecc:doc-updater` for docs. If ECC is not installed, install it first
  (`ecc:configure-ecc`).
- One orchestrator, at most three worker agents at a time, each with a self-contained brief and its own files.
  Write a small contract file (signatures, columns, field names) before parallel database and web work.
- Sprites get their own agent; previews are rendered and checked before use.
- Review, fix, then verify yourself: `./database/setup.sh ... --tests` all PASS, `bun run check:chat`,
  `bun run check:db` (Mac), `bun run typecheck`, `bun run lint`, `bun test`, `bun run build`, and a browser pass as
  player, moderator and admin.
- One branch per phase. Report the milestone, then commit, merge to `main` and push only when the owner says so.

## Hard rules

- Never write a password, key, token or credentialed URI into a file, log or chat. Use the macOS Keychain or
  environment variables, passed by name.
- bun in `web/` (never npm). `vector/` stays on npm.
- Never alter an existing table without the owner's OK; add new tables in new numbered SQL files.
- Every app write is a DEFINER stored procedure with tests in `database/06_constraint_tests.sql`.
- No pixel fonts; all art original. No angle-bracket placeholders in shell commands.
- ECC's GateGuard hook may ask you to state facts before your first command or edit: answer briefly and retry.
- Next.js 16 differs from older versions: read `web/node_modules/next/dist/docs/` before using an unfamiliar API.
