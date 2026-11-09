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
GRANT SELECT, INSERT ON pairadice.session_language TO 'pairadice_player';
GRANT SELECT, INSERT ON pairadice.session_tag      TO 'pairadice_player';
GRANT SELECT, INSERT ON pairadice.session_slot     TO 'pairadice_player';
GRANT SELECT, INSERT ON pairadice.message          TO 'pairadice_player';
GRANT SELECT, INSERT ON pairadice.review           TO 'pairadice_player';
GRANT INSERT         ON pairadice.report           TO 'pairadice_player';
GRANT SELECT, INSERT, DELETE ON pairadice.user_block TO 'pairadice_player';
GRANT SELECT, INSERT, UPDATE ON pairadice.friendship TO 'pairadice_player';
GRANT EXECUTE ON PROCEDURE pairadice.sp_recommend_sessions TO 'pairadice_player';
GRANT EXECUTE ON PROCEDURE pairadice.sp_recommend_players  TO 'pairadice_player';
GRANT EXECUTE ON PROCEDURE pairadice.sp_accept_participant TO 'pairadice_player';
GRANT EXECUTE ON PROCEDURE pairadice.sp_create_session TO 'pairadice_player';
GRANT EXECUTE ON PROCEDURE pairadice.sp_request_join TO 'pairadice_player';
GRANT EXECUTE ON PROCEDURE pairadice.sp_withdraw_or_leave TO 'pairadice_player';
GRANT EXECUTE ON PROCEDURE pairadice.sp_decline_participant TO 'pairadice_player';
GRANT EXECUTE ON PROCEDURE pairadice.sp_kick_participant TO 'pairadice_player';
GRANT EXECUTE ON PROCEDURE pairadice.sp_set_session_status TO 'pairadice_player';
GRANT EXECUTE ON PROCEDURE pairadice.sp_my_platform_accounts TO 'pairadice_player';
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

-- ---------------------------------------------------------------- admin = everything in this schema
GRANT ALL PRIVILEGES ON pairadice.* TO 'pairadice_admin';

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

-- ---------------------------------------------------------------- web read-only (Phase 1 web app)
-- The Next.js app must NOT connect as root. This role can only read public data and call the
-- recommendation procedure; there is no INSERT/UPDATE/DELETE anywhere and no access at all to
-- auth_account, auth_token, platform_account, sanction, report, audit_log, embedding_outbox or
-- match_recommendation. users is limited to non-sensitive columns (no bio, country, home region,
-- strictness, counters, email...).
GRANT SELECT (user_id, username, display_name, status, timezone, last_active_at, trust_score, avg_rating)
  ON pairadice.users TO 'pairadice_web_ro';
GRANT SELECT ON pairadice.game                TO 'pairadice_web_ro';
GRANT SELECT ON pairadice.platform            TO 'pairadice_web_ro';   -- catalogue: names and identity labels only
GRANT SELECT ON pairadice.game_platform       TO 'pairadice_web_ro';
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
GRANT SELECT ON pairadice.friendship          TO 'pairadice_web_ro';
GRANT SELECT ON pairadice.message             TO 'pairadice_web_ro';
GRANT SELECT ON pairadice.user_block          TO 'pairadice_web_ro';
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

-- ---------------------------------------------------------------- auth (sign-up / sign-in / sign-out)
-- The only role that touches login secrets. Sign-up goes through sp_register_user (08_auth.sql), so this
-- role has no INSERT on users or user_role and cannot grant itself moderator or admin. It reads only what
-- a session lookup needs: no bios, sessions, messages or audit rows.
GRANT EXECUTE ON PROCEDURE pairadice.sp_register_user TO 'pairadice_auth';
GRANT SELECT ON pairadice.auth_account TO 'pairadice_auth';
GRANT SELECT, INSERT ON pairadice.auth_token TO 'pairadice_auth';
GRANT UPDATE (revoked_at) ON pairadice.auth_token TO 'pairadice_auth';
GRANT SELECT (user_id, username, display_name, status) ON pairadice.users TO 'pairadice_auth';
GRANT SELECT ON pairadice.user_role TO 'pairadice_auth';
GRANT SELECT ON pairadice.role      TO 'pairadice_auth';

-- Example login accounts (choose your own passwords; never commit them):
--   CREATE USER 'pd_api'@'localhost' IDENTIFIED BY '<password>';
--   GRANT 'pairadice_player' TO 'pd_api'@'localhost';
--   SET DEFAULT ROLE 'pairadice_player' TO 'pd_api'@'localhost';
-- or, for the read-only web app:  ./database/setup.sh --web-user pd_web
-- To inspect a role (needs SELECT on the mysql schema):
--   SHOW GRANTS FOR 'pairadice_moderator' USING 'pairadice_player';
