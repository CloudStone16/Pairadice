-- PairADice database-level RBAC (MySQL roles). Run after 02_routines.sql.
-- Mirrors the in-app role / permission tables: player < moderator < admin.
-- Roles are server-wide objects, so they are dropped and recreated for a clean re-run.

DROP ROLE IF EXISTS 'pairadice_player', 'pairadice_moderator', 'pairadice_admin';
CREATE ROLE 'pairadice_player', 'pairadice_moderator', 'pairadice_admin';

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

-- Example login accounts (choose your own passwords; never commit them):
--   CREATE USER 'pd_api'@'localhost' IDENTIFIED BY '<password>';
--   GRANT 'pairadice_player' TO 'pd_api'@'localhost';
--   SET DEFAULT ROLE 'pairadice_player' TO 'pd_api'@'localhost';

SHOW GRANTS FOR 'pairadice_moderator' USING 'pairadice_player';
