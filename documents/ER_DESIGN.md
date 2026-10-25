# PairADice ER Design (v1)

Diagram: [`pairadice_erd.drawio`](pairadice_erd.drawio) (Chen notation, 9 pages). Regenerate with `python3 documents/tools/gen_erd.py`.
Engine: **MySQL 8.x** (relational core) + **MongoDB** (embeddings, outside the SQL database).

| Page | Covers |
|---|---|
| 0 Big Picture | all entities by area, main links |
| 1 Identity & Access | users, Discord/email login, tokens, roles + permissions (RBAC) |
| 2 Language & Region | spoken languages, countries, region tree, game servers |
| 3 Game Catalog | games, genres, platforms, modes, rank tiers, in-game roles |
| 4 Player Profile | gamertags per platform, per-game profile, tags, weekly availability |
| 5 Sessions & Matching | LFG sessions, role slots, participants, recommendation log |
| 6 Social & Trust | friends, chat, reviews, badges, teams |
| 7 Moderation & Audit | blocks, reports, sanctions, audit log |
| 8 Vector Store | MongoDB embeddings, linked by id only |

## Chen → relational mapping rules
- Strong entity → table, key attribute → PK.
- Weak entity → table, PK = owner PK + partial key (`AVAILABILITY`, `SESSION_SLOT`, `SESSION_PARTICIPANT`, `REVIEW`).
- 1:N relationship → FK on the N side (listed below; the diagram shows these as relationships, not attributes).
- M:N relationship → junction table, relationship attributes become columns.
- Recursive relationship → self FK or junction with two FKs to the same table.
- Derived attribute (`~`, dashed) → computed by trigger/view, or stored and trigger-maintained.
- Enumerations → `ENUM` or lookup table + CHECK.

## Foreign keys (from 1:N relationships)
| Table | FK column → target |
|---|---|
| USER | country_code → COUNTRY, home_region_id → GEO_REGION |
| AUTH_ACCOUNT, AUTH_TOKEN | user_id → USER |
| GEO_REGION | parent_region_id → GEO_REGION |
| COUNTRY | region_id → GEO_REGION |
| GAME_MODE, RANK_TIER, GAME_ROLE | game_id → GAME |
| PLATFORM_ACCOUNT | user_id → USER, platform_id → PLATFORM |
| PLAYER_GAME_PROFILE | user_id → USER, game_id → GAME, platform_account_id → PLATFORM_ACCOUNT, rank_id → RANK_TIER |
| AVAILABILITY | user_id → USER (part of PK) |
| LFG_SESSION | host_id → USER, game_id → GAME, mode_id → GAME_MODE, platform_id → PLATFORM, region_id → GEO_REGION, team_id → TEAM (null), min_rank_id / max_rank_id → RANK_TIER (null) |
| SESSION_SLOT | session_id → LFG_SESSION (PK), game_role_id → GAME_ROLE |
| SESSION_PARTICIPANT | session_id → LFG_SESSION, user_id → USER (PK), game_role_id → GAME_ROLE, platform_account_id → PLATFORM_ACCOUNT |
| MATCH_RECOMMENDATION | user_id → USER, session_id → LFG_SESSION |
| MESSAGE | sender_id → USER, session_id → LFG_SESSION (null), receiver_id → USER (null) |
| REVIEW | session_id → LFG_SESSION, reviewer_id → USER, reviewed_id → USER (PK = all three) |
| TEAM | owner_id → USER, game_id → GAME (null), region_id → GEO_REGION |
| REPORT | reporter_id, reported_user_id, handled_by (null) → USER; session_id, message_id (null) |
| SANCTION | user_id, issued_by → USER, report_id → REPORT (null) |
| AUDIT_LOG | actor_id → USER |

## Junction tables (from M:N relationships)
`USER_ROLE`(assigned_at, assigned_by) · `ROLE_PERMISSION` · `USER_LANGUAGE`(proficiency, is_preferred) · `GAME_SERVER`(server_name; GAME×GEO_REGION) · `GAME_GENRE` · `GAME_PLATFORM`(crossplay_group) · `PROFILE_MODE`(is_preferred, rank_id) · `PROFILE_ROLE`(preference_order) · `USER_TAG` · `SESSION_TAG` · `SESSION_LANGUAGE` · `FRIENDSHIP`(status, created_at) · `USER_BLOCK`(created_at) · `USER_BADGE`(awarded_at) · `TEAM_MEMBER`(team_role, joined_at).

## Constraints that need CHECK / UNIQUE / trigger (MySQL 8.0.16+ for CHECK)
- `AUTH_ACCOUNT`: UNIQUE(provider, provider_user_id), UNIQUE(email); `password_hash` required when provider = email.
- `PLATFORM_ACCOUNT`: UNIQUE(platform_id, handle, discriminator).
- `GAME_MODE`: UNIQUE(game_id, name), CHECK(min_team_size ≤ max_team_size).
- `LFG_SESSION`: CHECK(max_players ≤ mode.max_team_size) and mode ∈ game (trigger); `current_players` maintained by trigger; status flips to `full`/`open` by trigger.
- `SESSION_PARTICIPANT`: join rejected by trigger if user is blocked by/against anyone already inside, or user is suspended/banned.
- `MESSAGE`: CHECK exactly one of session_id / receiver_id is non-null.
- `FRIENDSHIP` / `USER_BLOCK`: CHECK(a ≠ b); unordered-pair uniqueness via stored generated columns `LEAST(a,b)`, `GREATEST(a,b)` + UNIQUE.
- `REVIEW`: CHECK(reviewer ≠ reviewed); both must be accepted participants of the session (trigger); trigger refreshes `USER.avg_rating`, `review_count`, may award badges.
- `SANCTION`: trigger updates `USER.status`; every sensitive change writes `AUDIT_LOG` (old/new as JSON).

## Matching
1. **Hard filters (AND)**: open + free slot, role slot, game/platform, shared language, region if strict, host-set rank/rating bounds, no block, not suspended/banned, visibility.
2. **Soft score**: weighted sum of rank closeness, availability overlap, tags, rating, social ties, region closeness, embedding similarity → ranked list.
3. Results logged in `MATCH_RECOMMENDATION` (score breakdown + outcome) so weights can be tuned.
4. Join → host approves in a transaction (`SELECT … FOR UPDATE` on the session) → gamertags revealed → Discord channel/invite stored on the session.

## Rubric hooks
- Recursive queries/CTE: `GEO_REGION` tree, friend-of-friend via `FRIENDSHIP`.
- Triggers: slot counts, rating refresh, badge award, sanction → status, audit log.
- Procedures/functions: `sp_recommend_sessions`, `sp_recommend_players`, `sp_accept_participant`.
- RBAC in DB: `ROLE` / `PERMISSION` / `USER_ROLE` (player, moderator, admin) + MySQL grants/views per role.
- NoSQL/vector: MongoDB `player_embeddings`, `session_embeddings` (create, read similar, update on profile edit, delete on account removal).

## Deliberately deferred (add later as new tables, no changes to existing ones)
Notifications, Discord guild/channel entities beyond `discord_channel_id`/`discord_invite_url`, appeals, auto-moderation, ID/age verification.
