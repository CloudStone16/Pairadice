SET NAMES utf8mb4;
SET time_zone = '+00:00';   -- all DATETIME columns are UTC
-- PairADice constraint tests: every statement below MUST be rejected (or, for the OUTBOX / probe rows, a
-- condition must hold). Where the expected error text is known it is asserted, not just "some error".
-- Runs inside a transaction that is rolled back, so the data is unchanged afterwards.
-- Usage: mysql --default-character-set=utf8mb4 -u root -p < 06_constraint_tests.sql
USE pairadice;

DROP PROCEDURE IF EXISTS t_expect_error;
DROP PROCEDURE IF EXISTS t_expect_msg;
DROP PROCEDURE IF EXISTS t_probe;
DELIMITER $$
CREATE PROCEDURE t_expect_error(IN p_name VARCHAR(120), IN p_sql TEXT)
BEGIN
  DECLARE v_err VARCHAR(500) DEFAULT NULL;
  DECLARE CONTINUE HANDLER FOR SQLEXCEPTION
    BEGIN GET DIAGNOSTICS CONDITION 1 v_err = MESSAGE_TEXT; END;
  SET @t_sql = p_sql;
  PREPARE t_stmt FROM @t_sql;
  EXECUTE t_stmt;
  DEALLOCATE PREPARE t_stmt;
  INSERT INTO tmp_test_results VALUES (p_name, IF(v_err IS NULL, 'FAIL (accepted!)', 'PASS'), v_err);
END$$

-- Like t_expect_error, but the statement must fail with a message matching p_like (so a typo or a missing
-- privilege cannot pass as "some error").
CREATE PROCEDURE t_expect_msg(IN p_name VARCHAR(120), IN p_sql TEXT, IN p_like VARCHAR(200))
BEGIN
  DECLARE v_err VARCHAR(500) DEFAULT NULL;
  DECLARE CONTINUE HANDLER FOR SQLEXCEPTION
    BEGIN GET DIAGNOSTICS CONDITION 1 v_err = MESSAGE_TEXT; END;
  SET @t_sql = p_sql;
  PREPARE t_stmt FROM @t_sql;
  EXECUTE t_stmt;
  DEALLOCATE PREPARE t_stmt;
  INSERT INTO tmp_test_results VALUES (p_name,
    IF(v_err IS NULL, 'FAIL (accepted!)', IF(v_err LIKE p_like, 'PASS', 'FAIL (wrong error)')), v_err);
END$$

-- Probe: PASS only when p_cond is true. The INSERT collides with language 'en' (duplicate PK) exactly then, and
-- inserts nothing otherwise; any other error (e.g. no access to mysql.procs_priv) is a FAIL, not a pass.
CREATE PROCEDURE t_probe(IN p_name VARCHAR(120), IN p_cond TEXT)
BEGIN
  CALL t_expect_msg(p_name,
    CONCAT("INSERT INTO language (language_code, name, native_name) SELECT 'en', 'probe', 'probe' FROM DUAL WHERE ", p_cond),
    '%Duplicate entry%');
END$$
DELIMITER ;

DROP TEMPORARY TABLE IF EXISTS tmp_test_results;
CREATE TEMPORARY TABLE tmp_test_results (test VARCHAR(120), result VARCHAR(20), error VARCHAR(500)) ENGINE=MEMORY;

START TRANSACTION;
CALL t_expect_error('CHECK: self friendship',            "INSERT INTO friendship (requester_id, addressee_id) VALUES (3, 3)");
CALL t_expect_error('UNIQUE: reversed duplicate friend',  "INSERT INTO friendship (requester_id, addressee_id, status) VALUES (8, 1, 'accepted')");
CALL t_expect_error('CHECK: rating out of range',         "INSERT INTO review (session_id, reviewer_id, reviewed_id, rating) VALUES (4, 2, 1, 6)");
CALL t_expect_error('CHECK: message has two targets',     "INSERT INTO message (sender_id, session_id, receiver_id, content) VALUES (1, 1, 8, 'x')");
CALL t_expect_error('CHECK: plaintext password',          "INSERT INTO auth_account (user_id, provider, email, password_hash) VALUES (3, 'email', 'mei@example.com', 'hunter2')");
CALL t_expect_error('CHECK: discord login with password', "INSERT INTO auth_account (user_id, provider, provider_user_id, password_hash) VALUES (3, 'discord', '999', '$argon2id$x')");
CALL t_expect_error('UNIQUE: discord id linked twice',    "INSERT INTO auth_account (user_id, provider, provider_user_id) VALUES (2, 'discord', '110000000000000001')");
CALL t_expect_error('FK: Valorant rank on Minecraft profile', "UPDATE player_game_profile SET rank_id = 8 WHERE profile_id = 6");
CALL t_expect_error('FK: session mode from another game', "INSERT INTO lfg_session (host_id, game_id, mode_id, platform_id, title, max_players) VALUES (4, 1, 5, 1, 'x', 2)");
CALL t_expect_error('FK: slot role from another game',    "INSERT INTO session_slot (session_id, slot_no, game_id, game_role_id) VALUES (2, 2, 1, 4)");
CALL t_expect_error('TRIGGER: max_players > team size',   "INSERT INTO lfg_session (host_id, game_id, mode_id, platform_id, title, max_players) VALUES (4, 1, 3, 1, 'x', 6)");
CALL t_expect_error('TRIGGER: suspended user hosts',      "INSERT INTO lfg_session (host_id, game_id, mode_id, platform_id, title, max_players) VALUES (11, 2, 6, 6, 'x', 5)");
CALL t_expect_error('TRIGGER: suspended user joins',      "INSERT INTO session_participant (session_id, user_id) VALUES (10, 11)");
CALL t_expect_error('TRIGGER: join a full session',       "INSERT INTO session_participant (session_id, user_id, status) VALUES (5, 12, 'accepted')");
CALL t_expect_error('TRIGGER: DM a blocked user',         "INSERT INTO message (sender_id, receiver_id, content) VALUES (1, 11, 'hi')");
CALL t_expect_error('TRIGGER: chat in a session not joined', "INSERT INTO message (sender_id, session_id, content) VALUES (6, 1, 'hi')");
CALL t_expect_error('TRIGGER: review before completion',  "INSERT INTO review (session_id, reviewer_id, reviewed_id, rating) VALUES (1, 1, 8, 5)");
CALL t_expect_error('TRIGGER: review by non-participant', "INSERT INTO review (session_id, reviewer_id, reviewed_id, rating) VALUES (3, 7, 2, 5)");
CALL t_expect_error('TRIGGER/RBAC: player issues sanction', "INSERT INTO sanction (user_id, sanction_type, reason, issued_by) VALUES (11, 'warn', 'x', 1)");
CALL t_expect_error('TRIGGER/RBAC: moderator bans',       "INSERT INTO sanction (user_id, sanction_type, reason, issued_by) VALUES (11, 'ban', 'x', 9)");
CALL t_expect_error('TRIGGER/RBAC: player handles report', "UPDATE report SET handled_by = 1 WHERE report_id = 2");
CALL t_expect_error('TRIGGER/RBAC: player assigns a role', "INSERT INTO user_role (user_id, role_id, assigned_by) VALUES (12, 2, 1)");
CALL t_expect_error('TRIGGER: reopen a completed session', "UPDATE lfg_session SET status = 'open' WHERE session_id = 3");
CALL t_expect_error('TRIGGER: friend request when blocked', "INSERT INTO friendship (requester_id, addressee_id) VALUES (11, 2)");
CALL t_expect_error('NOT NULL: outbox row without entity', "INSERT INTO embedding_outbox (entity, entity_id, op) VALUES (NULL, 1, 'upsert')");
CALL t_expect_error('NOT NULL: outbox row without id',    "INSERT INTO embedding_outbox (entity, entity_id, op) VALUES ('player', NULL, 'upsert')");
CALL t_expect_error('PK: outbox duplicate entity row',    "INSERT INTO embedding_outbox (entity, entity_id, op) VALUES ('player', 1, 'upsert'), ('player', 1, 'delete')");
-- Outbox behaviour (needs 07_vector_outbox.sql). Same probe pattern as below: the probe is rejected (= PASS)
-- only when the expected outbox row exists.
DELETE FROM embedding_outbox;
UPDATE profile_role SET preference_order = 9 WHERE profile_id = 2 AND preference_order = 1;
CALL t_expect_error('OUTBOX: profile_role update enqueues the player',
  "INSERT INTO language (language_code, name, native_name) SELECT 'en', 'probe', 'probe' FROM DUAL WHERE EXISTS (SELECT 1 FROM embedding_outbox WHERE entity = 'player' AND entity_id = 2 AND op = 'upsert')");
DELETE FROM embedding_outbox;
DELETE FROM platform_account WHERE account_id = 3;
CALL t_expect_error('OUTBOX: platform_account delete enqueues its user',
  "INSERT INTO language (language_code, name, native_name) SELECT 'en', 'probe', 'probe' FROM DUAL WHERE EXISTS (SELECT 1 FROM embedding_outbox WHERE entity = 'player' AND entity_id = 1 AND op = 'upsert')");
UPDATE embedding_outbox SET attempts = 5, last_error = 'probe' WHERE entity = 'player' AND entity_id = 1;
CALL t_expect_error('OUTBOX: v_outbox_dead lists a row at attempts >= 5',
  "INSERT INTO language (language_code, name, native_name) SELECT 'en', 'probe', 'probe' FROM DUAL WHERE EXISTS (SELECT 1 FROM v_outbox_dead WHERE entity = 'player' AND entity_id = 1 AND attempts = 5)");
-- ---- encoding / UTC / web-role guards.
-- Probe pattern: "INSERT ... SELECT 'en', ... WHERE <healthy condition>" collides with the existing language 'en'
-- (duplicate PK) only when the condition holds, so the probe is REJECTED (= PASS) when the database is healthy
-- and silently inserts nothing (= FAIL, 'accepted') when it is not. Nothing is ever written.
CALL t_expect_error('ENCODING: sofia_bw display_name is single-encoded UTF-8',
  "INSERT INTO language (language_code, name, native_name) SELECT 'en', 'probe', 'probe' FROM DUAL WHERE EXISTS (SELECT 1 FROM users WHERE username = 'sofia_bw' AND HEX(display_name) = '536F66C3AD61')");
CALL t_expect_error('ENCODING: Hindi and Japanese native names are single-encoded UTF-8',
  "INSERT INTO language (language_code, name, native_name) SELECT 'en', 'probe', 'probe' FROM DUAL WHERE EXISTS (SELECT 1 FROM language WHERE language_code = 'hi' AND HEX(native_name) = 'E0A4B9E0A4BFE0A4A8E0A58DE0A4A6E0A580') AND EXISTS (SELECT 1 FROM language WHERE language_code = 'ja' AND HEX(native_name) = 'E697A5E69CACE8AA9E')");
CALL t_expect_error('UTC: session time_zone is +00:00 and NOW() = UTC_TIMESTAMP()',
  "INSERT INTO language (language_code, name, native_name) SELECT 'en', 'probe', 'probe' FROM DUAL WHERE @@session.time_zone = '+00:00' AND TIMESTAMPDIFF(SECOND, NOW(), UTC_TIMESTAMP()) = 0");
CALL t_expect_error('RBAC: pairadice_web_ro has no privilege other than SELECT',
  "INSERT INTO language (language_code, name, native_name) SELECT 'en', 'probe', 'probe' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM information_schema.TABLE_PRIVILEGES WHERE LOCATE('pairadice_web_ro', GRANTEE) > 0 AND PRIVILEGE_TYPE <> 'SELECT') AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMN_PRIVILEGES WHERE LOCATE('pairadice_web_ro', GRANTEE) > 0 AND PRIVILEGE_TYPE <> 'SELECT') AND NOT EXISTS (SELECT 1 FROM information_schema.SCHEMA_PRIVILEGES WHERE LOCATE('pairadice_web_ro', GRANTEE) > 0 AND PRIVILEGE_TYPE <> 'SELECT')");
CALL t_expect_error('RBAC: pairadice_web_ro cannot touch auth / moderation / outbox tables',
  "INSERT INTO language (language_code, name, native_name) SELECT 'en', 'probe', 'probe' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM information_schema.SCHEMA_PRIVILEGES WHERE LOCATE('pairadice_web_ro', GRANTEE) > 0) AND NOT EXISTS (SELECT 1 FROM information_schema.TABLE_PRIVILEGES WHERE LOCATE('pairadice_web_ro', GRANTEE) > 0 AND TABLE_NAME IN ('auth_account', 'auth_token', 'platform_account', 'sanction', 'report', 'audit_log', 'embedding_outbox', 'match_recommendation')) AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMN_PRIVILEGES WHERE LOCATE('pairadice_web_ro', GRANTEE) > 0 AND TABLE_NAME NOT IN ('users', 'player_game_profile'))");
-- grant probes (information_schema; every one ends with an EXISTS so a missing role cannot pass vacuously)
CALL t_probe('RBAC: pairadice_web_ro has no privilege on message, friendship or user_block, and sees lfg_session',
  "NOT EXISTS (SELECT 1 FROM information_schema.TABLE_PRIVILEGES WHERE LOCATE('pairadice_web_ro', GRANTEE) > 0 AND TABLE_NAME IN ('message', 'friendship', 'user_block')) AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMN_PRIVILEGES WHERE LOCATE('pairadice_web_ro', GRANTEE) > 0 AND TABLE_NAME IN ('message', 'friendship', 'user_block')) AND EXISTS (SELECT 1 FROM information_schema.TABLE_PRIVILEGES WHERE LOCATE('pairadice_web_ro', GRANTEE) > 0 AND TABLE_NAME = 'lfg_session' AND PRIVILEGE_TYPE = 'SELECT')");
CALL t_probe('RBAC: pairadice_web_ro has no EXECUTE on any routine (sp_recommend_sessions p_log would write as DEFINER)',
  "NOT EXISTS (SELECT 1 FROM mysql.procs_priv WHERE User = 'pairadice_web_ro') AND NOT EXISTS (SELECT 1 FROM information_schema.SCHEMA_PRIVILEGES WHERE LOCATE('pairadice_web_ro', GRANTEE) > 0 AND PRIVILEGE_TYPE = 'EXECUTE') AND EXISTS (SELECT 1 FROM mysql.procs_priv WHERE User = 'pairadice_player' AND Routine_name = 'sp_recommend_sessions' AND FIND_IN_SET('Execute', Proc_priv) > 0)");
CALL t_probe('RBAC: pairadice_admin has no CREATE / ALTER / DROP / TRIGGER / INDEX and no GRANT OPTION, but has DML',
  "NOT EXISTS (SELECT 1 FROM information_schema.SCHEMA_PRIVILEGES WHERE LOCATE('pairadice_admin', GRANTEE) > 0 AND PRIVILEGE_TYPE IN ('CREATE', 'ALTER', 'DROP', 'TRIGGER', 'INDEX', 'REFERENCES', 'CREATE ROUTINE', 'ALTER ROUTINE', 'CREATE VIEW', 'CREATE TEMPORARY TABLES', 'LOCK TABLES', 'EVENT')) AND NOT EXISTS (SELECT 1 FROM information_schema.SCHEMA_PRIVILEGES WHERE LOCATE('pairadice_admin', GRANTEE) > 0 AND IS_GRANTABLE = 'YES') AND NOT EXISTS (SELECT 1 FROM information_schema.TABLE_PRIVILEGES WHERE LOCATE('pairadice_admin', GRANTEE) > 0 AND (IS_GRANTABLE = 'YES' OR PRIVILEGE_TYPE IN ('CREATE', 'ALTER', 'DROP', 'TRIGGER'))) AND EXISTS (SELECT 1 FROM information_schema.SCHEMA_PRIVILEGES WHERE LOCATE('pairadice_admin', GRANTEE) > 0 AND PRIVILEGE_TYPE = 'DELETE') AND EXISTS (SELECT 1 FROM information_schema.SCHEMA_PRIVILEGES WHERE LOCATE('pairadice_admin', GRANTEE) > 0 AND PRIVILEGE_TYPE = 'EXECUTE')");
CALL t_probe('RBAC: pairadice_player has no direct write on sessions, participants, friendships or blocks, but reads them',
  "NOT EXISTS (SELECT 1 FROM information_schema.TABLE_PRIVILEGES WHERE LOCATE('pairadice_player', GRANTEE) > 0 AND TABLE_NAME IN ('lfg_session', 'session_participant', 'friendship', 'user_block', 'session_slot', 'session_language', 'session_tag') AND PRIVILEGE_TYPE IN ('INSERT', 'UPDATE', 'DELETE')) AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMN_PRIVILEGES WHERE LOCATE('pairadice_player', GRANTEE) > 0 AND TABLE_NAME IN ('lfg_session', 'session_participant', 'friendship', 'user_block', 'session_slot', 'session_language', 'session_tag') AND PRIVILEGE_TYPE IN ('INSERT', 'UPDATE')) AND NOT EXISTS (SELECT 1 FROM information_schema.SCHEMA_PRIVILEGES WHERE LOCATE('pairadice_player', GRANTEE) > 0) AND EXISTS (SELECT 1 FROM information_schema.TABLE_PRIVILEGES WHERE LOCATE('pairadice_player', GRANTEE) > 0 AND TABLE_NAME = 'lfg_session' AND PRIVILEGE_TYPE = 'SELECT') AND EXISTS (SELECT 1 FROM information_schema.TABLE_PRIVILEGES WHERE LOCATE('pairadice_player', GRANTEE) > 0 AND TABLE_NAME = 'friendship' AND PRIVILEGE_TYPE = 'SELECT') AND EXISTS (SELECT 1 FROM mysql.procs_priv WHERE User = 'pairadice_player' AND Routine_name = 'sp_request_join' AND FIND_IN_SET('Execute', Proc_priv) > 0)");
-- grants: the shared player login may only run the procedures, never write the profile tables directly
CALL t_probe('RBAC: pairadice_player can EXECUTE every profile procedure',
  "(SELECT COUNT(*) FROM mysql.procs_priv WHERE User = 'pairadice_player' AND Routine_name IN ('sp_my_profile', 'sp_update_profile', 'sp_set_user_languages', 'sp_set_user_tags', 'sp_upsert_platform_account', 'sp_remove_platform_account', 'sp_upsert_game_profile', 'sp_remove_game_profile', 'sp_set_availability') AND FIND_IN_SET('Execute', Proc_priv) > 0) = 9");
CALL t_probe('RBAC: pairadice_player has no direct write on any profile table, but reads them',
  "NOT EXISTS (SELECT 1 FROM information_schema.TABLE_PRIVILEGES WHERE LOCATE('pairadice_player', GRANTEE) > 0 AND TABLE_NAME IN ('users', 'user_language', 'user_tag', 'platform_account', 'player_game_profile', 'profile_mode', 'profile_role', 'availability') AND PRIVILEGE_TYPE IN ('INSERT', 'UPDATE', 'DELETE')) AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMN_PRIVILEGES WHERE LOCATE('pairadice_player', GRANTEE) > 0 AND TABLE_NAME IN ('users', 'user_language', 'user_tag', 'platform_account', 'player_game_profile', 'profile_mode', 'profile_role', 'availability') AND PRIVILEGE_TYPE IN ('INSERT', 'UPDATE')) AND EXISTS (SELECT 1 FROM information_schema.TABLE_PRIVILEGES WHERE LOCATE('pairadice_player', GRANTEE) > 0 AND TABLE_NAME = 'user_tag' AND PRIVILEGE_TYPE = 'SELECT') AND EXISTS (SELECT 1 FROM information_schema.TABLE_PRIVILEGES WHERE LOCATE('pairadice_player', GRANTEE) > 0 AND TABLE_NAME = 'availability' AND PRIVILEGE_TYPE = 'SELECT')");
CALL t_probe('RBAC: web_ro and player cannot read in_game_name, but read the rest',
  "NOT EXISTS (SELECT 1 FROM information_schema.TABLE_PRIVILEGES WHERE (LOCATE('pairadice_web_ro', GRANTEE) > 0 OR LOCATE('pairadice_player', GRANTEE) > 0) AND TABLE_NAME = 'player_game_profile') AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMN_PRIVILEGES WHERE (LOCATE('pairadice_web_ro', GRANTEE) > 0 OR LOCATE('pairadice_player', GRANTEE) > 0) AND TABLE_NAME = 'player_game_profile' AND COLUMN_NAME = 'in_game_name') AND EXISTS (SELECT 1 FROM information_schema.COLUMN_PRIVILEGES WHERE LOCATE('pairadice_web_ro', GRANTEE) > 0 AND TABLE_NAME = 'player_game_profile' AND COLUMN_NAME = 'rank_id' AND PRIVILEGE_TYPE = 'SELECT') AND EXISTS (SELECT 1 FROM information_schema.COLUMN_PRIVILEGES WHERE LOCATE('pairadice_player', GRANTEE) > 0 AND TABLE_NAME = 'player_game_profile' AND COLUMN_NAME = 'user_id' AND PRIVILEGE_TYPE = 'SELECT')");
CALL t_probe('RBAC: pairadice_vec_worker keeps SELECT on the profile tables it embeds',
  "(SELECT COUNT(*) FROM information_schema.TABLE_PRIVILEGES WHERE LOCATE('pairadice_vec_worker', GRANTEE) > 0 AND TABLE_NAME IN ('users', 'user_tag', 'user_language', 'player_game_profile', 'platform_account', 'profile_mode', 'profile_role') AND PRIVILEGE_TYPE = 'SELECT') = 7");
-- catalogue renames re-embed everything that mentions the renamed row (07_vector_outbox.sql)
DELETE FROM embedding_outbox;
SELECT ut.tag_id INTO @tid FROM user_tag ut JOIN users u ON u.user_id = ut.user_id AND u.status <> 'banned' ORDER BY ut.tag_id LIMIT 1;
UPDATE tag SET category = CONCAT(IFNULL(category, ''), 'x') WHERE tag_id = @tid;
INSERT INTO tmp_test_results SELECT 'OUTBOX: tag category change (no rename) enqueues nothing',
  IF(NOT EXISTS (SELECT 1 FROM embedding_outbox), 'PASS', 'FAIL'), NULL;
UPDATE tag SET name = CONCAT(name, ' (renamed)') WHERE tag_id = @tid;
INSERT INTO tmp_test_results SELECT 'OUTBOX: tag rename enqueues every player and session using it',
  IF(EXISTS (SELECT 1 FROM embedding_outbox WHERE entity = 'player')
     AND NOT EXISTS (SELECT 1 FROM user_tag ut JOIN users u ON u.user_id = ut.user_id AND u.status <> 'banned'
                      WHERE ut.tag_id = @tid AND NOT EXISTS (SELECT 1 FROM embedding_outbox o WHERE o.entity = 'player' AND o.entity_id = ut.user_id))
     AND NOT EXISTS (SELECT 1 FROM session_tag st JOIN lfg_session s ON s.session_id = st.session_id AND s.status NOT IN ('completed', 'cancelled')
                      WHERE st.tag_id = @tid AND NOT EXISTS (SELECT 1 FROM embedding_outbox o WHERE o.entity = 'session' AND o.entity_id = st.session_id)), 'PASS', 'FAIL'), NULL;
DELETE FROM embedding_outbox;
SELECT game_id INTO @gid FROM lfg_session WHERE status NOT IN ('completed', 'cancelled') ORDER BY session_id LIMIT 1;
UPDATE game SET name = CONCAT(name, ' (renamed)') WHERE game_id = @gid;
INSERT INTO tmp_test_results SELECT 'OUTBOX: game rename enqueues its live sessions and profile owners',
  IF(EXISTS (SELECT 1 FROM embedding_outbox WHERE entity = 'session')
     AND NOT EXISTS (SELECT 1 FROM lfg_session s WHERE s.game_id = @gid AND s.status NOT IN ('completed', 'cancelled')
                      AND NOT EXISTS (SELECT 1 FROM embedding_outbox o WHERE o.entity = 'session' AND o.entity_id = s.session_id))
     AND NOT EXISTS (SELECT 1 FROM player_game_profile p JOIN users u ON u.user_id = p.user_id AND u.status <> 'banned'
                      WHERE p.game_id = @gid AND NOT EXISTS (SELECT 1 FROM embedding_outbox o WHERE o.entity = 'player' AND o.entity_id = p.user_id)), 'PASS', 'FAIL'), NULL;
DELETE FROM embedding_outbox;
SELECT pm.mode_id INTO @mid FROM profile_mode pm ORDER BY pm.mode_id LIMIT 1;
UPDATE game_mode SET name = CONCAT(name, ' (renamed)') WHERE mode_id = @mid;
INSERT INTO tmp_test_results SELECT 'OUTBOX: game_mode rename enqueues the players and sessions using it',
  IF(EXISTS (SELECT 1 FROM embedding_outbox WHERE entity = 'player')
     AND NOT EXISTS (SELECT 1 FROM profile_mode pm JOIN player_game_profile p ON p.profile_id = pm.profile_id JOIN users u ON u.user_id = p.user_id AND u.status <> 'banned'
                      WHERE pm.mode_id = @mid AND NOT EXISTS (SELECT 1 FROM embedding_outbox o WHERE o.entity = 'player' AND o.entity_id = p.user_id)), 'PASS', 'FAIL'), NULL;
DELETE FROM embedding_outbox;
SELECT pr.game_role_id INTO @rid FROM profile_role pr ORDER BY pr.game_role_id LIMIT 1;
UPDATE game_role SET name = CONCAT(name, ' (renamed)') WHERE game_role_id = @rid;
INSERT INTO tmp_test_results SELECT 'OUTBOX: game_role rename enqueues the players using it',
  IF(EXISTS (SELECT 1 FROM embedding_outbox WHERE entity = 'player')
     AND NOT EXISTS (SELECT 1 FROM profile_role pr JOIN player_game_profile p ON p.profile_id = pr.profile_id JOIN users u ON u.user_id = p.user_id AND u.status <> 'banned'
                      WHERE pr.game_role_id = @rid AND NOT EXISTS (SELECT 1 FROM embedding_outbox o WHERE o.entity = 'player' AND o.entity_id = p.user_id)), 'PASS', 'FAIL'), NULL;
-- recommendation feedback: accepting a recommended player marks their recommendation 'joined'
INSERT INTO match_recommendation (user_id, session_id, score, source) VALUES (2, 1, 0.5000, 'sql');
UPDATE session_participant SET status = 'accepted' WHERE session_id = 1 AND user_id = 2;
CALL t_expect_error('TRIGGER: accepting a recommended player records outcome joined',
  "INSERT INTO language (language_code, name, native_name) SELECT 'en', 'probe', 'probe' FROM DUAL WHERE EXISTS (SELECT 1 FROM match_recommendation WHERE user_id = 2 AND session_id = 1 AND outcome = 'joined')");
ROLLBACK;

-- ---- procedures that open their own transaction. START TRANSACTION inside a procedure implicitly commits
-- the test transaction above, which would make its probes' writes permanent, so these run after the
-- ROLLBACK. Each one is rejected before it writes anything.
CALL t_expect_error('PROC: accept into a full session',   "CALL sp_accept_participant(5, 12, 7)");
CALL t_expect_error('PROC: non-host accepts a player',    "CALL sp_accept_participant(10, 1, 8)");
CALL t_expect_error('PROC: sign-up with a bad username',  "CALL sp_register_user('no spaces', 'X', 'UTC', 'new@example.com', '$argon2id$v=19$probe', @t_uid)");
CALL t_expect_error('PROC: sign-up with a taken username', "CALL sp_register_user('aarav_plays', 'X', 'UTC', 'new@example.com', '$argon2id$v=19$probe', @t_uid)");
CALL t_expect_error('PROC: sign-up with a used email',    "CALL sp_register_user('brand_new', 'X', 'UTC', ' Aarav@Example.com ', '$argon2id$v=19$probe', @t_uid)");
CALL t_expect_error('PROC: sign-up with a bad email',     "CALL sp_register_user('brand_new', 'X', 'UTC', 'not-an-email', '$argon2id$v=19$probe', @t_uid)");

-- session lifecycle procedures (09_sessions.sql)
CALL t_expect_error('PROC: host requests to join own session', "CALL sp_request_join(1, 1, 4, 1)");
CALL t_expect_error('PROC: join a cancelled session',          "CALL sp_request_join(1, 6, NULL, NULL)");
CALL t_expect_error('PROC: join a completed session',          "CALL sp_request_join(12, 3, NULL, NULL)");
-- The invite-only probe has to change data, and START TRANSACTION inside sp_request_join commits whatever
-- is open, so a ROLLBACK cannot undo it: the original value is saved and restored explicitly, and the
-- restore is itself tested below. (The toggle re-queues session 10 in the outbox, which is harmless.)
SELECT visibility INTO @t_vis FROM lfg_session WHERE session_id = 10;
UPDATE lfg_session SET visibility = 'invite' WHERE session_id = 10;
CALL t_expect_msg('PROC: join an invite-only session',         "CALL sp_request_join(1, 10, NULL, NULL)", '%invite-only%');
UPDATE lfg_session SET visibility = @t_vis WHERE session_id = 10;
INSERT INTO tmp_test_results SELECT 'CLEANUP: session 10 visibility is restored',
  IF((SELECT visibility FROM lfg_session WHERE session_id = 10) <=> @t_vis AND @t_vis = 'public', 'PASS', 'FAIL'), NULL;
CALL t_expect_error('PROC: join friends-only as a non-friend', "CALL sp_request_join(4, 8, NULL, NULL)");
CALL t_expect_error('PROC: join with another user''s account', "CALL sp_request_join(12, 10, NULL, 4)");
CALL t_expect_error('PROC: join with a wrong-platform account', "CALL sp_request_join(1, 10, NULL, 2)");
CALL t_expect_error('PROC: decline as a non-host player',      "CALL sp_decline_participant(8, 1, 2)");
CALL t_expect_error('PROC: kick the host',                     "CALL sp_kick_participant(1, 1, 1)");
CALL t_expect_error('PROC: host cannot leave own session',     "CALL sp_withdraw_or_leave(1, 1)");
CALL t_expect_error('PROC: status completed -> open',          "CALL sp_set_session_status(2, 3, 'open')");
CALL t_expect_error('PROC: status open -> completed',          "CALL sp_set_session_status(1, 1, 'completed')");
CALL t_expect_error('PROC: status change by a non-host player', "CALL sp_set_session_status(8, 1, 'cancelled')");
CALL t_expect_error('PROC: create a session with an empty title', "CALL sp_create_session(4, 1, 1, 1, 12, '   ', NULL, 4, NULL, FALSE, FALSE, 'public', 'auto', NULL, NULL, NULL, 2, 7, NULL, JSON_ARRAY('en'), NULL, @t_sid)");
CALL t_expect_error('PROC: create a session with no languages',  "CALL sp_create_session(4, 1, 1, 1, 12, 'Valid title', NULL, 4, NULL, FALSE, FALSE, 'public', 'auto', NULL, NULL, NULL, 2, 7, NULL, JSON_ARRAY(), NULL, @t_sid)");

-- Friends and blocks (10_social.sql): each is rejected before it writes anything.
CALL t_expect_error('SOCIAL: friend request to yourself',        "CALL sp_send_friend_request(1, 1)");
CALL t_expect_error('SOCIAL: request someone already a friend',  "CALL sp_send_friend_request(1, 8)");
CALL t_expect_error('SOCIAL: duplicate outgoing request',        "CALL sp_send_friend_request(5, 4)");
CALL t_expect_error('SOCIAL: request a suspended user',          "CALL sp_send_friend_request(3, 11)");
CALL t_expect_error('SOCIAL: request across a block',            "CALL sp_send_friend_request(1, 11)");
CALL t_expect_error('SOCIAL: respond to a request that is not there', "CALL sp_respond_friend_request(1, 3, TRUE)");
CALL t_expect_error('SOCIAL: remove someone who is not a friend', "CALL sp_remove_friend(1, 3)");
CALL t_expect_error('SOCIAL: block yourself',                    "CALL sp_block_user(1, 1)");
CALL t_expect_error('SOCIAL: unblock someone not blocked',       "CALL sp_unblock_user(1, 3)");

-- Profile editing (11_profiles.sql). Rules are rejected before anything is written; a user can only edit their own profile.
CALL t_expect_msg('PROFILE: update by a suspended actor',   "CALL sp_update_profile(11, 'X', NULL, 'UTC', NULL, NULL, 'any')", '%account cannot do that%');
CALL t_expect_msg('PROFILE: update with a NULL actor',      "CALL sp_update_profile(NULL, 'X', NULL, 'UTC', NULL, NULL, 'any')", '%account cannot do that%');
CALL t_expect_msg('PROFILE: empty display name',            "CALL sp_update_profile(1, '   ', NULL, 'UTC', NULL, NULL, 'any')", '%Display name%');
CALL t_expect_msg('PROFILE: bio over 500 characters',       "CALL sp_update_profile(1, 'Aarav', REPEAT('a', 501), 'UTC', NULL, NULL, 'any')", '%Bio must be%');
CALL t_expect_msg('PROFILE: bad timezone',                  "CALL sp_update_profile(1, 'Aarav', NULL, 'Mars; DROP', NULL, NULL, 'any')", '%Timezone must%');
CALL t_expect_msg('PROFILE: unknown country',               "CALL sp_update_profile(1, 'Aarav', NULL, 'UTC', 'ZZ', NULL, 'any')", '%Unknown country%');
CALL t_expect_msg('PROFILE: unknown home region',           "CALL sp_update_profile(1, 'Aarav', NULL, 'UTC', 'IN', 99999, 'any')", '%Unknown home region%');
CALL t_expect_msg('PROFILE: bad region strictness',         "CALL sp_update_profile(1, 'Aarav', NULL, 'UTC', 'IN', NULL, 'bogus')", '%strictness%');
CALL t_expect_msg('PROFILE: unknown language code',         "CALL sp_set_user_languages(1, JSON_ARRAY('en', 'zz'), 'en')", '%Unknown language%');
CALL t_expect_msg('PROFILE: no languages',                  "CALL sp_set_user_languages(1, JSON_ARRAY(), NULL)", '%at least one language%');
CALL t_expect_msg('PROFILE: more than 8 languages',         "CALL sp_set_user_languages(1, JSON_ARRAY('en','hi','ja','fr','es','de','it','pt','ru'), 'en')", '%at most 8%');
CALL t_expect_msg('PROFILE: main language not in the set',  "CALL sp_set_user_languages(1, JSON_ARRAY('en'), 'hi')", '%main language%');
CALL t_expect_msg('PROFILE: oversize language array is refused before parsing', "CALL sp_set_user_languages(1, CAST(CONCAT('[', REPEAT('\"en\",', 50), '\"en\"]') AS JSON), 'en')", '%at most 8%');
CALL t_expect_msg('PROFILE: languages that are not a list', "CALL sp_set_user_languages(1, JSON_OBJECT('a', 1), 'en')", '%at least one language%');
CALL t_expect_msg('PROFILE: oversize tag array is refused before parsing', "CALL sp_set_user_tags(1, CAST(CONCAT('[', REPEAT('1,', 50), '1]') AS JSON))", '%at most 10%');
CALL t_expect_msg('PROFILE: tags that are not a list', "CALL sp_set_user_tags(1, JSON_OBJECT('a', 1))", '%must be a list%');
CALL t_expect_msg('PROFILE: oversize mode array is refused before parsing', "CALL sp_upsert_game_profile(1, 2, NULL, NULL, CAST(CONCAT('[', REPEAT('1,', 50), '1]') AS JSON), NULL)", '%at most 6 modes%');
CALL t_expect_msg('PROFILE: 3-character country code', "CALL sp_update_profile(1, 'Aarav', NULL, 'UTC', 'IND', NULL, 'any')", '%Unknown country%');
CALL t_expect_msg('PROFILE: timezone with an unknown area', "CALL sp_update_profile(1, 'Aarav', NULL, 'Narnia/Cair_Paravel', NULL, NULL, 'any')", '%Timezone must%');
CALL t_expect_msg('PROFILE: over-long main language code', "CALL sp_set_user_languages(1, JSON_ARRAY('en'), 'english')", '%Unknown language%');
CALL t_expect_msg('PROFILE: languages by a suspended actor', "CALL sp_set_user_languages(11, JSON_ARRAY('en'), 'en')", '%account cannot do that%');
CALL t_expect_msg('PROFILE: unknown tag',                   "CALL sp_set_user_tags(1, JSON_ARRAY(1, 99999))", '%Unknown tag%');
CALL t_expect_msg('PROFILE: more than 10 tags',             "CALL sp_set_user_tags(1, JSON_ARRAY(1,2,3,4,5,6,7,8,9,10,11))", '%at most 10%');
CALL t_expect_msg('PROFILE: tags by a suspended actor',     "CALL sp_set_user_tags(11, JSON_ARRAY())", '%account cannot do that%');
CALL t_expect_msg('PROFILE: edit another user''s platform account', "CALL sp_upsert_platform_account(1, 4, 6, 'Hijack', '', FALSE)", '%not yours%');
CALL t_expect_msg('PROFILE: remove another user''s platform account', "CALL sp_remove_platform_account(1, 4)", '%not yours%');
CALL t_expect_msg('PROFILE: empty gamertag',                "CALL sp_upsert_platform_account(1, NULL, 6, '  ', '', FALSE)", '%Gamertag must%');
CALL t_expect_msg('PROFILE: unknown platform',              "CALL sp_upsert_platform_account(1, NULL, 99, 'x', '', FALSE)", '%Unknown platform%');
CALL t_expect_msg('PROFILE: gamertag already linked (unique)', "CALL sp_upsert_platform_account(1, NULL, 6, 'PriyaGG', '#0007', FALSE)", '%already linked%');
CALL t_expect_msg('PROFILE: platform account by a suspended actor', "CALL sp_upsert_platform_account(11, NULL, 6, 'x', '', FALSE)", '%account cannot do that%');
CALL t_expect_msg('PROFILE: game profile with a rank from another game', "CALL sp_upsert_game_profile(1, 2, NULL, 1, NULL, NULL)", '%rank belongs to a different game%');
CALL t_expect_msg('PROFILE: game profile with a mode from another game', "CALL sp_upsert_game_profile(1, 2, NULL, NULL, JSON_ARRAY(1), NULL)", '%modes does not belong%');
CALL t_expect_msg('PROFILE: game profile with a role from another game', "CALL sp_upsert_game_profile(1, 2, NULL, NULL, NULL, JSON_ARRAY(JSON_OBJECT('role_id', 1, 'order', 1)))", '%roles does not belong%');
CALL t_expect_msg('PROFILE: more than 3 roles',             "CALL sp_upsert_game_profile(1, 2, NULL, NULL, NULL, JSON_ARRAY(JSON_OBJECT('role_id',4,'order',1), JSON_OBJECT('role_id',5,'order',2), JSON_OBJECT('role_id',6,'order',3), JSON_OBJECT('role_id',7,'order',3)))", '%at most 3 roles%');
CALL t_expect_msg('PROFILE: two roles with the same order', "CALL sp_upsert_game_profile(1, 2, NULL, NULL, NULL, JSON_ARRAY(JSON_OBJECT('role_id',4,'order',1), JSON_OBJECT('role_id',5,'order',1)))", '%own preference order%');
CALL t_expect_msg('PROFILE: role order outside 1-3',        "CALL sp_upsert_game_profile(1, 2, NULL, NULL, NULL, JSON_ARRAY(JSON_OBJECT('role_id',4,'order',4)))", '%order from 1 to 3%');
CALL t_expect_msg('PROFILE: more than 6 modes',             "CALL sp_upsert_game_profile(1, 2, NULL, NULL, JSON_ARRAY(1,2,3,4,5,6,7), NULL)", '%at most 6 modes%');
CALL t_expect_msg('PROFILE: game profile with someone else''s account', "CALL sp_upsert_game_profile(1, 2, 4, NULL, NULL, NULL)", '%not yours%');
CALL t_expect_msg('PROFILE: game profile with an account on the wrong platform', "CALL sp_upsert_game_profile(1, 2, 2, NULL, NULL, NULL)", '%not played on%');
CALL t_expect_msg('PROFILE: game profile for an unknown game', "CALL sp_upsert_game_profile(1, 999, NULL, NULL, NULL, NULL)", '%Unknown game%');
CALL t_expect_msg('PROFILE: game profile by a suspended actor', "CALL sp_upsert_game_profile(11, 2, NULL, NULL, NULL, NULL)", '%account cannot do that%');
CALL t_expect_msg('PROFILE: remove another user''s game profile', "CALL sp_remove_game_profile(1, 2)", '%not yours%');
CALL t_expect_msg('PROFILE: remove a game profile as a suspended actor', "CALL sp_remove_game_profile(11, 4)", '%account cannot do that%');
CALL t_expect_msg('PROFILE: overlapping availability',      "CALL sp_set_availability(1, JSON_ARRAY(JSON_OBJECT('day',0,'start','18:00','end','20:00'), JSON_OBJECT('day',0,'start','19:30','end','21:00')))", '%cannot overlap%');
CALL t_expect_msg('PROFILE: availability ends before it starts', "CALL sp_set_availability(1, JSON_ARRAY(JSON_OBJECT('day',0,'start','20:00','end','18:00')))", '%end after it starts%');
CALL t_expect_msg('PROFILE: availability day 7',            "CALL sp_set_availability(1, JSON_ARRAY(JSON_OBJECT('day',7,'start','18:00','end','20:00')))", '%day from 0%');
CALL t_expect_msg('PROFILE: availability bad time',         "CALL sp_set_availability(1, JSON_ARRAY(JSON_OBJECT('day',1,'start','25:00','end','26:00')))", '%HH:MM%');
CALL t_expect_msg('PROFILE: more than 28 availability slots', "CALL sp_set_availability(1, CAST(CONCAT('[', REPEAT('{\"day\":0,\"start\":\"10:00\",\"end\":\"11:00\"},', 28), '{\"day\":0,\"start\":\"12:00\",\"end\":\"13:00\"}]') AS JSON))", '%At most 28%');
CALL t_expect_msg('PROFILE: availability by a suspended actor', "CALL sp_set_availability(11, JSON_ARRAY())", '%account cannot do that%');

-- Profile behaviour: valid calls write the expected rows and queue a re-embed. These procedures COMMIT, so
-- each change is undone by an explicit restore (and the restore is itself checked).
CREATE TEMPORARY TABLE s_users AS SELECT user_id, display_name, bio, timezone, country_code, home_region_id, region_strictness FROM users WHERE user_id = 1;
CREATE TEMPORARY TABLE s_ul AS SELECT * FROM user_language WHERE user_id = 1;
CREATE TEMPORARY TABLE s_ut AS SELECT * FROM user_tag WHERE user_id = 1;
CREATE TEMPORARY TABLE s_av AS SELECT * FROM availability WHERE user_id = 1;
CREATE TEMPORARY TABLE s_pgp AS SELECT * FROM player_game_profile WHERE profile_id = 1;
CREATE TEMPORARY TABLE s_pm AS SELECT * FROM profile_mode WHERE profile_id = 1;
CREATE TEMPORARY TABLE s_pr AS SELECT * FROM profile_role WHERE profile_id = 1;
SELECT COUNT(*) INTO @n_acct FROM platform_account WHERE user_id = 1;
SELECT COUNT(*) INTO @n_pgp FROM player_game_profile WHERE user_id = 1;

DELETE FROM embedding_outbox;
CALL sp_update_profile(1, '  Aarav P  ', '  hello there  ', 'Asia/Kolkata', 'in', NULL, 'strict');
INSERT INTO tmp_test_results SELECT 'PROFILE: sp_update_profile trims, saves and queues a re-embed',
  IF(EXISTS (SELECT 1 FROM users WHERE user_id = 1 AND display_name = 'Aarav P' AND bio = 'hello there' AND country_code = 'IN' AND region_strictness = 'strict' AND home_region_id IS NULL)
     AND EXISTS (SELECT 1 FROM embedding_outbox WHERE entity = 'player' AND entity_id = 1 AND op = 'upsert'), 'PASS', 'FAIL'), NULL;
CALL sp_update_profile(1, 'x', '', NULL, NULL, NULL, NULL);
INSERT INTO tmp_test_results SELECT 'PROFILE: empty bio clears, NULL timezone and strictness are kept',
  IF(EXISTS (SELECT 1 FROM users WHERE user_id = 1 AND bio IS NULL AND timezone = 'Asia/Kolkata' AND region_strictness = 'strict' AND country_code IS NULL), 'PASS', 'FAIL'), NULL;
INSERT INTO tmp_test_results SELECT 'PROFILE: profile procedures leave @audit_actor NULL', IF(@audit_actor IS NULL, 'PASS', 'FAIL'), NULL;

DELETE FROM embedding_outbox;
CALL sp_set_user_languages(1, JSON_ARRAY('hi', 'fr'), 'fr');
INSERT INTO tmp_test_results SELECT 'PROFILE: sp_set_user_languages replaces the set and marks the main language',
  IF((SELECT GROUP_CONCAT(language_code ORDER BY language_code) FROM user_language WHERE user_id = 1) = 'fr,hi'
     AND (SELECT is_preferred FROM user_language WHERE user_id = 1 AND language_code = 'fr') = 1
     AND (SELECT COUNT(*) FROM user_language WHERE user_id = 1 AND is_preferred) = 1
     AND EXISTS (SELECT 1 FROM embedding_outbox WHERE entity = 'player' AND entity_id = 1), 'PASS', 'FAIL'), NULL;

DELETE FROM embedding_outbox;
CALL sp_set_user_tags(1, JSON_ARRAY(1, 2, 2));
INSERT INTO tmp_test_results SELECT 'PROFILE: sp_set_user_tags replaces the set and de-duplicates',
  IF((SELECT GROUP_CONCAT(tag_id ORDER BY tag_id) FROM user_tag WHERE user_id = 1) = '1,2'
     AND EXISTS (SELECT 1 FROM embedding_outbox WHERE entity = 'player' AND entity_id = 1), 'PASS', 'FAIL'), NULL;

CALL sp_set_availability(1, JSON_ARRAY(JSON_OBJECT('day', 2, 'start', '18:00', 'end', '20:00'), JSON_OBJECT('day', 2, 'start', '20:00', 'end', '21:30')));
INSERT INTO tmp_test_results SELECT 'PROFILE: sp_set_availability replaces the weekly slots (touching slots are allowed)',
  IF((SELECT COUNT(*) FROM availability WHERE user_id = 1) = 2 AND EXISTS (SELECT 1 FROM availability WHERE user_id = 1 AND day_of_week = 2 AND start_time = '20:00:00' AND end_time = '21:30:00'), 'PASS', 'FAIL'), NULL;

-- platform account: add, edit, link a game profile to it, remove it (profile survives, unlinked), remove the profile
DELETE FROM embedding_outbox;
CALL sp_upsert_platform_account(1, NULL, 3, ' ProbeTag ', NULL, TRUE);
SELECT MAX(account_id) INTO @t_acct FROM platform_account WHERE user_id = 1;
INSERT INTO tmp_test_results SELECT 'PROFILE: sp_upsert_platform_account adds an account',
  IF(EXISTS (SELECT 1 FROM platform_account WHERE account_id = @t_acct AND user_id = 1 AND platform_id = 3 AND handle = 'ProbeTag' AND discriminator = '' AND is_public AND NOT is_verified), 'PASS', 'FAIL'), NULL;
CALL sp_upsert_platform_account(1, @t_acct, 3, 'ProbeTag2', '#1', NULL);
INSERT INTO tmp_test_results SELECT 'PROFILE: sp_upsert_platform_account edits own account (NULL is_public keeps it)',
  IF(EXISTS (SELECT 1 FROM platform_account WHERE account_id = @t_acct AND handle = 'ProbeTag2' AND discriminator = '#1' AND is_public), 'PASS', 'FAIL'), NULL;
CALL sp_upsert_game_profile(1, 1, @t_acct, 2, JSON_ARRAY(1, 3), JSON_ARRAY(JSON_OBJECT('role_id', 1, 'order', 1), JSON_OBJECT('role_id', 3, 'order', 2)));
SELECT MAX(profile_id) INTO @t_prof FROM player_game_profile WHERE user_id = 1 AND game_id = 1;
INSERT INTO tmp_test_results SELECT 'PROFILE: sp_upsert_game_profile creates a profile with its modes and roles',
  IF(EXISTS (SELECT 1 FROM player_game_profile WHERE profile_id = @t_prof AND platform_account_id = @t_acct AND rank_id = 2)
     AND (SELECT COUNT(*) FROM profile_mode WHERE profile_id = @t_prof) = 2
     AND (SELECT GROUP_CONCAT(game_role_id, ':', preference_order ORDER BY preference_order) FROM profile_role WHERE profile_id = @t_prof) = '1:1,3:2'
     AND EXISTS (SELECT 1 FROM embedding_outbox WHERE entity = 'player' AND entity_id = 1), 'PASS', 'FAIL'), NULL;
INSERT INTO tmp_test_results SELECT 'PROFILE: sp_upsert_game_profile does not copy the gamertag into in_game_name',
  IF(EXISTS (SELECT 1 FROM player_game_profile WHERE profile_id = @t_prof AND in_game_name IS NULL), 'PASS', 'FAIL'), NULL;
CALL sp_upsert_game_profile(1, 1, @t_acct, NULL, JSON_ARRAY(4), NULL);
INSERT INTO tmp_test_results SELECT 'PROFILE: a second upsert for the same game updates, not duplicates',
  IF((SELECT COUNT(*) FROM player_game_profile WHERE user_id = 1 AND game_id = 1) = 1
     AND (SELECT GROUP_CONCAT(mode_id) FROM profile_mode WHERE profile_id = @t_prof) = '4'
     AND NOT EXISTS (SELECT 1 FROM profile_role WHERE profile_id = @t_prof)
     AND (SELECT rank_id FROM player_game_profile WHERE profile_id = @t_prof) IS NULL, 'PASS', 'FAIL'), NULL;
CALL sp_remove_platform_account(1, @t_acct);
INSERT INTO tmp_test_results SELECT 'PROFILE: removing an account unlinks, but keeps, its game profile',
  IF(NOT EXISTS (SELECT 1 FROM platform_account WHERE account_id = @t_acct)
     AND EXISTS (SELECT 1 FROM player_game_profile WHERE profile_id = @t_prof AND platform_account_id IS NULL), 'PASS', 'FAIL'), NULL;
CALL sp_remove_game_profile(1, @t_prof);
INSERT INTO tmp_test_results SELECT 'PROFILE: sp_remove_game_profile deletes the profile with its modes',
  IF(NOT EXISTS (SELECT 1 FROM player_game_profile WHERE profile_id = @t_prof) AND NOT EXISTS (SELECT 1 FROM profile_mode WHERE profile_id = @t_prof), 'PASS', 'FAIL'), NULL;

-- update an existing profile (user 1 Valorant, profile 1), then restore it
CALL sp_upsert_game_profile(1, 2, 1, 9, JSON_ARRAY(5), JSON_ARRAY(JSON_OBJECT('role_id', 4, 'order', 1)));
INSERT INTO tmp_test_results SELECT 'PROFILE: sp_upsert_game_profile updates the existing (lowest id) profile',
  IF((SELECT COUNT(*) FROM player_game_profile WHERE user_id = 1 AND game_id = 2) = 1
     AND (SELECT rank_id FROM player_game_profile WHERE profile_id = 1) = 9
     AND (SELECT COUNT(*) FROM profile_mode WHERE profile_id = 1) = 1 AND (SELECT COUNT(*) FROM profile_role WHERE profile_id = 1) = 1, 'PASS', 'FAIL'), NULL;

INSERT INTO tmp_test_results SELECT 'PROFILE: updating an existing profile leaves in_game_name NULL',
  IF(EXISTS (SELECT 1 FROM player_game_profile WHERE profile_id = 1 AND in_game_name IS NULL), 'PASS', 'FAIL'), NULL;

-- restore user 1 exactly
UPDATE player_game_profile p JOIN s_pgp s ON s.profile_id = p.profile_id SET p.rank_id = s.rank_id, p.platform_account_id = s.platform_account_id, p.in_game_name = s.in_game_name;
DELETE FROM profile_mode WHERE profile_id = 1;
DELETE FROM profile_role WHERE profile_id = 1;
INSERT INTO profile_mode SELECT * FROM s_pm;
INSERT INTO profile_role SELECT * FROM s_pr;
UPDATE users u JOIN s_users s ON s.user_id = u.user_id
   SET u.display_name = s.display_name, u.bio = s.bio, u.timezone = s.timezone, u.country_code = s.country_code,
       u.home_region_id = s.home_region_id, u.region_strictness = s.region_strictness;
DELETE FROM user_language WHERE user_id = 1;
INSERT INTO user_language SELECT * FROM s_ul;
DELETE FROM user_tag WHERE user_id = 1;
INSERT INTO user_tag SELECT * FROM s_ut;
DELETE FROM availability WHERE user_id = 1;
INSERT INTO availability SELECT * FROM s_av;
INSERT INTO tmp_test_results SELECT 'CLEANUP: user 1 profile data is restored after the profile tests',
  IF((SELECT COUNT(*) FROM platform_account WHERE user_id = 1) = @n_acct AND (SELECT COUNT(*) FROM player_game_profile WHERE user_id = 1) = @n_pgp
     AND (SELECT COUNT(*) FROM user_language WHERE user_id = 1) = (SELECT COUNT(*) FROM s_ul)
     AND (SELECT COUNT(*) FROM availability WHERE user_id = 1) = (SELECT COUNT(*) FROM s_av)
     AND (SELECT display_name FROM users WHERE user_id = 1) = (SELECT display_name FROM s_users), 'PASS', 'FAIL'), NULL;
DROP TEMPORARY TABLE s_users, s_ul, s_ut, s_av, s_pgp, s_pm, s_pr;

-- NULL and suspended actors (each is refused before anything is written)
CALL t_expect_msg('PROC: sp_accept_participant with a NULL actor', "CALL sp_accept_participant(1, 2, NULL)", '%account cannot do that%');
CALL t_expect_msg('PROC: sp_accept_participant by a suspended actor', "CALL sp_accept_participant(9, 11, 11)", '%account cannot do that%');
CALL t_expect_msg('PROC: sp_request_join by a suspended actor',   "CALL sp_request_join(11, 10, NULL, NULL)", '%account cannot do that%');
CALL t_expect_msg('PROC: sp_request_join with a NULL actor',      "CALL sp_request_join(NULL, 10, NULL, NULL)", '%account cannot do that%');
CALL t_expect_msg('PROC: sp_set_session_status with a NULL status', "CALL sp_set_session_status(1, 1, NULL)", '%not allowed%');
CALL t_expect_msg('SOCIAL: sp_send_friend_request by a suspended actor', "CALL sp_send_friend_request(11, 3)", '%account cannot do that%');
CALL t_expect_msg('SOCIAL: sp_block_user with a NULL actor',      "CALL sp_block_user(NULL, 3)", '%account cannot do that%');
INSERT INTO tmp_test_results SELECT 'PROC: failed procedures leave @audit_actor NULL', IF(@audit_actor IS NULL, 'PASS', 'FAIL'), NULL;

SELECT * FROM tmp_test_results;
SELECT SUM(result = 'PASS') AS passed, COUNT(*) AS total FROM tmp_test_results;
DROP PROCEDURE t_probe;
DROP PROCEDURE t_expect_msg;
DROP PROCEDURE t_expect_error;
