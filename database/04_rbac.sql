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
-- Signed-in reads run as this login, so it reads what the pages need: sessions and their slots / languages / tags,
-- participants, chat, friendships and blocks (the queries filter them to the signed-in viewer), profile data and
-- the safe column subset of users (no email, bio, country, home region, strictness or counters).
GRANT SELECT ON pairadice.lfg_session          TO 'pairadice_player';
GRANT SELECT ON pairadice.session_participant  TO 'pairadice_player';
GRANT SELECT ON pairadice.session_slot         TO 'pairadice_player';
GRANT SELECT ON pairadice.session_language     TO 'pairadice_player';
GRANT SELECT ON pairadice.session_tag          TO 'pairadice_player';
GRANT SELECT ON pairadice.game_platform        TO 'pairadice_player';
-- column-level: in_game_name is deliberately NOT granted (a gamertag may be private; members see it only through DEFINER views)
GRANT SELECT (profile_id, user_id, game_id, platform_account_id, rank_id, hours_played, is_main)
  ON pairadice.player_game_profile TO 'pairadice_player';
GRANT SELECT ON pairadice.user_badge           TO 'pairadice_player';
GRANT SELECT ON pairadice.user_language        TO 'pairadice_player';
GRANT SELECT ON pairadice.user_tag             TO 'pairadice_player';
GRANT SELECT ON pairadice.profile_mode         TO 'pairadice_player';
GRANT SELECT ON pairadice.profile_role         TO 'pairadice_player';
GRANT SELECT ON pairadice.availability         TO 'pairadice_player';
-- (no direct SELECT on message: sp_chat_history, sp_dm_thread and sp_dm_inbox replaced it, so a player reads only their own conversations)
GRANT SELECT ON pairadice.friendship           TO 'pairadice_player';
GRANT SELECT ON pairadice.user_block           TO 'pairadice_player';
GRANT SELECT (user_id, username, display_name, status, timezone, last_active_at, trust_score, avg_rating)
  ON pairadice.users TO 'pairadice_player';
-- Writes go through DEFINER procedures; the shared login cannot bypass them. Sessions, participants, friendships
-- and blocks have NO direct INSERT / UPDATE / DELETE here (sp_create_session, sp_request_join, sp_accept_participant,
-- sp_send_friend_request, sp_block_user ... check who is acting, so a forged statement cannot skip a rule).
-- The same holds for profile tables (users, user_language, user_tag, platform_account, player_game_profile,
-- profile_mode, profile_role, availability): only the sp_*profile* / sp_set_* procedures of 11_profiles.sql write them.
-- Chat, DMs and reviews are procedures too (13_chat.sql). Reports go through sp_report_user.
-- (no direct INSERT on message: sp_send_session_message and sp_send_dm replaced it, so a forged sender_id is impossible)
-- (no direct INSERT on review: sp_write_review replaced it; reading reviews stays direct)
GRANT SELECT ON pairadice.review  TO 'pairadice_player';
GRANT EXECUTE ON PROCEDURE pairadice.sp_send_session_message TO 'pairadice_player';
GRANT EXECUTE ON PROCEDURE pairadice.sp_send_dm TO 'pairadice_player';
GRANT EXECUTE ON PROCEDURE pairadice.sp_delete_own_message TO 'pairadice_player';
GRANT EXECUTE ON PROCEDURE pairadice.sp_write_review TO 'pairadice_player';
GRANT EXECUTE ON PROCEDURE pairadice.sp_chat_history TO 'pairadice_player';
GRANT EXECUTE ON PROCEDURE pairadice.sp_dm_thread TO 'pairadice_player';
GRANT EXECUTE ON PROCEDURE pairadice.sp_dm_inbox TO 'pairadice_player';
GRANT EXECUTE ON PROCEDURE pairadice.sp_dm_can_message TO 'pairadice_player';
GRANT EXECUTE ON PROCEDURE pairadice.sp_my_chat_status TO 'pairadice_player';
GRANT EXECUTE ON PROCEDURE pairadice.sp_pending_reviews TO 'pairadice_player';
-- (no direct INSERT on report: sp_report_user replaced it, so a forged statement cannot file a report as someone else)
GRANT EXECUTE ON PROCEDURE pairadice.sp_report_user TO 'pairadice_player';
GRANT EXECUTE ON PROCEDURE pairadice.sp_my_reports TO 'pairadice_player';
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
GRANT EXECUTE ON PROCEDURE pairadice.sp_send_friend_request TO 'pairadice_player';
GRANT EXECUTE ON PROCEDURE pairadice.sp_respond_friend_request TO 'pairadice_player';
GRANT EXECUTE ON PROCEDURE pairadice.sp_cancel_friend_request TO 'pairadice_player';
GRANT EXECUTE ON PROCEDURE pairadice.sp_remove_friend TO 'pairadice_player';
GRANT EXECUTE ON PROCEDURE pairadice.sp_block_user TO 'pairadice_player';
GRANT EXECUTE ON PROCEDURE pairadice.sp_unblock_user TO 'pairadice_player';
GRANT EXECUTE ON PROCEDURE pairadice.sp_friend_overview TO 'pairadice_player';
GRANT EXECUTE ON PROCEDURE pairadice.sp_my_profile TO 'pairadice_player';
GRANT EXECUTE ON PROCEDURE pairadice.sp_update_profile TO 'pairadice_player';
GRANT EXECUTE ON PROCEDURE pairadice.sp_set_user_languages TO 'pairadice_player';
GRANT EXECUTE ON PROCEDURE pairadice.sp_set_user_tags TO 'pairadice_player';
GRANT EXECUTE ON PROCEDURE pairadice.sp_upsert_platform_account TO 'pairadice_player';
GRANT EXECUTE ON PROCEDURE pairadice.sp_remove_platform_account TO 'pairadice_player';
GRANT EXECUTE ON PROCEDURE pairadice.sp_upsert_game_profile TO 'pairadice_player';
GRANT EXECUTE ON PROCEDURE pairadice.sp_remove_game_profile TO 'pairadice_player';
GRANT EXECUTE ON PROCEDURE pairadice.sp_set_availability TO 'pairadice_player';
-- hybrid (SQL + vector) recommendations are logged by the API (web/src/lib/recommend.ts), and outcomes updated as the player acts
GRANT SELECT, INSERT, UPDATE (outcome) ON pairadice.match_recommendation TO 'pairadice_player';

-- ---------------------------------------------------------------- moderator = player + moderation
GRANT 'pairadice_player' TO 'pairadice_moderator';
-- Moderators read reports and sanctions directly, but every write is a procedure of 12_moderation.sql: no direct
-- UPDATE on report, INSERT on sanction or UPDATE (is_deleted) on message (sp_claim_report, sp_resolve_report,
-- sp_issue_sanction, sp_lift_sanction and sp_moderate_message replaced them and write the audit rows).
GRANT SELECT         ON pairadice.report    TO 'pairadice_moderator';
GRANT SELECT         ON pairadice.sanction  TO 'pairadice_moderator';
GRANT SELECT         ON pairadice.audit_log TO 'pairadice_moderator';
GRANT SELECT         ON pairadice.message   TO 'pairadice_moderator';   -- evidence for reports; no longer inherited from player
GRANT SELECT         ON pairadice.users     TO 'pairadice_moderator';
GRANT EXECUTE ON PROCEDURE pairadice.sp_expire_sanctions TO 'pairadice_moderator';
GRANT EXECUTE ON PROCEDURE pairadice.sp_claim_report TO 'pairadice_moderator';
GRANT EXECUTE ON PROCEDURE pairadice.sp_resolve_report TO 'pairadice_moderator';
GRANT EXECUTE ON PROCEDURE pairadice.sp_issue_sanction TO 'pairadice_moderator';
GRANT EXECUTE ON PROCEDURE pairadice.sp_lift_sanction TO 'pairadice_moderator';
GRANT EXECUTE ON PROCEDURE pairadice.sp_moderate_message TO 'pairadice_moderator';
GRANT EXECUTE ON FUNCTION  pairadice.fn_staff_rank TO 'pairadice_moderator';
-- sp_grant_role / sp_revoke_role are not granted here: only the admin role (EXECUTE on pairadice.*) can run them.

-- ---------------------------------------------------------------- admin = all data and routines in this schema, no DDL
-- No CREATE / ALTER / DROP / TRIGGER / INDEX / GRANT OPTION: schema changes belong to the root / migration login
-- (setup.sh, 01_schema.sql ...), never to a login the web app holds.
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

-- ---------------------------------------------------------------- web read-only (anonymous visitors)
-- Anonymous reads only: the Next.js app must NOT connect as root, and signed-in reads use the player / moderator /
-- admin logins. This role can only read public data. There is no INSERT/UPDATE/DELETE anywhere, no EXECUTE on any
-- routine (sp_recommend_sessions with p_log = TRUE would let a "read-only" login write match_recommendation as
-- DEFINER, so anonymous visitors get no recommendations), and no access at all to message, friendship, user_block,
-- auth_account, auth_token, platform_account, sanction, report, audit_log, embedding_outbox or match_recommendation.
-- users is limited to non-sensitive columns (no bio, country, home region, strictness, counters, email...).
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
-- column-level: in_game_name is deliberately NOT granted (a gamertag may be private; members see it only through DEFINER views)
GRANT SELECT (profile_id, user_id, game_id, platform_account_id, rank_id, hours_played, is_main)
  ON pairadice.player_game_profile TO 'pairadice_web_ro';
GRANT SELECT ON pairadice.user_badge          TO 'pairadice_web_ro';
GRANT SELECT ON pairadice.badge               TO 'pairadice_web_ro';
GRANT SELECT ON pairadice.user_language       TO 'pairadice_web_ro';
-- Views are DEFINER objects (SQL SECURITY DEFINER is the default and 02_routines.sql does not override it), so
-- they run with the loader's privileges and the narrow column grant on users does not break them.
GRANT SELECT ON pairadice.v_open_sessions  TO 'pairadice_web_ro';
GRANT SELECT ON pairadice.v_session_roster TO 'pairadice_web_ro';
GRANT SELECT ON pairadice.v_player_card    TO 'pairadice_web_ro';

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
-- or let setup.sh do it for every role: --web-user, --auth-user, --app-user (player), --mod-user, --admin-user
-- To inspect a role (needs SELECT on the mysql schema):
--   SHOW GRANTS FOR 'pairadice_moderator' USING 'pairadice_player';
