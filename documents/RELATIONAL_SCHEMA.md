# PairADice — Relational Schema (MySQL)

Source of truth: [`database/01_schema.sql`](../database/01_schema.sql). Diagram: page **9 Relational Schema** of [`pairadice_erd.drawio`](pairadice_erd.drawio). That page is generated from the DDL, so it always matches.
Target: MySQL 8.0.16+ (CHECK constraints enforced); tested on MySQL 9.7.1.

## Notation
- **bold** = primary key. Several bold columns = composite PK.
- `col → table` = foreign key.
- `UQ(...)` = unique constraint. `CK` = CHECK constraint.
- `?` = nullable. `~col` = derived, kept current by triggers.

Renames from the ER diagram (to avoid MySQL keywords): `USER` → `users`, `GEO_REGION.level` → `region_level`, `SANCTION.type` → `sanction_type`, `REVIEW.comment` → `comment_text`.

## ER → table mapping rules
1. **Strong entity** → table with a surrogate `AUTO_INCREMENT` PK. The exceptions are `language` and `country`, which keep their ISO codes.
2. **Weak entity** → table whose PK is the owner's PK plus the partial key (`availability`, `session_slot`, `session_participant`, `review`).
3. **1:N relationship** → FK on the N side.
4. **M:N relationship** → junction table. Its PK is both FKs, and relationship attributes become columns.
5. **Recursive relationship** → self FK (`geo_region.parent_region_id`) or a junction with two FKs to `users` (`friendship`, `user_block`).
6. **Same-game consistency** is enforced by composite FKs `(x_id, game_id)`, so a Valorant rank can never sit on a Minecraft profile. The target tables carry `UQ(x_id, game_id)`.
7. **External entities** (`PLAYER_EMBEDDING`, `SESSION_EMBEDDING`) are MongoDB collections linked by id. They are not MySQL tables.

## Relations (44 tables)

### Language & Region
| Table | Columns |
|---|---|
| language | **language_code**, name, native_name |
| geo_region | **region_id**, name, code UQ, region_level {continent, sub_region, matchmaking}, parent_region_id? → geo_region. CK: continent ⇔ no parent |
| country | **country_code**, name, region_id → geo_region |

### Identity & Access
| Table | Columns |
|---|---|
| users | **user_id**, username UQ, display_name, avatar_url?, bio?, status {active, suspended, banned}, timezone, region_strictness {strict, nearby, any}, country_code? → country, home_region_id? → geo_region, created_at, last_active_at?, ~avg_rating?, ~review_count, ~sessions_completed, ~trust_score |
| auth_account | **auth_id**, user_id → users, provider {discord, email}, provider_user_id?, email? UQ, password_hash?, email_verified, created_at. UQ(provider, provider_user_id). CK: an email login has email + hash; a Discord login has a Discord id and no password. CK: the hash must be argon2id/bcrypt format |
| auth_token | **token_id**, user_id → users, token_hash BINARY(32) UQ, created_at, expires_at, revoked_at?, user_agent?. CK: expires_at > created_at |
| role | **role_id**, role_name UQ, description |
| permission | **permission_id**, code UQ, description |
| role_permission | **role_id** → role, **permission_id** → permission |
| user_role | **user_id** → users, **role_id** → role, assigned_at, assigned_by? → users |
| user_language | **user_id** → users, **language_code** → language, proficiency, is_preferred |

### Game Catalog
| Table | Columns |
|---|---|
| game | **game_id**, name UQ, slug UQ, developer?, publisher?, cover_url?, release_year?, description?, is_active |
| genre / game_genre | **genre_id**, name UQ / **game_id** → game, **genre_id** → genre |
| platform | **platform_id**, name UQ, platform_type, identity_label |
| game_platform | **game_id** → game, **platform_id** → platform, crossplay_group? |
| game_mode | **mode_id**, game_id → game, name, min_team_size, max_team_size, is_ranked, description?. UQ(game_id, name), UQ(mode_id, game_id). CK: 1 ≤ min ≤ max |
| rank_tier | **rank_id**, game_id → game, name, ordinal. UQ(game_id, name), UQ(game_id, ordinal), UQ(rank_id, game_id) |
| game_role | **game_role_id**, game_id → game, name. UQ(game_id, name), UQ(game_role_id, game_id) |
| game_server | **game_id** → game, **region_id** → geo_region, server_name |

### Player Profile
| Table | Columns |
|---|---|
| tag / user_tag | **tag_id**, name UQ, category? / **user_id** → users, **tag_id** → tag |
| platform_account | **account_id**, user_id → users, platform_id → platform, handle, discriminator, is_verified, is_public. UQ(platform_id, handle, discriminator) |
| player_game_profile | **profile_id**, user_id → users, game_id → game, platform_account_id? → platform_account, (rank_id, game_id)? → rank_tier, in_game_name?, hours_played, is_main. UQ(user_id, game_id, platform_account_id), UQ(profile_id, game_id) |
| profile_mode | **profile_id**, **mode_id**, game_id, rank_id?, is_preferred. (profile_id, game_id) → player_game_profile, (mode_id, game_id) → game_mode, (rank_id, game_id) → rank_tier |
| profile_role | **profile_id**, **game_role_id**, game_id, preference_order. (profile_id, game_id) → player_game_profile, (game_role_id, game_id) → game_role |
| availability | **user_id** → users, **day_of_week**, **start_time**, end_time. CK: day 0–6, end > start |

### Sessions & Matching
| Table | Columns |
|---|---|
| lfg_session | **session_id**, host_id → users, game_id → game, (mode_id, game_id) → game_mode, platform_id → platform, team_id? → team, region_id? → geo_region, (min_rank_id / max_rank_id, game_id)? → rank_tier, title, description?, status {open, full, in_progress, completed, cancelled}, max_players, ~current_players, scheduled_start?, created_at, region_locked, voice_required, visibility, join_policy, min_avg_rating?, require_verified_discord, discord_channel_id?, discord_invite_url?. UQ(session_id, game_id). CK: 1 ≤ max_players, current ≤ max, rating 1–5 |
| session_language / session_tag | **session_id** → lfg_session, **language_code** → language / **tag_id** → tag |
| session_slot | **session_id**, **slot_no**, game_id, game_role_id, slots_needed. (session_id, game_id) → lfg_session, (game_role_id, game_id) → game_role |
| session_participant | **session_id** → lfg_session, **user_id** → users, game_role_id? → game_role, platform_account_id? → platform_account, status, joined_at, left_at? |
| match_recommendation | **rec_id**, user_id → users, session_id → lfg_session, score, score_breakdown JSON, source, shown_at, outcome |

### Social & Trust
| Table | Columns |
|---|---|
| team / team_member | **team_id**, name UQ, tag?, owner_id → users, game_id?, region_id?, description?, created_at / **team_id** → team, **user_id** → users, team_role, joined_at |
| friendship | **requester_id** → users, **addressee_id** → users, status, created_at. Stored generated columns pair_low/pair_high carry UQ, so A→B and B→A count once. CK: no self-friendship |
| message | **message_id**, sender_id → users, session_id? → lfg_session, receiver_id? → users, content, sent_at, edited_at?, is_deleted. CK: exactly one target; no DM to self |
| review | **session_id** → lfg_session, **reviewer_id** → users, **reviewed_id** → users, rating, comment_text?, created_at. CK: rating 1–5, reviewer ≠ reviewed |
| badge / user_badge | **badge_id**, name UQ, description?, criteria? / **user_id** → users, **badge_id** → badge, awarded_at, session_id? |

### Moderation & Audit
| Table | Columns |
|---|---|
| user_block | **blocker_id** → users, **blocked_id** → users, created_at, reason?. CK: blocker ≠ blocked |
| report | **report_id**, reporter_id → users, reported_user_id → users, session_id?, message_id?, category, description?, status, handled_by? → users, created_at, resolved_at?. CK: reporter ≠ reported |
| sanction | **sanction_id**, user_id → users, sanction_type {warn, mute, suspend, ban}, reason, issued_by → users, report_id? → report, starts_at, ends_at?. CK: ends after starts; no self-sanction |
| audit_log | **log_id**, actor_id?, entity, entity_id, action, old_value JSON?, new_value JSON?, logged_at |

## Secrets handling (nothing sensitive in plaintext)
| Secret | What the DB stores | Where the real value lives |
|---|---|---|
| Login/session token | `auth_token.token_hash` = HMAC-SHA256(token, server secret), 32 raw bytes. Lookup: hash the presented token, then match on `token_hash` | The random 256-bit token lives only in the user's HttpOnly, Secure cookie. The server secret lives in the app's `.env` |
| Password | `auth_account.password_hash` = argon2id (or bcrypt). A CHECK constraint rejects anything else | Nowhere |
| Discord OAuth tokens | Not stored. They're used once at login to read the Discord id/username | — |
| Discord id, gamertags, email | Stored as-is. They're identifiers, not secrets; gamertags stay hidden until a player is accepted into a session (`v_session_roster`) | — |

The audit triggers log only non-secret fields. The seed data uses fake argon2id placeholders and `RANDOM_BYTES(32)` token hashes.

## Referential actions
- **CASCADE:** pure child rows, such as auth rows, junction rows, profiles, slots and participants.
- **RESTRICT:** history and evidence, such as sessions, messages, reviews, reports, sanctions, friendships and blocks. Users are deactivated through `status`, never hard-deleted.
- **MySQL rule:** a column used in a CHECK cannot have a CASCADE or SET NULL action, so the tables with self-checks keep RESTRICT.

## Rules enforced by triggers and procedures (`database/02_routines.sql`)
| Rule | Mechanism |
|---|---|
| max_players ≤ mode team size; the host must be active and hold `session.create` | `trg_session_bi` / `trg_session_bu` |
| `current_players` = accepted participants; status flips open ↔ full | `trg_participant_ai/au/ad` → `sp_refresh_session` |
| No joining if suspended/banned, blocked by a member, or the session is full/closed; `auto` join policy accepts instantly | `trg_participant_bi` / `trg_participant_bu` |
| Reviews only after completion, and only between accepted players | `trg_review_bi` |
| Rating, review count, trust score; the "Great Teammate" badge | `trg_review_*` → `sp_refresh_user_stats` |
| Completion: +1 sessions_completed; the "Veteran" badge | `trg_session_au` |
| Chat only by accepted players; no DMs across a block; muted users can't post | `trg_message_bi` |
| Blocking removes the friendship; blocked users can't send friend requests | `trg_block_ai`, `trg_friendship_bi` |
| RBAC: only moderators handle reports or sanction, only admins ban, only admins assign roles | `trg_report_bu`, `trg_sanction_bi`, `trg_user_role_bi` (via `fn_has_permission`) |
| A sanction flips `users.status`; everything sensitive is audited | `trg_sanction_ai`, `trg_users_au`, `trg_*_ai` |
| Accepting a join can't overbook | `sp_accept_participant` (transaction + `SELECT … FOR UPDATE`) |
| Recommendations: hard filters ANDed, then a weighted score | `sp_recommend_sessions(user, limit, log)`, `sp_recommend_players(session, limit)` |

**Note on MySQL 9.x:** the recommendation queries carry `SET_VAR(optimizer_switch='semijoin=off')`. With semijoin on, MySQL 9.7.1 wrongly drops valid rows when EXISTS and NOT EXISTS filters are combined with LATERAL derived tables. This was reproduced and verified during setup.

## Files and loading
| File | Contents |
|---|---|
| `database/01_schema.sql` | Database, 44 tables, keys, checks, indexes. **Drops and recreates `pairadice`** |
| `database/02_routines.sql` | 6 functions, 6 procedures, 23 triggers, 3 views |
| `database/03_seed.sql` | 12 users, 3 games, 10 sessions in every status, chat, reviews, reports, sanctions, recommendations |
| `database/04_rbac.sql` | MySQL roles `pairadice_player`, `pairadice_moderator`, `pairadice_admin` |
| `database/05_sample_queries.sql` | 17 queries: joins, nested, correlated, recursive CTEs, window, procedures |
| `database/06_constraint_tests.sql` | 26 must-fail statements (rolled back): all PASS |
| `database/setup.sh` | One-command setup: checks, confirm-before-drop, load, tests, summary |

### One-command setup
`database/setup.sh` loads everything in order. It runs from bash or zsh:
- It asks for the MySQL password once, hidden, or reads `$MYSQL_PWD`.
- It checks the server is up and the version is ≥ 8.0.16.
- It asks before dropping an existing `pairadice` database.
- It loads 01→04, optionally runs the tests, and prints a summary.

```bash
./database/setup.sh
```

Also run the 26 constraint tests and print the sample queries:

```bash
./database/setup.sh --tests --samples
```

Other options:
- `-u` / `-h` / `-P`: connect as another user, host or port.
- `--no-seed`: schema only, no sample data.
- `--no-rbac`: skip the MySQL roles.
- `--app-user NAME`: create a login with the `pairadice_player` role.
- `--start-server`: start a local MySQL server if it isn't running.
- `-y`: don't ask before dropping.
- `--help`: list all options.

Manual equivalent:

```bash
cat database/0[1-4]*.sql | mysql -u root -p
```

```bash
mysql -u root -p --table < database/05_sample_queries.sql
```

```bash
mysql -u root -p --table < database/06_constraint_tests.sql
```

Optional: for exact DST handling, load the timezone tables (`mysql_tzinfo_to_sql /usr/share/zoneinfo | mysql -u root -p mysql`). Without them, `fn_local_time` falls back to fixed offsets.
