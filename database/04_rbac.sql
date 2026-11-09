SET NAMES utf8mb4;
-- PairADice database-level RBAC (MySQL roles). Run after 02_routines.sql.
-- Mirrors the in-app role / permission tables: player < moderator < admin.
-- Roles are server-wide objects, so they are dropped and recreated for a clean re-run.

DROP ROLE IF EXISTS 'pairadice_player', 'pairadice_moderator', 'pairadice_admin', 'pairadice_vec_worker', 'pairadice_web_ro', 'pairadice_auth';
CREATE ROLE 'pairadice_player', 'pairadice_moderator', 'pairadice_admin', 'pairadice_vec_worker', 'pairadice_web_ro', 'pairadice_auth';

-- ---------------------------------------------------------------- player
-- read the catalogue and public views (views run as DEFINER, so no base-table access is needed)
GRANT SELECT ON pairadice.game           TO 'pairadice_player';
GRANT SELECT ON pairadice.game_mode      TO 'pairadice_player';
GRANT SELECT ON pairadice.rank_tier      TO 'pairadice_player';
GRANT SELECT ON pairadice.game_role      TO 'pairadice_player';
GRANT SELECT ON pairadice.platform       TO 'pairadice_player';
GRANT SELECT ON pairadice.language       TO 'pairadice_player';
GRANT SELECT ON pairadice.geo_region     TO 'pairadice_player';
GRANT SELECT ON pairadice.country        TO 'pairadice_player';
GRANT SELECT ON pairadice.tag            TO 'pairadice_player';
GRANT SELECT ON pairadice.badge          TO 'pairadice_player';
GRANT SELECT ON pairadice.v_open_sessions  TO 'pairadice_player';
GRANT SELECT ON pairadice.v_player_card    TO 'pairadice_player';
GRANT SELECT ON pairadice.v_session_roster TO 'pairadice_player';
-- write the things a player does (triggers still enforce the business rules)
GRANT SELECT, INSERT, UPDATE ON pairadice.lfg_session         TO 'pairadice_player';
GRANT SELECT, INSERT, UPDATE ON pairadice.session_participant TO 'pairadice_player';
GRANT SELECT, INSERT, DELETE         ON pairadice.session_language TO 'pairadice_player';   -- DELETE: hosts edit their session
GRANT SELECT, INSERT, DELETE         ON pairadice.session_tag      TO 'pairadice_player';
GRANT SELECT, INSERT, UPDATE, DELETE ON pairadice.session_slot     TO 'pairadice_player';
GRANT SELECT, INSERT ON pairadice.message          TO 'pairadice_player';
GRANT SELECT, INSERT ON pairadice.review           TO 'pairadice_player';
GRANT INSERT         ON pairadice.report           TO 'pairadice_player';
GRANT SELECT, INSERT, DELETE ON pairadice.user_block TO 'pairadice_player';
GRANT SELECT, INSERT, UPDATE ON pairadice.friendship TO 'pairadice_player';
GRANT EXECUTE ON PROCEDURE pairadice.sp_recommend_sessions TO 'pairadice_player';
GRANT EXECUTE ON PROCEDURE pairadice.sp_recommend_players  TO 'pairadice_player';
GRANT EXECUTE ON PROCEDURE pairadice.sp_accept_participant TO 'pairadice_player';
-- profile editing (Phase 3). users: only the editable columns; never status, avg_rating, review_count,
-- sessions_completed, trust_score (derived / moderator-controlled), never created_at.
GRANT SELECT (user_id, username, display_name, avatar_url, bio, status, timezone, region_strictness, country_code,
              home_region_id, created_at, last_active_at, avg_rating, review_count, sessions_completed, trust_score)
  ON pairadice.users TO 'pairadice_player';
GRANT UPDATE (display_name, avatar_url, bio, timezone, region_strictness, country_code, home_region_id, last_active_at)
  ON pairadice.users TO 'pairadice_player';
GRANT SELECT, INSERT, DELETE         ON pairadice.user_tag            TO 'pairadice_player';
GRANT SELECT, INSERT, UPDATE, DELETE ON pairadice.user_language       TO 'pairadice_player';
GRANT SELECT, INSERT, UPDATE, DELETE ON pairadice.player_game_profile TO 'pairadice_player';
GRANT SELECT, INSERT, UPDATE, DELETE ON pairadice.profile_mode        TO 'pairadice_player';
GRANT SELECT, INSERT, UPDATE, DELETE ON pairadice.profile_role        TO 'pairadice_player';
GRANT SELECT, INSERT, UPDATE, DELETE ON pairadice.platform_account    TO 'pairadice_player';
GRANT SELECT, INSERT, UPDATE, DELETE ON pairadice.availability        TO 'pairadice_player';
GRANT SELECT ON pairadice.user_badge    TO 'pairadice_player';
GRANT SELECT ON pairadice.game_platform TO 'pairadice_player';
GRANT SELECT ON pairadice.game_server   TO 'pairadice_player';
-- teams: create / edit a team, manage membership (no team DELETE)
GRANT SELECT, INSERT, UPDATE         ON pairadice.team        TO 'pairadice_player';
GRANT SELECT, INSERT, UPDATE, DELETE ON pairadice.team_member TO 'pairadice_player';
-- Signed-in web reads (queries.ts / queries-camp.ts / sql-parts.ts) all run as this role (moderators / admins via
-- their roles). Tables read: users (cols above), lfg_session, session_*, game, game_mode, game_role, rank_tier,
-- geo_region, tag, language, platform, badge, user_badge, user_language, player_game_profile, friendship,
-- message, user_block, v_open_sessions, v_player_card, v_session_roster: all granted above.
-- helper functions the app may call directly (read-only lookups)
GRANT EXECUTE ON FUNCTION pairadice.fn_is_blocked     TO 'pairadice_player';
GRANT EXECUTE ON FUNCTION pairadice.fn_are_friends    TO 'pairadice_player';
GRANT EXECUTE ON FUNCTION pairadice.fn_has_permission TO 'pairadice_player';
GRANT EXECUTE ON FUNCTION pairadice.fn_local_time     TO 'pairadice_player';
-- hybrid (SQL + vector) recommendations are logged by the API, and outcomes updated as the player acts
GRANT SELECT, INSERT, UPDATE (outcome) ON pairadice.match_recommendation TO 'pairadice_player';

-- ---------------------------------------------------------------- moderator = player + moderation
GRANT 'pairadice_player' TO 'pairadice_moderator';
GRANT SELECT, UPDATE ON pairadice.report    TO 'pairadice_moderator';
GRANT SELECT, INSERT ON pairadice.sanction  TO 'pairadice_moderator';
GRANT SELECT         ON pairadice.audit_log TO 'pairadice_moderator';
GRANT SELECT         ON pairadice.users     TO 'pairadice_moderator';
GRANT UPDATE (is_deleted) ON pairadice.message TO 'pairadice_moderator';
GRANT EXECUTE ON PROCEDURE pairadice.sp_expire_sanctions TO 'pairadice_moderator';

-- ---------------------------------------------------------------- admin = full data access in this schema (no DDL)
-- DML + routines only: no CREATE / ALTER / DROP / INDEX / TRIGGER / REFERENCES / GRANT OPTION. DDL belongs to the
-- root / migration login used by setup.sh, so a compromised admin login cannot change the schema or its triggers.
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON pairadice.* TO 'pairadice_admin';

-- ---------------------------------------------------------------- vector worker = read embedding sources, drain the outbox
-- Used by vector/scripts/worker.js and backfill.js. No auth tables: the worker never sees secrets.
GRANT SELECT ON pairadice.users               TO 'pairadice_vec_worker';
GRANT SELECT ON pairadice.user_tag            TO 'pairadice_vec_worker';
GRANT SELECT ON pairadice.user_language       TO 'pairadice_vec_worker';
GRANT SELECT ON pairadice.player_game_profile TO 'pairadice_vec_worker';
GRANT SELECT ON pairadice.platform_account    TO 'pairadice_vec_worker';
GRANT SELECT ON pairadice.profile_mode        TO 'pairadice_vec_worker';
GRANT SELECT ON pairadice.profile_role        TO 'pairadice_vec_worker';
GRANT SELECT ON pairadice.lfg_session         TO 'pairadice_vec_worker';
GRANT SELECT ON pairadice.session_tag         TO 'pairadice_vec_worker';
GRANT SELECT ON pairadice.session_language    TO 'pairadice_vec_worker';
GRANT SELECT ON pairadice.session_slot        TO 'pairadice_vec_worker';
GRANT SELECT ON pairadice.tag                 TO 'pairadice_vec_worker';
GRANT SELECT ON pairadice.game                TO 'pairadice_vec_worker';
GRANT SELECT ON pairadice.game_mode           TO 'pairadice_vec_worker';
GRANT SELECT ON pairadice.game_role           TO 'pairadice_vec_worker';
GRANT SELECT ON pairadice.platform            TO 'pairadice_vec_worker';
GRANT SELECT, UPDATE, DELETE ON pairadice.embedding_outbox TO 'pairadice_vec_worker';
-- dead letters (attempts >= 5). The view comes from 07_vector_outbox.sql (setup.sh loads 07 before this file);
-- skipped when it does not exist (--no-vector). Re-running 07 alone drops the view and this grant: re-run 04 after it.
SET @pd_grant = IF(EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema = 'pairadice' AND table_name = 'v_outbox_dead'),
                   'GRANT SELECT ON pairadice.v_outbox_dead TO ''pairadice_vec_worker''', 'DO 0');
PREPARE pd_grant_stmt FROM @pd_grant;
EXECUTE pd_grant_stmt;
DEALLOCATE PREPARE pd_grant_stmt;

-- ---------------------------------------------------------------- web read-only (Phase 1 web app)
-- The Next.js app must NOT connect as root. This role is for ANONYMOUS visitors: public data and the
-- recommendation procedure only; it has no access to message, friendship or user_block (chat, DMs, friend
-- lists and blocks are signed-in data, read as pairadice_player); there is no INSERT/UPDATE/DELETE anywhere and no access at all to
-- auth_account, auth_token, platform_account, sanction, report, audit_log, embedding_outbox or
-- match_recommendation. users is limited to non-sensitive columns (no bio, country, home region,
-- strictness, counters, email...).
GRANT SELECT (user_id, username, display_name, status, timezone, last_active_at, trust_score, avg_rating)
  ON pairadice.users TO 'pairadice_web_ro';
GRANT SELECT ON pairadice.game                TO 'pairadice_web_ro';
GRANT SELECT ON pairadice.game_mode           TO 'pairadice_web_ro';
GRANT SELECT ON pairadice.rank_tier           TO 'pairadice_web_ro';
GRANT SELECT ON pairadice.game_role           TO 'pairadice_web_ro';
GRANT SELECT ON pairadice.geo_region          TO 'pairadice_web_ro';
GRANT SELECT ON pairadice.tag                 TO 'pairadice_web_ro';
GRANT SELECT ON pairadice.language            TO 'pairadice_web_ro';
GRANT SELECT ON pairadice.lfg_session         TO 'pairadice_web_ro';
GRANT SELECT ON pairadice.session_slot        TO 'pairadice_web_ro';
GRANT SELECT ON pairadice.session_language    TO 'pairadice_web_ro';
GRANT SELECT ON pairadice.session_tag         TO 'pairadice_web_ro';
GRANT SELECT ON pairadice.player_game_profile TO 'pairadice_web_ro';
GRANT SELECT ON pairadice.user_badge          TO 'pairadice_web_ro';
GRANT SELECT ON pairadice.badge               TO 'pairadice_web_ro';
GRANT SELECT ON pairadice.user_language       TO 'pairadice_web_ro';
-- Views and sp_recommend_sessions are DEFINER objects (SQL SECURITY DEFINER is the default and 02_routines.sql
-- does not override it), so they run with the loader's privileges: the narrow column grant on users does not
-- break the views, and the procedure's temporary table (tmp_session_rec) needs no privilege from this role.
-- Consequence: the procedure could write match_recommendation as DEFINER if called with p_log = TRUE,
-- so the web app MUST call it with p_log = FALSE: CALL sp_recommend_sessions(?, ?, FALSE).
GRANT SELECT ON pairadice.v_open_sessions  TO 'pairadice_web_ro';
GRANT SELECT ON pairadice.v_session_roster TO 'pairadice_web_ro';
GRANT SELECT ON pairadice.v_player_card    TO 'pairadice_web_ro';
GRANT EXECUTE ON PROCEDURE pairadice.sp_recommend_sessions TO 'pairadice_web_ro';

-- ---------------------------------------------------------------- auth = sign-up / login / session check ONLY
-- Used by the web app's auth code path and nothing else. No DELETE anywhere, and no access to sanction,
-- report, audit_log, message or any gameplay table. Triggers on these tables write audit_log as DEFINER.
-- user_role is read-only for this role: sign-up assigns the 'player' role through sp_register_player (DEFINER),
-- so a compromised auth login cannot grant itself moderator / admin.
GRANT SELECT ON pairadice.auth_account TO 'pairadice_auth';
GRANT INSERT (user_id, provider, provider_user_id, email, password_hash, email_verified)
  ON pairadice.auth_account TO 'pairadice_auth';
GRANT UPDATE (email_verified) ON pairadice.auth_account TO 'pairadice_auth';
GRANT SELECT (user_id, username, display_name, status) ON pairadice.users TO 'pairadice_auth';
GRANT INSERT (username, display_name, avatar_url, timezone, country_code) ON pairadice.users TO 'pairadice_auth';
GRANT UPDATE (last_active_at) ON pairadice.users TO 'pairadice_auth';
GRANT SELECT ON pairadice.user_role               TO 'pairadice_auth';
GRANT EXECUTE ON PROCEDURE pairadice.sp_register_player TO 'pairadice_auth';   -- the ONLY way sign-up assigns a role
GRANT SELECT ON pairadice.role                    TO 'pairadice_auth';
GRANT SELECT ON pairadice.role_permission         TO 'pairadice_auth';
GRANT SELECT ON pairadice.permission              TO 'pairadice_auth';
GRANT SELECT, INSERT ON pairadice.auth_token      TO 'pairadice_auth';
GRANT UPDATE (revoked_at) ON pairadice.auth_token TO 'pairadice_auth';

-- Example login accounts (choose your own passwords; never commit them):
--   CREATE USER 'pd_api'@'localhost' IDENTIFIED BY '<password>';
--   GRANT 'pairadice_player' TO 'pd_api'@'localhost';
--   SET DEFAULT ROLE 'pairadice_player' TO 'pd_api'@'localhost';
-- or use ./database/setup.sh --web-user pd_web --app-user pd_api --mod-user pd_mod --admin-user pd_admin --auth-user pd_auth

SHOW GRANTS FOR 'pairadice_moderator' USING 'pairadice_player';
