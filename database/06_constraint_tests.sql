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

-- ---- Moderation (12_moderation.sql). These procedures COMMIT, so everything created below is deleted again at
-- the end (ids above the saved maxima) and the two users whose status moves are restored explicitly.
SELECT IFNULL(MAX(report_id), 0)   INTO @m_r0 FROM report;
SELECT IFNULL(MAX(sanction_id), 0) INTO @m_s0 FROM sanction;
SELECT IFNULL(MAX(log_id), 0)      INTO @m_a0 FROM audit_log;
SELECT IFNULL(MAX(message_id), 0)  INTO @m_m0 FROM message;
SELECT status, trust_score INTO @m_st12, @m_ts12 FROM users WHERE user_id = 12;
SELECT status, trust_score INTO @m_st9,  @m_ts9  FROM users WHERE user_id = 9;
SELECT trust_score INTO @m_ts3  FROM users WHERE user_id = 3;
SELECT trust_score INTO @m_ts11 FROM users WHERE user_id = 11;
DROP TEMPORARY TABLE IF EXISTS m_outbox;
CREATE TEMPORARY TABLE m_outbox AS SELECT * FROM embedding_outbox;   -- the triggers queue re-embeds; restored at the end

-- refusals before anything exists
CALL t_expect_msg('MOD: report with a NULL actor',            "CALL sp_report_user(NULL, 12, 'spam', NULL, NULL, NULL, @t_rid)", 'Your account cannot do that right now.');
CALL t_expect_msg('MOD: report by a suspended actor',         "CALL sp_report_user(11, 12, 'spam', NULL, NULL, NULL, @t_rid)", 'Your account cannot do that right now.');
CALL t_expect_msg('MOD: report yourself',                     "CALL sp_report_user(1, 1, 'spam', NULL, NULL, NULL, @t_rid)", 'You cannot report yourself.');
CALL t_expect_msg('MOD: report an unknown player',            "CALL sp_report_user(1, 9999, 'spam', NULL, NULL, NULL, @t_rid)", 'That player does not exist.');
CALL t_expect_msg('MOD: report with a bad category',          "CALL sp_report_user(1, 12, 'rude', NULL, NULL, NULL, @t_rid)", 'Choose a report category.');
CALL t_expect_msg('MOD: report description over 1000',        "CALL sp_report_user(1, 12, 'spam', REPEAT('a', 1001), NULL, NULL, @t_rid)", 'The description must be 1000 characters or fewer.');
CALL t_expect_msg('MOD: report from a session not shared',    "CALL sp_report_user(1, 3, 'spam', NULL, 3, NULL, @t_rid)", 'You and that player were not in that session together.');
CALL t_expect_msg('MOD: report a message the target did not send', "CALL sp_report_user(2, 8, 'spam', NULL, NULL, 5, @t_rid)", 'That message cannot be attached to this report.');
CALL t_expect_msg('MOD: report a message you cannot see',     "CALL sp_report_user(1, 3, 'spam', NULL, NULL, 9, @t_rid)", 'That message cannot be attached to this report.');
CALL t_expect_msg('MOD: report a message that does not exist (same refusal, no probing)', "CALL sp_report_user(1, 3, 'spam', NULL, NULL, 99999, @t_rid)", 'That message cannot be attached to this report.');
CALL t_expect_msg('MOD: claim with a NULL actor',             "CALL sp_claim_report(NULL, 1)", 'Your account cannot do that right now.');
CALL t_expect_msg('MOD: claim as a player',                   "CALL sp_claim_report(1, 1)", 'Only moderators can handle reports.');
CALL t_expect_msg('MOD: claim an unknown report',             "CALL sp_claim_report(9, 99999)", 'That report does not exist.');
CALL t_expect_msg('MOD: claim a resolved report',             "CALL sp_claim_report(9, 1)", 'That report is already resolved.');
CALL t_expect_msg('MOD: resolve an already resolved report',  "CALL sp_resolve_report(9, 1, 'dismissed', NULL)", 'That report is already resolved.');
CALL t_expect_msg('MOD: resolve with a bad outcome',          "CALL sp_resolve_report(9, 1, 'open', NULL)", 'Choose dismissed or actioned.');
CALL t_expect_msg('MOD: sanction by a suspended actor',       "CALL sp_issue_sanction(11, 12, 'warn', 'rude chat', NULL, NULL, @t_sid)", 'Your account cannot do that right now.');
CALL t_expect_msg('MOD: sanction with a NULL actor',          "CALL sp_issue_sanction(NULL, 12, 'warn', 'rude chat', NULL, NULL, @t_sid)", 'Your account cannot do that right now.');
CALL t_expect_msg('MOD: sanction as a player',                "CALL sp_issue_sanction(1, 12, 'warn', 'rude chat', NULL, NULL, @t_sid)", 'You are not allowed to issue sanctions.');
CALL t_expect_msg('MOD: moderator bans',                      "CALL sp_issue_sanction(9, 12, 'ban', 'cheating', NULL, NULL, @t_sid)", 'Only admins can ban users');
CALL t_expect_msg('MOD: sanction with a short reason',        "CALL sp_issue_sanction(9, 12, 'warn', 'ab', NULL, NULL, @t_sid)", 'Give a reason of 3 to 255 characters.');
CALL t_expect_msg('MOD: sanction with a long reason',         "CALL sp_issue_sanction(9, 12, 'warn', REPEAT('a', 256), NULL, NULL, @t_sid)", 'Give a reason of 3 to 255 characters.');
CALL t_expect_msg('MOD: sanction yourself',                   "CALL sp_issue_sanction(9, 9, 'warn', 'oops', NULL, NULL, @t_sid)", 'You cannot sanction yourself.');
CALL t_expect_msg('MOD: sanction an unknown player',          "CALL sp_issue_sanction(9, 9999, 'warn', 'oops', NULL, NULL, @t_sid)", 'That player does not exist.');
CALL t_expect_msg('MOD: moderator sanctions an admin',        "CALL sp_issue_sanction(9, 10, 'warn', 'oops', NULL, NULL, @t_sid)", 'Moderators cannot sanction staff.');
CALL t_expect_msg('MOD: warn with an end date',               "CALL sp_issue_sanction(9, 12, 'warn', 'rude chat', UTC_TIMESTAMP() + INTERVAL 1 DAY, NULL, @t_sid)", 'A warning or ban has no end date.');
CALL t_expect_msg('MOD: mute without an end date',            "CALL sp_issue_sanction(9, 12, 'mute', 'rude chat', NULL, NULL, @t_sid)", 'Choose when this sanction ends.');
CALL t_expect_msg('MOD: suspend ending in the past',          "CALL sp_issue_sanction(9, 12, 'suspend', 'rude chat', UTC_TIMESTAMP() - INTERVAL 1 DAY, NULL, @t_sid)", 'The end date must be in the future.');
CALL t_expect_msg('MOD: suspend longer than 90 days',         "CALL sp_issue_sanction(9, 12, 'suspend', 'rude chat', UTC_TIMESTAMP() + INTERVAL 91 DAY, NULL, @t_sid)", 'A sanction can last at most 90 days.');
CALL t_expect_msg('MOD: sanction with a bad type',            "CALL sp_issue_sanction(9, 12, 'shun', 'rude chat', NULL, NULL, @t_sid)", 'Choose a sanction type.');
CALL t_expect_msg('MOD: sanction citing an unknown report',   "CALL sp_issue_sanction(9, 12, 'warn', 'rude chat', NULL, 99999, @t_sid)", 'That report does not exist.');
CALL t_expect_msg('MOD: sanction citing a resolved report',   "CALL sp_issue_sanction(9, 11, 'warn', 'rude chat', NULL, 1, @t_sid)", 'That report is already resolved.');
CALL t_expect_msg('MOD: lift an unknown sanction',            "CALL sp_lift_sanction(9, 99999, 'mistake')", 'That sanction does not exist.');
CALL t_expect_msg('MOD: lift as a player',                    "CALL sp_lift_sanction(1, 2, 'mistake')", 'You are not allowed to lift sanctions.');
CALL t_expect_msg('MOD: lift without a reason',               "CALL sp_lift_sanction(9, 2, '  ')", 'Give a reason of 3 to 255 characters.');
CALL t_expect_msg('MOD: hide as a player',                    "CALL sp_moderate_message(1, 4, TRUE, NULL)", 'Only moderators can hide or restore messages.');
CALL t_expect_msg('MOD: hide an unknown message',             "CALL sp_moderate_message(9, 99999, TRUE, NULL)", 'That message does not exist.');
CALL t_expect_msg('MOD: restore a visible message',           "CALL sp_moderate_message(9, 4, FALSE, NULL)", 'That message is already visible.');
CALL t_expect_msg('MOD: grant a role as a moderator',         "CALL sp_grant_role(9, 1, 'moderator')", 'Only admins can change roles.');
CALL t_expect_msg('MOD: grant an unknown role',               "CALL sp_grant_role(10, 1, 'wizard')", 'That role does not exist.');
CALL t_expect_msg('MOD: grant a role already held',           "CALL sp_grant_role(10, 9, 'moderator')", 'That player already has that role.');
CALL t_expect_msg('MOD: revoke the player role',              "CALL sp_revoke_role(10, 1, 'player')", 'The player role cannot be removed.');
CALL t_expect_msg('MOD: revoke the last admin',               "CALL sp_revoke_role(10, 10, 'admin')", 'You cannot remove the last admin.');
CALL t_expect_msg('MOD: revoke a role not held',              "CALL sp_revoke_role(10, 1, 'moderator')", 'That player does not have that role.');
CALL t_expect_msg('MOD: revoke as a moderator',               "CALL sp_revoke_role(9, 1, 'moderator')", 'Only admins can change roles.');
INSERT INTO tmp_test_results SELECT 'MOD: fn_staff_rank is 0 player, 1 moderator, 2 admin',
  IF(fn_staff_rank(1) = 0 AND fn_staff_rank(9) = 1 AND fn_staff_rank(10) = 2 AND fn_staff_rank(NULL) = 0, 'PASS', 'FAIL'), NULL;
INSERT INTO tmp_test_results SELECT 'MOD: refused moderation procedures leave @audit_actor NULL', IF(@audit_actor IS NULL, 'PASS', 'FAIL'), NULL;
INSERT INTO tmp_test_results SELECT 'MOD: refused calls wrote no rows',
  IF((SELECT COUNT(*) FROM report WHERE report_id > @m_r0) = 0 AND (SELECT COUNT(*) FROM sanction WHERE sanction_id > @m_s0) = 0
     AND (SELECT COUNT(*) FROM audit_log WHERE log_id > @m_a0) = 0, 'PASS', 'FAIL'), NULL;

-- report -> claim -> sanction (actions the report) with every audit step
CALL sp_report_user(1, 12, 'spam', '  repeated spam  ', 1, NULL, @t_r1);
INSERT INTO tmp_test_results SELECT 'MOD: sp_report_user files an open report and returns its id',
  IF(EXISTS (SELECT 1 FROM report WHERE report_id = @t_r1 AND reporter_id = 1 AND reported_user_id = 12 AND status = 'open'
               AND handled_by IS NULL AND session_id = 1 AND description = 'repeated spam'), 'PASS', 'FAIL'), NULL;
CALL t_expect_msg('MOD: duplicate open report within 24 hours', "CALL sp_report_user(1, 12, 'cheating', NULL, NULL, NULL, @t_rid)", 'You already reported this player.');
CALL sp_report_user(1, 8, 'harassment', NULL, 1, 2, @t_r5);
INSERT INTO tmp_test_results SELECT 'MOD: report with a visible message and a shared session is accepted',
  IF(EXISTS (SELECT 1 FROM report WHERE report_id = @t_r5 AND message_id = 2), 'PASS', 'FAIL'), NULL;
CALL t_expect_msg('MOD: a player cannot claim a report', CONCAT('CALL sp_claim_report(1, ', @t_r1, ')'), 'Only moderators can handle reports.');
CALL sp_report_user(9, 12, 'other', NULL, NULL, NULL, @t_r4);
INSERT INTO message (sender_id, receiver_id, content) VALUES (9, 1, 'mod own message');
SET @t_own = LAST_INSERT_ID();
CALL t_expect_msg('MOD: moderator claims a report they filed', CONCAT('CALL sp_claim_report(9, ', @t_r4, ')'), 'You cannot handle a report you filed or are the subject of.');
CALL sp_report_user(1, 9, 'other', NULL, NULL, NULL, @t_r6);
CALL t_expect_msg('MOD: moderator claims a report about themselves', CONCAT('CALL sp_claim_report(9, ', @t_r6, ')'), 'You cannot handle a report you filed or are the subject of.');
CALL sp_claim_report(9, @t_r1);
INSERT INTO tmp_test_results SELECT 'MOD: claim sets reviewing and handled_by',
  IF(EXISTS (SELECT 1 FROM report WHERE report_id = @t_r1 AND status = 'reviewing' AND handled_by = 9 AND resolved_at IS NULL), 'PASS', 'FAIL'), NULL;
CALL t_expect_msg('MOD: claim a report you already hold', CONCAT('CALL sp_claim_report(9, ', @t_r1, ')'), 'You already hold this report.');
CALL t_expect_msg('MOD: sanction citing a report about someone else', CONCAT('CALL sp_issue_sanction(9, 8, ''warn'', ''rude chat'', NULL, ', @t_r1, ', @t_sid)'), 'That report is about a different player.');
CALL sp_issue_sanction(9, 12, 'mute', '  spamming chat  ', UTC_TIMESTAMP() + INTERVAL 3 DAY, @t_r1, @t_mute);
INSERT INTO tmp_test_results SELECT 'MOD: sp_issue_sanction creates the mute, actions the report and audits both',
  IF(EXISTS (SELECT 1 FROM sanction WHERE sanction_id = @t_mute AND user_id = 12 AND sanction_type = 'mute' AND issued_by = 9 AND report_id = @t_r1 AND reason = 'spamming chat')
     AND EXISTS (SELECT 1 FROM report WHERE report_id = @t_r1 AND status = 'actioned' AND handled_by = 9 AND resolved_at IS NOT NULL)
     AND EXISTS (SELECT 1 FROM audit_log WHERE log_id > @m_a0 AND entity = 'sanction' AND entity_id = CAST(@t_mute AS CHAR) AND action = 'issue' AND actor_id = 9)
     AND EXISTS (SELECT 1 FROM audit_log WHERE log_id > @m_a0 AND entity = 'report' AND entity_id = CAST(@t_r1 AS CHAR) AND action = 'status_change' AND actor_id = 9
                   AND JSON_UNQUOTE(JSON_EXTRACT(new_value, '$.status')) = 'actioned'), 'PASS', 'FAIL'), NULL;
CALL t_expect_msg('MOD: resolve a report that a sanction already actioned', CONCAT('CALL sp_resolve_report(9, ', @t_r1, ', ''dismissed'', NULL)'), 'That report is already resolved.');
INSERT INTO tmp_test_results SELECT 'MOD: before the lift the user has an active mute',
  IF(EXISTS (SELECT 1 FROM sanction WHERE sanction_id = @t_mute AND sanction_type = 'mute' AND starts_at <= UTC_TIMESTAMP() AND ends_at > UTC_TIMESTAMP()), 'PASS', 'FAIL'), NULL;
START TRANSACTION;
CALL t_expect_msg('MOD: before the lift trg_message_bi refuses the muted user''s chat',
  "INSERT INTO message (sender_id, session_id, content) VALUES (12, 1, 'muted probe')", 'Sender is muted, suspended or banned');
ROLLBACK;
CALL sp_lift_sanction(9, @t_mute, '  appealed  ');                -- immediately: no sleep needed
INSERT INTO tmp_test_results SELECT 'MOD: lifting a mute ends it now and audits the reason',
  IF(EXISTS (SELECT 1 FROM sanction WHERE sanction_id = @t_mute AND ends_at <= UTC_TIMESTAMP() + INTERVAL 1 SECOND AND ends_at > starts_at)
     AND EXISTS (SELECT 1 FROM audit_log WHERE log_id > @m_a0 AND entity = 'sanction' AND entity_id = CAST(@t_mute AS CHAR) AND action = 'lift' AND actor_id = 9
                   AND JSON_UNQUOTE(JSON_EXTRACT(new_value, '$.reason')) = 'appealed'), 'PASS', 'FAIL'), NULL;
-- ck_sn_period needs ends_at > starts_at, so a mute lifted in its own second still reads as active to trg_message_bi until
-- the next second; only this chat probe waits for that (the status recompute no longer does).
DO SLEEP(1.1);
INSERT INTO message (sender_id, session_id, content) VALUES (12, 1, 'probe after lift');
INSERT INTO tmp_test_results SELECT 'MOD: after lifting a mute the user can post in session chat',
  IF(EXISTS (SELECT 1 FROM message WHERE message_id > @m_m0 AND sender_id = 12 AND content = 'probe after lift'), 'PASS', 'FAIL'), NULL;
CALL t_expect_msg('MOD: lift a sanction that already ended', CONCAT('CALL sp_lift_sanction(9, ', @t_mute, ', ''again'')'), 'That sanction has already ended.');

-- rank rules for lifting
CALL sp_issue_sanction(10, 12, 'mute', 'admin issued mute', UTC_TIMESTAMP() + INTERVAL 1 DAY, NULL, @t_amute);
CALL t_expect_msg('MOD: moderator lifts a sanction an admin issued', CONCAT('CALL sp_lift_sanction(9, ', @t_amute, ', ''pardon'')'), 'You cannot lift a sanction issued by a higher-ranked staff member.');
CALL sp_lift_sanction(10, @t_amute, 'admin lifts own');
INSERT INTO tmp_test_results SELECT 'MOD: an admin can lift a sanction an admin issued',
  IF(EXISTS (SELECT 1 FROM sanction WHERE sanction_id = @t_amute AND ends_at <= UTC_TIMESTAMP() + INTERVAL 1 SECOND), 'PASS', 'FAIL'), NULL;
CALL sp_grant_role(10, 3, 'moderator');                       -- a second moderator, the target of a staff sanction
CALL sp_issue_sanction(10, 3, 'warn', 'staff warning', NULL, NULL, @t_swarn);
CALL t_expect_msg('MOD: moderator cannot lift a sanction on staff', CONCAT('CALL sp_lift_sanction(9, ', @t_swarn, ', ''pardon'')'), 'Moderators cannot lift sanctions on staff.');
CALL sp_lift_sanction(10, @t_swarn, 'warning withdrawn');
CALL sp_revoke_role(10, 3, 'moderator');

-- suspend then lift restores active and the trust score
CALL sp_issue_sanction(9, 12, 'suspend', 'repeat offender', UTC_TIMESTAMP() + INTERVAL 1 DAY, NULL, @t_susp);
INSERT INTO tmp_test_results SELECT 'MOD: a suspension flips the user to suspended',
  IF((SELECT status FROM users WHERE user_id = 12) = 'suspended', 'PASS', 'FAIL'), NULL;
CALL sp_lift_sanction(9, @t_susp, 'served enough');           -- immediately: the lifted sanction is excluded from the recompute
INSERT INTO tmp_test_results SELECT 'MOD: lifting the suspension immediately restores active, trust and an audited status change',
  IF((SELECT status FROM users WHERE user_id = 12) = 'active' AND (SELECT trust_score FROM users WHERE user_id = 12) = @m_ts12
     AND EXISTS (SELECT 1 FROM audit_log WHERE log_id > @m_a0 AND entity = 'users' AND entity_id = '12' AND action = 'status_change' AND actor_id = 9
                   AND JSON_UNQUOTE(JSON_EXTRACT(new_value, '$.status')) = 'active'), 'PASS', 'FAIL'), NULL;
CALL sp_expire_sanctions();
INSERT INTO tmp_test_results SELECT 'MOD: sp_expire_sanctions after a lift leaves the user active',
  IF((SELECT status FROM users WHERE user_id = 12) = 'active', 'PASS', 'FAIL'), NULL;

-- ban, suspension on top, lift rules
CALL sp_issue_sanction(10, 12, 'ban', 'cheating', NULL, NULL, @t_ban);
CALL sp_issue_sanction(10, 12, 'suspend', 'extra', UTC_TIMESTAMP() + INTERVAL 1 DAY, NULL, @t_susp2);
CALL sp_lift_sanction(10, @t_susp2, 'extra not needed');
INSERT INTO tmp_test_results SELECT 'MOD: lifting a suspension under a ban keeps the user banned',
  IF((SELECT status FROM users WHERE user_id = 12) = 'banned', 'PASS', 'FAIL'), NULL;
CALL t_expect_msg('MOD: moderator lifts a ban', CONCAT('CALL sp_lift_sanction(9, ', @t_ban, ', ''pardon'')'), 'Only admins can lift a ban.');
CALL sp_lift_sanction(10, @t_ban, 'pardoned');
INSERT INTO tmp_test_results SELECT 'MOD: admin lifting the ban restores active',
  IF((SELECT status FROM users WHERE user_id = 12) = 'active', 'PASS', 'FAIL'), NULL;

-- roles: grant and revoke with their audit rows, admin rank rules
CALL sp_grant_role(10, 9, 'admin');
INSERT INTO tmp_test_results SELECT 'MOD: sp_grant_role adds the role and audits the grant',
  IF(fn_staff_rank(9) = 2 AND EXISTS (SELECT 1 FROM audit_log WHERE log_id > @m_a0 AND entity = 'user_role' AND entity_id = '9' AND action = 'grant' AND actor_id = 10), 'PASS', 'FAIL'), NULL;
CALL t_expect_msg('MOD: admin sanctions another admin', "CALL sp_issue_sanction(10, 9, 'warn', 'oops', NULL, NULL, @t_sid)", 'Admins cannot sanction another admin.');
CALL t_expect_msg('MOD: admin revokes own admin role',  "CALL sp_revoke_role(10, 10, 'admin')", 'You cannot remove your own admin role.');
CALL sp_revoke_role(10, 9, 'admin');
INSERT INTO tmp_test_results SELECT 'MOD: sp_revoke_role removes the role and audits the revoke',
  IF(fn_staff_rank(9) = 1 AND EXISTS (SELECT 1 FROM audit_log WHERE log_id > @m_a0 AND entity = 'user_role' AND entity_id = '9' AND action = 'revoke' AND actor_id = 10
                   AND JSON_UNQUOTE(JSON_EXTRACT(old_value, '$.role')) = 'admin'), 'PASS', 'FAIL'), NULL;
INSERT INTO user_role (user_id, role_id, assigned_by) VALUES (11, 3, 10);   -- a suspended second admin does not count
CALL t_expect_msg('MOD: revoke an admin when no other admin is active', "CALL sp_revoke_role(10, 11, 'admin')", 'You cannot remove the last admin.');
DELETE FROM user_role WHERE user_id = 11 AND role_id = 3;

-- hold, takeover and resolve with a note
CALL sp_report_user(2, 8, 'cheating', NULL, 3, NULL, @t_r3);
CALL sp_claim_report(9, @t_r3);
CALL sp_grant_role(10, 3, 'moderator');                       -- a second moderator (removed again below)
CALL sp_report_user(2, 12, 'harassment', NULL, NULL, NULL, @t_r7);
CALL sp_claim_report(9, @t_r7);
CALL sp_issue_sanction(10, 12, 'warn', 'admin acts on a held report', NULL, @t_r7, @t_w7);
INSERT INTO tmp_test_results SELECT 'MOD: sp_issue_sanction on a report held by another moderator audits the takeover',
  IF(EXISTS (SELECT 1 FROM audit_log WHERE log_id > @m_a0 AND entity = 'report' AND entity_id = CAST(@t_r7 AS CHAR) AND action = 'takeover' AND actor_id = 10
               AND JSON_EXTRACT(old_value, '$.handled_by') = 9 AND JSON_EXTRACT(new_value, '$.handled_by') = 10), 'PASS', 'FAIL'), NULL;
CALL t_expect_msg('MOD: another moderator cannot take a held report', CONCAT('CALL sp_claim_report(3, ', @t_r3, ')'), 'Another moderator already holds this report.');
CALL sp_claim_report(10, @t_r3);
INSERT INTO tmp_test_results SELECT 'MOD: an admin can take over a held report and it is audited',
  IF(EXISTS (SELECT 1 FROM report WHERE report_id = @t_r3 AND status = 'reviewing' AND handled_by = 10)
     AND EXISTS (SELECT 1 FROM audit_log WHERE log_id > @m_a0 AND entity = 'report' AND entity_id = CAST(@t_r3 AS CHAR) AND action = 'takeover' AND actor_id = 10), 'PASS', 'FAIL'), NULL;
CALL t_expect_msg('MOD: a moderator cannot resolve a report held by another', CONCAT('CALL sp_resolve_report(9, ', @t_r3, ', ''dismissed'', NULL)'), 'Another moderator already holds this report.');
CALL t_expect_msg('MOD: resolve note over 500 characters', CONCAT('CALL sp_resolve_report(10, ', @t_r3, ', ''dismissed'', REPEAT(''a'', 501))'), 'The note must be 500 characters or fewer.');
CALL sp_resolve_report(10, @t_r3, 'dismissed', '  no evidence  ');
INSERT INTO tmp_test_results SELECT 'MOD: resolve dismisses, sets resolved_at and puts the note in the status_change audit row',
  IF(EXISTS (SELECT 1 FROM report WHERE report_id = @t_r3 AND status = 'dismissed' AND handled_by = 10 AND resolved_at IS NOT NULL)
     AND EXISTS (SELECT 1 FROM audit_log WHERE log_id > @m_a0 AND entity = 'report' AND entity_id = CAST(@t_r3 AS CHAR) AND action = 'status_change'
                   AND JSON_UNQUOTE(JSON_EXTRACT(new_value, '$.status')) = 'dismissed' AND JSON_UNQUOTE(JSON_EXTRACT(new_value, '$.note')) = 'no evidence'), 'PASS', 'FAIL'), NULL;
CALL sp_revoke_role(10, 3, 'moderator');

-- message moderation
SELECT MAX(message_id) INTO @t_m12 FROM message WHERE sender_id = 12 AND content = 'probe after lift';
CALL t_expect_msg('MOD: hide your own message', CONCAT('CALL sp_moderate_message(9, ', @t_own, ', TRUE, NULL)'), 'You cannot moderate your own message.');
CALL t_expect_msg('MOD: hide a message with a report about a different message and player', CONCAT('CALL sp_moderate_message(9, 4, TRUE, ', @t_r1, ')'), 'That report is about a different message.');
CALL t_expect_msg('MOD: hide with a report you filed',   CONCAT('CALL sp_moderate_message(9, ', @t_m12, ', TRUE, ', @t_r4, ')'), 'You cannot handle a report you filed or are the subject of.');
CALL t_expect_msg('MOD: hide with a report about you',   CONCAT('CALL sp_moderate_message(9, ', @t_m12, ', TRUE, ', @t_r6, ')'), 'You cannot handle a report you filed or are the subject of.');
CALL sp_moderate_message(9, @t_m12, TRUE, @t_r1);
INSERT INTO tmp_test_results SELECT 'MOD: sp_moderate_message hides a message and audits it without the text',
  IF((SELECT is_deleted FROM message WHERE message_id = @t_m12) = 1
     AND EXISTS (SELECT 1 FROM audit_log WHERE log_id > @m_a0 AND entity = 'message' AND entity_id = CAST(@t_m12 AS CHAR) AND action = 'hide' AND actor_id = 9
                   AND JSON_CONTAINS_PATH(new_value, 'one', '$.content', '$.body') = 0), 'PASS', 'FAIL'), NULL;
CALL t_expect_msg('MOD: hide a message already hidden', CONCAT('CALL sp_moderate_message(9, ', @t_m12, ', TRUE, NULL)'), 'That message is already hidden.');
CALL sp_moderate_message(9, @t_m12, FALSE, NULL);
INSERT INTO tmp_test_results SELECT 'MOD: sp_moderate_message restores a message and audits it',
  IF((SELECT is_deleted FROM message WHERE message_id = @t_m12) = 0
     AND EXISTS (SELECT 1 FROM audit_log WHERE log_id > @m_a0 AND entity = 'message' AND entity_id = CAST(@t_m12 AS CHAR) AND action = 'restore' AND actor_id = 9), 'PASS', 'FAIL'), NULL;

-- reporter daily cap (ten reports in 24 hours)
INSERT INTO report (reporter_id, reported_user_id, category, created_at)
  SELECT 6, 12, 'spam', UTC_TIMESTAMP() FROM information_schema.COLUMNS LIMIT 10;
CALL t_expect_msg('MOD: more than 10 reports in a day', "CALL sp_report_user(6, 8, 'spam', NULL, NULL, NULL, @t_rid)", 'You have sent too many reports today. Please try again tomorrow.');

INSERT INTO tmp_test_results SELECT 'MOD: successful moderation procedures leave @audit_actor NULL', IF(@audit_actor IS NULL, 'PASS', 'FAIL'), NULL;
INSERT INTO tmp_test_results SELECT 'MOD: audit rows never hold hashes or message bodies',
  IF(NOT EXISTS (SELECT 1 FROM audit_log WHERE log_id > @m_a0
       AND (JSON_SEARCH(new_value, 'one', '%argon2%') IS NOT NULL OR JSON_SEARCH(new_value, 'one', '%probe after lift%') IS NOT NULL
         OR JSON_SEARCH(new_value, 'one', '%mod own message%') IS NOT NULL
         OR JSON_SEARCH(old_value, 'one', '%argon2%') IS NOT NULL OR JSON_SEARCH(old_value, 'one', '%probe after lift%') IS NOT NULL
         OR JSON_SEARCH(old_value, 'one', '%mod own message%') IS NOT NULL
         OR JSON_CONTAINS_PATH(new_value, 'one', '$.content', '$.body', '$.password_hash', '$.token_hash') = 1
         OR JSON_CONTAINS_PATH(old_value, 'one', '$.content', '$.body', '$.password_hash', '$.token_hash') = 1)), 'PASS', 'FAIL'), NULL;

START TRANSACTION;                                            -- t_probe's duplicate-key INSERT mixes InnoDB and the MEMORY result table outside one
-- grant probes: the four direct grants are gone, the procedures are granted to the right roles only
CALL t_probe('RBAC: pairadice_player has no INSERT on report',
  "EXISTS (SELECT 1 FROM mysql.user WHERE User = 'pairadice_player') AND NOT EXISTS (SELECT 1 FROM information_schema.TABLE_PRIVILEGES WHERE LOCATE('pairadice_player', GRANTEE) > 0 AND TABLE_NAME = 'report' AND PRIVILEGE_TYPE = 'INSERT') AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMN_PRIVILEGES WHERE LOCATE('pairadice_player', GRANTEE) > 0 AND TABLE_NAME = 'report' AND PRIVILEGE_TYPE = 'INSERT')");
CALL t_probe('RBAC: pairadice_moderator has no INSERT on sanction and no UPDATE on report, but can read both',
  "EXISTS (SELECT 1 FROM mysql.user WHERE User = 'pairadice_moderator') AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMN_PRIVILEGES WHERE LOCATE('pairadice_moderator', GRANTEE) > 0 AND TABLE_NAME IN ('sanction', 'report') AND PRIVILEGE_TYPE IN ('INSERT', 'UPDATE')) AND NOT EXISTS (SELECT 1 FROM information_schema.TABLE_PRIVILEGES WHERE LOCATE('pairadice_moderator', GRANTEE) > 0 AND ((TABLE_NAME = 'sanction' AND PRIVILEGE_TYPE IN ('INSERT', 'UPDATE', 'DELETE')) OR (TABLE_NAME = 'report' AND PRIVILEGE_TYPE IN ('INSERT', 'UPDATE', 'DELETE')))) AND EXISTS (SELECT 1 FROM information_schema.TABLE_PRIVILEGES WHERE LOCATE('pairadice_moderator', GRANTEE) > 0 AND TABLE_NAME = 'sanction' AND PRIVILEGE_TYPE = 'SELECT') AND EXISTS (SELECT 1 FROM information_schema.TABLE_PRIVILEGES WHERE LOCATE('pairadice_moderator', GRANTEE) > 0 AND TABLE_NAME = 'report' AND PRIVILEGE_TYPE = 'SELECT')");
CALL t_probe('RBAC: pairadice_moderator has no UPDATE on message.is_deleted',
  "EXISTS (SELECT 1 FROM mysql.user WHERE User = 'pairadice_moderator') AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMN_PRIVILEGES WHERE LOCATE('pairadice_moderator', GRANTEE) > 0 AND TABLE_NAME = 'message' AND PRIVILEGE_TYPE = 'UPDATE') AND NOT EXISTS (SELECT 1 FROM information_schema.TABLE_PRIVILEGES WHERE LOCATE('pairadice_moderator', GRANTEE) > 0 AND TABLE_NAME = 'message' AND PRIVILEGE_TYPE = 'UPDATE')");
CALL t_probe('RBAC: pairadice_player can EXECUTE the report procedures but not the moderator ones',
  "(SELECT COUNT(*) FROM mysql.procs_priv WHERE User = 'pairadice_player' AND Routine_name IN ('sp_report_user', 'sp_my_reports') AND FIND_IN_SET('Execute', Proc_priv) > 0) = 2 AND NOT EXISTS (SELECT 1 FROM mysql.procs_priv WHERE User = 'pairadice_player' AND Routine_name IN ('sp_issue_sanction', 'sp_lift_sanction', 'sp_claim_report', 'sp_resolve_report', 'sp_moderate_message', 'sp_grant_role', 'sp_revoke_role'))");
CALL t_probe('RBAC: pairadice_moderator can EXECUTE the moderation procedures but not the role procedures',
  "(SELECT COUNT(*) FROM mysql.procs_priv WHERE User = 'pairadice_moderator' AND Routine_name IN ('sp_claim_report', 'sp_resolve_report', 'sp_issue_sanction', 'sp_lift_sanction', 'sp_moderate_message', 'sp_expire_sanctions') AND FIND_IN_SET('Execute', Proc_priv) > 0) = 6 AND NOT EXISTS (SELECT 1 FROM mysql.procs_priv WHERE User = 'pairadice_moderator' AND Routine_name IN ('sp_grant_role', 'sp_revoke_role'))");
ROLLBACK;
INSERT INTO tmp_test_results SELECT 'MOD: ev_expire_sanctions is scheduled every 5 minutes',
  IF(EXISTS (SELECT 1 FROM information_schema.EVENTS WHERE EVENT_SCHEMA = 'pairadice' AND EVENT_NAME = 'ev_expire_sanctions'
               AND INTERVAL_VALUE = '5' AND INTERVAL_FIELD = 'MINUTE' AND EVENT_DEFINITION LIKE '%sp_expire_sanctions%'), 'PASS', 'FAIL'), NULL;

-- restore everything the moderation tests created or changed
DELETE FROM sanction  WHERE sanction_id > @m_s0;
DELETE FROM report    WHERE report_id > @m_r0;
DELETE FROM message   WHERE message_id > @m_m0;
DELETE FROM user_role WHERE (user_id = 3 AND role_id = 2) OR (user_id = 9 AND role_id = 3) OR (user_id = 11 AND role_id = 3);
UPDATE users SET status = @m_st12, trust_score = @m_ts12 WHERE user_id = 12;
UPDATE users SET status = @m_st9,  trust_score = @m_ts9  WHERE user_id = 9;
UPDATE users SET trust_score = @m_ts3  WHERE user_id = 3;
UPDATE users SET trust_score = @m_ts11 WHERE user_id = 11;
DELETE FROM embedding_outbox;                                 -- put the outbox back as it was before the moderation tests
INSERT INTO embedding_outbox SELECT * FROM m_outbox;
DROP TEMPORARY TABLE m_outbox;
DELETE FROM audit_log WHERE log_id > @m_a0;
INSERT INTO tmp_test_results SELECT 'CLEANUP: moderation test data is removed and users 9 and 12 are restored',
  IF((SELECT COUNT(*) FROM report) = @m_r0 AND (SELECT COUNT(*) FROM sanction) = 2 AND (SELECT is_deleted FROM message WHERE message_id = 4) = 0
     AND (SELECT status FROM users WHERE user_id = 12) = 'active' AND fn_staff_rank(3) = 0 AND fn_staff_rank(9) = 1 AND fn_staff_rank(10) = 2, 'PASS', 'FAIL'), NULL;

-- ---- Chat, DMs and reviews (13_chat.sql). These procedures COMMIT, so everything created below is deleted again at
-- the end (ids above the saved maxima, the two review rows by key) and the counters the review triggers move are restored.
-- The read procedures return result sets, which plain SQL cannot capture; their rules are covered by fn_dm_refusal
-- here and by the refusals below.
SELECT IFNULL(MAX(message_id), 0)  INTO @c_m0 FROM message;
SELECT IFNULL(MAX(sanction_id), 0) INTO @c_s0 FROM sanction;
SELECT IFNULL(MAX(log_id), 0)      INTO @c_a0 FROM audit_log;
SELECT COUNT(*) INTO @c_rv0 FROM review;
SELECT IFNULL(MAX(report_id), 0)   INTO @c_r0 FROM report;
SELECT review_count INTO @c_rc2 FROM users WHERE user_id = 2;
SELECT status INTO @c_st5 FROM users WHERE user_id = 5;
DROP TEMPORARY TABLE IF EXISTS c_outbox;
DROP TEMPORARY TABLE IF EXISTS c_users;
DROP TEMPORARY TABLE IF EXISTS c_badges;
CREATE TEMPORARY TABLE c_outbox AS SELECT * FROM embedding_outbox;
CREATE TEMPORARY TABLE c_users  AS SELECT user_id, avg_rating, review_count, trust_score FROM users;
CREATE TEMPORARY TABLE c_badges AS SELECT * FROM user_badge;

-- refusals: content
CALL t_expect_msg('CHAT: session message with a NULL actor',   "CALL sp_send_session_message(NULL, 1, 'hi', @t_cid)", 'Your account cannot do that right now.');
CALL t_expect_msg('CHAT: session message by a suspended actor', "CALL sp_send_session_message(11, 3, 'hi', @t_cid)", 'Your account cannot do that right now.');
CALL t_expect_msg('CHAT: empty session message',               "CALL sp_send_session_message(8, 1, '   ', @t_cid)", 'Write a message first.');
CALL t_expect_msg('CHAT: NULL session message',                "CALL sp_send_session_message(8, 1, NULL, @t_cid)", 'Write a message first.');
CALL t_expect_msg('CHAT: session message over 1000 characters', "CALL sp_send_session_message(8, 1, REPEAT('a', 1001), @t_cid)", 'Messages can be at most 1000 characters.');
CALL t_expect_msg('CHAT: empty DM',                            "CALL sp_send_dm(1, 8, '', @t_cid)", 'Write a message first.');
CALL t_expect_msg('CHAT: DM over 1000 characters',             "CALL sp_send_dm(1, 8, REPEAT('a', 1001), @t_cid)", 'Messages can be at most 1000 characters.');
-- refusals: who may talk where
CALL t_expect_msg('CHAT: session message to a camp you are not in', "CALL sp_send_session_message(6, 1, 'hi', @t_cid)", 'You are not in this camp.');
CALL t_expect_msg('CHAT: session message while only requested',     "CALL sp_send_session_message(2, 1, 'hi', @t_cid)", 'You are not in this camp.');
CALL t_expect_msg('CHAT: session message to an unknown camp',       "CALL sp_send_session_message(1, 99999, 'hi', @t_cid)", 'That camp does not exist.');
CALL t_expect_msg('CHAT: session message in a cancelled camp',      "CALL sp_send_session_message(6, 6, 'hi', @t_cid)", 'This camp was cancelled, so its chat is closed.');
CALL t_expect_msg('CHAT: history of a camp you are not in',         "CALL sp_chat_history(6, 1, NULL, 10)", 'You are not in this camp.');
CALL t_expect_msg('CHAT: history with a NULL actor',                "CALL sp_chat_history(NULL, 1, NULL, 10)", 'Your account cannot do that right now.');
CALL t_expect_msg('CHAT: DM to a stranger',                         "CALL sp_send_dm(1, 5, 'hi', @t_cid)", 'You can message friends and teammates only.');
CALL t_expect_msg('CHAT: DM across a block',                        "CALL sp_send_dm(1, 11, 'hi', @t_cid)", 'You cannot message this player.');
CALL t_expect_msg('CHAT: DM to yourself',                           "CALL sp_send_dm(1, 1, 'hi', @t_cid)", 'You cannot message yourself.');
CALL t_expect_msg('CHAT: DM to an unknown player',                  "CALL sp_send_dm(1, 99999, 'hi', @t_cid)", 'That player does not exist.');
CALL t_expect_msg('CHAT: DM thread with a NULL actor',              "CALL sp_dm_thread(NULL, 8, NULL, 10)", 'Your account cannot do that right now.');
CALL t_expect_msg('CHAT: DM inbox with a NULL actor',               "CALL sp_dm_inbox(NULL)", 'Your account cannot do that right now.');
CALL t_expect_msg('CHAT: delete someone else''s message',           "CALL sp_delete_own_message(1, 7)", 'You can only remove your own messages.');
CALL t_expect_msg('CHAT: delete an unknown message',                "CALL sp_delete_own_message(1, 99999)", 'That message does not exist.');
CALL t_expect_msg('CHAT: delete with a NULL actor',                 "CALL sp_delete_own_message(NULL, 6)", 'Your account cannot do that right now.');
INSERT INTO tmp_test_results SELECT 'CHAT: fn_dm_refusal (stranger, friends, teammates, blocked, self, unknown)',
  IF(fn_dm_refusal(1, 5) = 'You can message friends and teammates only.' AND fn_dm_refusal(1, 8) IS NULL AND fn_dm_refusal(12, 8) IS NULL
     AND fn_dm_refusal(1, 11) = 'You cannot message this player.' AND fn_dm_refusal(11, 1) = 'You cannot message this player.'
     AND fn_dm_refusal(1, 1) = 'You cannot message yourself.' AND fn_dm_refusal(1, 99999) = 'That player does not exist.', 'PASS', 'FAIL'), NULL;
-- refusals: reviews
CALL t_expect_msg('CHAT: review with a NULL actor',           "CALL sp_write_review(NULL, 4, 2, 5, NULL)", 'Your account cannot do that right now.');
CALL t_expect_msg('CHAT: review rating 0',                    "CALL sp_write_review(1, 4, 2, 0, NULL)", 'Choose a rating from 1 to 5 stars.');
CALL t_expect_msg('CHAT: review rating 6',                    "CALL sp_write_review(1, 4, 2, 6, NULL)", 'Choose a rating from 1 to 5 stars.');
CALL t_expect_msg('CHAT: review rating NULL',                 "CALL sp_write_review(1, 4, 2, NULL, NULL)", 'Choose a rating from 1 to 5 stars.');
CALL t_expect_msg('CHAT: review comment over 500 characters', "CALL sp_write_review(1, 4, 2, 5, REPEAT('a', 501))", 'The comment must be 500 characters or fewer.');
CALL t_expect_msg('CHAT: review yourself',                    "CALL sp_write_review(1, 4, 1, 5, NULL)", 'You cannot review yourself.');
CALL t_expect_msg('CHAT: review in a camp that is not completed', "CALL sp_write_review(1, 1, 8, 5, NULL)", 'You can review a camp only after it is completed.');
CALL t_expect_msg('CHAT: review a camp that does not exist',  "CALL sp_write_review(1, 99999, 8, 5, NULL)", 'That camp does not exist.');
CALL t_expect_msg('CHAT: review without having played',       "CALL sp_write_review(5, 4, 1, 5, NULL)", 'Only players who both played in this camp can review each other.');
CALL t_expect_msg('CHAT: review a player who did not play',   "CALL sp_write_review(1, 4, 12, 5, NULL)", 'Only players who both played in this camp can review each other.');
CALL t_expect_msg('CHAT: review the same player twice',       "CALL sp_write_review(1, 4, 7, 4, NULL)", 'You already reviewed this player for this camp.');
CALL t_expect_msg('CHAT: pending reviews with a NULL actor',  "CALL sp_pending_reviews(NULL, 4)", 'Your account cannot do that right now.');

-- behaviour: session chat
CALL sp_send_session_message(8, 1, '  hello camp  ', @t_c1);
INSERT INTO tmp_test_results SELECT 'CHAT: session message is trimmed, stored for the actor and returned in the OUT parameter',
  IF(EXISTS (SELECT 1 FROM message WHERE message_id = @t_c1 AND sender_id = 8 AND session_id = 1 AND receiver_id IS NULL
               AND content = 'hello camp' AND is_deleted = 0), 'PASS', 'FAIL'), NULL;
CALL sp_send_session_message(12, 1, REPEAT('a', 1000), @t_c2);
INSERT INTO tmp_test_results SELECT 'CHAT: a message of exactly 1000 characters is accepted and ids increase',
  IF(@t_c2 > @t_c1 AND (SELECT CHAR_LENGTH(content) FROM message WHERE message_id = @t_c2) = 1000, 'PASS', 'FAIL'), NULL;
CALL sp_send_session_message(1, 3, 'gg', @t_c3);
INSERT INTO tmp_test_results SELECT 'CHAT: a completed camp stays writable',
  IF(EXISTS (SELECT 1 FROM message WHERE message_id = @t_c3 AND session_id = 3 AND sender_id = 1), 'PASS', 'FAIL'), NULL;

-- behaviour: DMs and soft delete
CALL sp_send_dm(12, 8, 'teammate DM', @t_d1);
INSERT INTO tmp_test_results SELECT 'CHAT: teammates who are not friends can DM',
  IF(EXISTS (SELECT 1 FROM message WHERE message_id = @t_d1 AND sender_id = 12 AND receiver_id = 8 AND session_id IS NULL AND content = 'teammate DM'), 'PASS', 'FAIL'), NULL;
CALL sp_send_dm(1, 8, 'friend DM', @t_d2);
INSERT INTO tmp_test_results SELECT 'CHAT: friends can DM',
  IF(EXISTS (SELECT 1 FROM message WHERE message_id = @t_d2 AND sender_id = 1 AND receiver_id = 8), 'PASS', 'FAIL'), NULL;
CALL sp_delete_own_message(8, @t_c1);
INSERT INTO tmp_test_results SELECT 'CHAT: deleting your own message is a soft delete',
  IF(EXISTS (SELECT 1 FROM message WHERE message_id = @t_c1 AND is_deleted = 1 AND content = 'hello camp'), 'PASS', 'FAIL'), NULL;
CALL t_expect_msg('CHAT: delete a message twice', CONCAT('CALL sp_delete_own_message(8, ', @t_c1, ')'), 'That message is already removed.');
INSERT INTO tmp_test_results SELECT 'CHAT: deleting your own message writes a message/delete_own audit row without a body',
  IF((SELECT COUNT(*) FROM audit_log WHERE log_id > @c_a0 AND entity = 'message' AND entity_id = CAST(@t_c1 AS CHAR) AND action = 'delete_own'
        AND actor_id = 8 AND old_value IS NULL AND new_value IS NULL) = 1, 'PASS', 'FAIL'), NULL;
-- whitespace, zero-width characters and NBSP count as empty
CALL t_expect_msg('CHAT: zero-width and NBSP only session message', "CALL sp_send_session_message(8, 1, CONVERT(0xE2808BC2A0E2808CE2808DEFBBBF20 USING utf8mb4), @t_cid)", 'Write a message first.');
CALL t_expect_msg('CHAT: zero-width and NBSP only DM',              "CALL sp_send_dm(1, 8, CONVERT(0xC2A0EFBBBFE2808B USING utf8mb4), @t_cid)", 'Write a message first.');
-- a reported or moderated message cannot be removed by its sender
CALL sp_send_session_message(8, 1, 'reported line', @t_rp);
INSERT INTO report (reporter_id, reported_user_id, session_id, message_id, category) VALUES (1, 8, 1, @t_rp, 'spam');
SET @t_rpid = LAST_INSERT_ID();
CALL t_expect_msg('CHAT: delete a message with an open report', CONCAT('CALL sp_delete_own_message(8, ', @t_rp, ')'), 'This message is part of a report and cannot be removed right now.');
UPDATE report SET status = 'reviewing' WHERE report_id = @t_rpid;
CALL t_expect_msg('CHAT: delete a message with a report under review', CONCAT('CALL sp_delete_own_message(8, ', @t_rp, ')'), 'This message is part of a report and cannot be removed right now.');
UPDATE report SET status = 'dismissed', resolved_at = UTC_TIMESTAMP() WHERE report_id = @t_rpid;
CALL sp_delete_own_message(8, @t_rp);
INSERT INTO tmp_test_results SELECT 'CHAT: a message whose report was dismissed can be removed',
  IF((SELECT is_deleted FROM message WHERE message_id = @t_rp) = 1, 'PASS', 'FAIL'), NULL;
CALL sp_send_session_message(8, 1, 'moderated line', @t_mp);
INSERT INTO audit_log (actor_id, entity, entity_id, action) VALUES (9, 'message', @t_mp, 'hide');
INSERT INTO audit_log (actor_id, entity, entity_id, action) VALUES (9, 'message', @t_mp, 'restore');
CALL t_expect_msg('CHAT: delete a message a moderator has acted on', CONCAT('CALL sp_delete_own_message(8, ', @t_mp, ')'), 'A moderator has reviewed this message.');
INSERT INTO tmp_test_results SELECT 'CHAT: the refused delete left the moderated message visible',
  IF((SELECT is_deleted FROM message WHERE message_id = @t_mp) = 0, 'PASS', 'FAIL'), NULL;

-- banned receiver
UPDATE users SET status = 'banned' WHERE user_id = 5;
CALL t_expect_msg('CHAT: DM to a banned player', "CALL sp_send_dm(6, 5, 'hi', @t_cid)", 'You cannot message this player.');
UPDATE users SET status = @c_st5 WHERE user_id = 5;

-- mute
INSERT INTO sanction (user_id, sanction_type, reason, issued_by, starts_at, ends_at)
  VALUES (12, 'mute', 'chat test', 9, UTC_TIMESTAMP() - INTERVAL 1 MINUTE, UTC_TIMESTAMP() + INTERVAL 1 HOUR);
CALL t_expect_msg('CHAT: muted actor in session chat', "CALL sp_send_session_message(12, 1, 'hi', @t_cid)", 'You are muted%');
CALL t_expect_msg('CHAT: muted actor in a DM',         "CALL sp_send_dm(12, 8, 'hi', @t_cid)", 'You are muted%');
DELETE FROM sanction WHERE sanction_id > @c_s0;

-- block refuses in both directions
INSERT INTO user_block (blocker_id, blocked_id, reason) VALUES (8, 12, 'chat test');
CALL t_expect_msg('CHAT: DM after the receiver blocked the sender', "CALL sp_send_dm(12, 8, 'hi', @t_cid)", 'You cannot message this player.');
CALL t_expect_msg('CHAT: DM after the sender blocked the receiver', "CALL sp_send_dm(8, 12, 'hi', @t_cid)", 'You cannot message this player.');
DELETE FROM user_block WHERE blocker_id = 8 AND blocked_id = 12;

-- rate limit: 20 lines in the window for user 3, then both chat and DM are refused
INSERT INTO message (sender_id, session_id, content, sent_at)
  SELECT 3, 7, 'rate probe', UTC_TIMESTAMP() FROM information_schema.COLUMNS LIMIT 20;
CALL t_expect_msg('CHAT: 21st session message in 30 seconds', "CALL sp_send_session_message(3, 7, 'one more', @t_cid)", 'You are sending messages too fast. Wait a moment.');
CALL t_expect_msg('CHAT: DM counts toward the same limit',    "CALL sp_send_dm(3, 4, 'one more', @t_cid)", 'You are sending messages too fast. Wait a moment.');
UPDATE message SET sent_at = UTC_TIMESTAMP() - INTERVAL 1 MINUTE WHERE message_id > @c_m0 AND sender_id = 3 AND content = 'rate probe';
CALL sp_send_session_message(3, 7, 'after the window', @t_c5);
INSERT INTO tmp_test_results SELECT 'CHAT: sending works again once the window has passed',
  IF(EXISTS (SELECT 1 FROM message WHERE message_id = @t_c5 AND sender_id = 3), 'PASS', 'FAIL'), NULL;

-- reviews
CALL sp_write_review(8, 4, 2, 5, '  great teammate  ');
CALL sp_write_review(1, 4, 2, 4, '   ');
CALL t_expect_msg('CHAT: review again after writing it', "CALL sp_write_review(8, 4, 2, 3, NULL)", 'You already reviewed this player for this camp.');
INSERT INTO tmp_test_results SELECT 'CHAT: review is stored with the trimmed comment, empty comment becomes NULL',
  IF((SELECT comment_text FROM review WHERE session_id = 4 AND reviewer_id = 8 AND reviewed_id = 2) = 'great teammate'
     AND (SELECT comment_text FROM review WHERE session_id = 4 AND reviewer_id = 1 AND reviewed_id = 2) IS NULL, 'PASS', 'FAIL'), NULL;
INSERT INTO tmp_test_results SELECT 'CHAT: sp_write_review refreshes users.avg_rating and review_count through the triggers',
  IF((SELECT review_count FROM users WHERE user_id = 2) = (SELECT COUNT(*) FROM review WHERE reviewed_id = 2)
     AND (SELECT review_count FROM users WHERE user_id = 2) = (SELECT review_count FROM c_users WHERE user_id = 2) + 2
     AND (SELECT avg_rating FROM users WHERE user_id = 2) = (SELECT ROUND(AVG(rating), 2) FROM review WHERE reviewed_id = 2), 'PASS', 'FAIL'), NULL;

START TRANSACTION;                                            -- t_probe's duplicate-key INSERT mixes InnoDB and the MEMORY result table outside one
CALL t_probe('RBAC: pairadice_player has no SELECT or INSERT on message and no INSERT on review, but can still read review',
  "EXISTS (SELECT 1 FROM mysql.user WHERE User = 'pairadice_player') AND NOT EXISTS (SELECT 1 FROM information_schema.TABLE_PRIVILEGES WHERE LOCATE('pairadice_player', GRANTEE) > 0 AND TABLE_NAME = 'message') AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMN_PRIVILEGES WHERE LOCATE('pairadice_player', GRANTEE) > 0 AND TABLE_NAME = 'message') AND NOT EXISTS (SELECT 1 FROM information_schema.TABLE_PRIVILEGES WHERE LOCATE('pairadice_player', GRANTEE) > 0 AND TABLE_NAME = 'review' AND PRIVILEGE_TYPE = 'INSERT') AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMN_PRIVILEGES WHERE LOCATE('pairadice_player', GRANTEE) > 0 AND TABLE_NAME = 'review' AND PRIVILEGE_TYPE = 'INSERT') AND EXISTS (SELECT 1 FROM information_schema.TABLE_PRIVILEGES WHERE LOCATE('pairadice_player', GRANTEE) > 0 AND TABLE_NAME = 'review' AND PRIVILEGE_TYPE = 'SELECT')");
CALL t_probe('RBAC: pairadice_moderator has SELECT on message but no write privilege on it',
  "EXISTS (SELECT 1 FROM mysql.user WHERE User = 'pairadice_moderator') AND EXISTS (SELECT 1 FROM information_schema.TABLE_PRIVILEGES WHERE LOCATE('pairadice_moderator', GRANTEE) > 0 AND TABLE_NAME = 'message' AND PRIVILEGE_TYPE = 'SELECT') AND NOT EXISTS (SELECT 1 FROM information_schema.TABLE_PRIVILEGES WHERE LOCATE('pairadice_moderator', GRANTEE) > 0 AND TABLE_NAME = 'message' AND PRIVILEGE_TYPE IN ('INSERT', 'UPDATE', 'DELETE'))");
CALL t_probe('RBAC: pairadice_player can EXECUTE the ten chat procedures',
  "(SELECT COUNT(*) FROM mysql.procs_priv WHERE User = 'pairadice_player' AND Routine_name IN ('sp_send_session_message', 'sp_send_dm', 'sp_delete_own_message', 'sp_write_review', 'sp_chat_history', 'sp_dm_thread', 'sp_dm_inbox', 'sp_dm_can_message', 'sp_my_chat_status', 'sp_pending_reviews') AND FIND_IN_SET('Execute', Proc_priv) > 0) = 10");
ROLLBACK;

-- restore everything the chat tests created or changed
DELETE FROM review    WHERE session_id = 4 AND reviewed_id = 2 AND reviewer_id IN (1, 8);
DELETE FROM report    WHERE report_id > @c_r0;
DELETE FROM message   WHERE message_id > @c_m0;
DELETE FROM sanction  WHERE sanction_id > @c_s0;
DELETE FROM user_block WHERE blocker_id = 8 AND blocked_id = 12;
UPDATE users SET status = @c_st5 WHERE user_id = 5;
UPDATE users u JOIN c_users c ON c.user_id = u.user_id
   SET u.avg_rating = c.avg_rating, u.review_count = c.review_count, u.trust_score = c.trust_score;
DELETE FROM user_badge WHERE (user_id, badge_id) NOT IN (SELECT user_id, badge_id FROM c_badges);
DELETE FROM embedding_outbox WHERE (entity, entity_id) NOT IN (SELECT entity, entity_id FROM c_outbox);   -- rows the tests queued
UPDATE embedding_outbox o JOIN c_outbox c ON c.entity = o.entity AND c.entity_id = o.entity_id             -- rows they re-queued
   SET o.op = c.op, o.enqueued_at = c.enqueued_at, o.attempts = c.attempts, o.last_error = c.last_error;
DROP TEMPORARY TABLE c_outbox;
DROP TEMPORARY TABLE c_users;
DROP TEMPORARY TABLE c_badges;
DELETE FROM audit_log WHERE log_id > @c_a0;
INSERT INTO tmp_test_results SELECT 'CLEANUP: chat test data is removed and user 2 stats are restored',
  IF((SELECT COUNT(*) FROM review) = @c_rv0 AND (SELECT COUNT(*) FROM message WHERE message_id > @c_m0) = 0
     AND (SELECT status FROM users WHERE user_id = 5) = @c_st5 AND (SELECT review_count FROM users WHERE user_id = 2) = @c_rc2, 'PASS', 'FAIL'), NULL;

-- ============================================================ Discord sign-in (14_discord.sql)
SELECT IFNULL(MAX(user_id), 0)    INTO @d_u0  FROM users;
SELECT IFNULL(MAX(auth_id), 0)    INTO @d_ar0 FROM auth_account;
SELECT IFNULL(MAX(log_id), 0)     INTO @d_a0  FROM audit_log;
SELECT COUNT(*) INTO @d_users0 FROM users;
SELECT COUNT(*) INTO @d_auth0  FROM auth_account;
SELECT COUNT(*) INTO @d_ur0    FROM user_role;
SELECT SUBSTRING_INDEX(email, '@', 1) INTO @d_local1 FROM auth_account WHERE user_id = 2 AND provider = 'email' LIMIT 1;

-- first sign-in creates the account, the second returns the same id
CALL sp_discord_login('200000000000000001', 'New Player', 'New Player', 'Asia/Kolkata', @d_n1);
CALL sp_discord_login('200000000000000001', 'Different Hint', 'Other Name', 'UTC', @d_n1b);
INSERT INTO tmp_test_results SELECT 'DISCORD: first login creates user, discord auth row and player role; repeat returns the same id',
  IF(@d_n1 > @d_u0 AND @d_n1 = @d_n1b
     AND (SELECT COUNT(*) FROM users WHERE user_id > @d_u0) = 1
     AND (SELECT username FROM users WHERE user_id = @d_n1) = 'new_player'
     AND (SELECT display_name FROM users WHERE user_id = @d_n1) = 'New Player'
     AND (SELECT timezone FROM users WHERE user_id = @d_n1) = 'Asia/Kolkata'
     AND (SELECT COUNT(*) FROM auth_account WHERE user_id = @d_n1 AND provider = 'discord' AND provider_user_id = '200000000000000001'
            AND email IS NULL AND password_hash IS NULL) = 1
     AND (SELECT COUNT(*) FROM user_role ur JOIN role r ON r.role_id = ur.role_id WHERE ur.user_id = @d_n1 AND r.role_name = 'player') = 1
     AND (SELECT COUNT(*) FROM user_role WHERE user_id = @d_n1) = 1, 'PASS', 'FAIL'), NULL;

-- username collision, and never linking to an existing email account
CALL sp_discord_login('200000000000000002', 'aarav_plays', '  ', 'Mars/Phobos', @d_n2);
INSERT INTO tmp_test_results SELECT 'DISCORD: hint aarav_plays becomes aarav_plays_2, blank display falls back to the username, bad timezone becomes UTC',
  IF(@d_n2 <> 1 AND (SELECT username FROM users WHERE user_id = @d_n2) = 'aarav_plays_2'
     AND (SELECT display_name FROM users WHERE user_id = @d_n2) = 'aarav_plays_2'
     AND (SELECT timezone FROM users WHERE user_id = @d_n2) = 'UTC', 'PASS', 'FAIL'), NULL;
CALL sp_discord_login('200000000000000003', 'aarav_plays', 'Aarav again', NULL, @d_n3);
INSERT INTO tmp_test_results SELECT 'DISCORD: a third hint aarav_plays becomes aarav_plays_3',
  IF((SELECT username FROM users WHERE user_id = @d_n3) = 'aarav_plays_3', 'PASS', 'FAIL'), NULL;
CALL sp_discord_login('200000000000000004', @d_local1, 'Email twin', 'UTC', @d_n4);
INSERT INTO tmp_test_results SELECT 'DISCORD: never links to the existing email account (email-only account, hint equal to its email local part)',
  IF(@d_local1 IS NOT NULL AND @d_n4 <> 2 AND @d_n2 <> 2 AND @d_n3 <> 2
     AND NOT EXISTS (SELECT 1 FROM auth_account WHERE user_id = 2 AND provider = 'discord')
     AND (SELECT COUNT(*) FROM auth_account WHERE user_id = 2) = 1, 'PASS', 'FAIL'), NULL;

-- hint sanitising
CALL sp_discord_login('200000000000000005', '  Cool   GUY!! ', 'Cool Guy', 'UTC', @d_s1);
CALL sp_discord_login('200000000000000006', 'ab', 'Tiny', 'UTC', @d_s2);
CALL sp_discord_login('200000000000000007', REPEAT('x', 60), 'Long', 'UTC', @d_s3);
CALL sp_discord_login('200000000000000008', CONCAT(_utf8mb4 0xE697A5E69CACE8AA9E, ' ', _utf8mb4 0xF09F9880), 'Unicode', 'UTC', @d_s4);
CALL sp_discord_login('200000000000000009', NULL, REPEAT('d', 64), 'UTC', @d_s5);
CALL sp_discord_login('200000000000000010', 'x', 'Short', 'UTC', @d_s6);
INSERT INTO tmp_test_results SELECT 'DISCORD: hints are lower-cased, odd characters become one underscore, short hints are padded, long ones cut to 24',
  IF((SELECT username FROM users WHERE user_id = @d_s1) = 'cool_guy'
     AND (SELECT username FROM users WHERE user_id = @d_s2) = 'abplayer'
     AND (SELECT username FROM users WHERE user_id = @d_s3) = REPEAT('x', 24)
     AND (SELECT username FROM users WHERE user_id = @d_s4) = 'player'
     AND (SELECT username FROM users WHERE user_id = @d_s5) = 'player_2'
     AND (SELECT username FROM users WHERE user_id = @d_s6) = 'xplayer', 'PASS', 'FAIL'), NULL;
INSERT INTO tmp_test_results SELECT 'DISCORD: every generated username matches the username rule; display names are at most 64 characters',
  IF((SELECT COUNT(*) FROM users WHERE user_id > @d_u0 AND username NOT REGEXP '^[A-Za-z0-9_]{3,32}$') = 0
     AND (SELECT CHAR_LENGTH(display_name) FROM users WHERE user_id = @d_s5) = 64, 'PASS', 'FAIL'), NULL;

-- banned refused, suspended allowed
UPDATE users SET status = 'banned' WHERE user_id = @d_s1;
CALL t_expect_msg('DISCORD: a banned account cannot sign in', "CALL sp_discord_login('200000000000000005', 'Cool Guy', 'Cool Guy', 'UTC', @d_x)", 'This account cannot sign in.');
UPDATE users SET status = 'suspended' WHERE user_id = @d_s1;
CALL sp_discord_login('200000000000000005', 'Cool Guy', 'Cool Guy', 'UTC', @d_s1b);
INSERT INTO tmp_test_results SELECT 'DISCORD: a suspended account may sign in (read-only in the app)', IF(@d_s1b = @d_s1, 'PASS', 'FAIL'), NULL;

-- bad snowflakes
CALL t_expect_msg('DISCORD: snowflake with letters refused',  "CALL sp_discord_login('12345678901234567a', 'x', 'x', 'UTC', @d_x)", 'That Discord account could not be used.');
CALL t_expect_msg('DISCORD: 16-digit snowflake refused',      "CALL sp_discord_login('1234567890123456', 'x', 'x', 'UTC', @d_x)", 'That Discord account could not be used.');
CALL t_expect_msg('DISCORD: 21-digit snowflake refused',      "CALL sp_discord_login('123456789012345678901', 'x', 'x', 'UTC', @d_x)", 'That Discord account could not be used.');
CALL t_expect_msg('DISCORD: empty snowflake refused',         "CALL sp_discord_login('', 'x', 'x', 'UTC', @d_x)", 'That Discord account could not be used.');
CALL t_expect_msg('DISCORD: NULL snowflake refused',          "CALL sp_discord_login(NULL, 'x', 'x', 'UTC', @d_x)", 'That Discord account could not be used.');
CALL t_expect_msg('DISCORD: snowflake with spaces or SQL characters refused', "CALL sp_discord_login('1234567890123456 7''--', 'x', 'x', 'UTC', @d_x)", 'That Discord account could not be used.');

-- audit row from trg_auth_account_ai holds no secret
INSERT INTO tmp_test_results SELECT 'DISCORD: trigger audit row exists for the new discord login and holds no secret',
  IF((SELECT COUNT(*) FROM audit_log a JOIN auth_account x ON a.entity_id = CAST(x.auth_id AS CHAR)
        WHERE a.log_id > @d_a0 AND a.entity = 'auth_account' AND a.action = 'login_method_added'
          AND x.user_id = @d_n1 AND x.provider = 'discord'
          AND JSON_UNQUOTE(JSON_EXTRACT(a.new_value, '$.provider')) = 'discord' AND JSON_LENGTH(a.new_value) = 2
          AND CAST(a.new_value AS CHAR) NOT LIKE '%hash%' AND CAST(a.new_value AS CHAR) NOT LIKE '%argon%'
          AND CAST(a.new_value AS CHAR) NOT LIKE '%200000000000000001%') = 1, 'PASS', 'FAIL'), NULL;

START TRANSACTION;
CALL t_probe('RBAC: pairadice_auth can EXECUTE sp_discord_login; pairadice_web_ro and pairadice_player cannot',
  "EXISTS (SELECT 1 FROM mysql.user WHERE User = 'pairadice_auth') AND EXISTS (SELECT 1 FROM mysql.user WHERE User = 'pairadice_web_ro') AND EXISTS (SELECT 1 FROM mysql.user WHERE User = 'pairadice_player') AND EXISTS (SELECT 1 FROM mysql.procs_priv WHERE User = 'pairadice_auth' AND Routine_name = 'sp_discord_login' AND FIND_IN_SET('Execute', Proc_priv) > 0) AND NOT EXISTS (SELECT 1 FROM mysql.procs_priv WHERE User IN ('pairadice_web_ro', 'pairadice_player') AND Routine_name = 'sp_discord_login')");
ROLLBACK;

-- restore everything the Discord tests created
DELETE FROM user_role    WHERE user_id > @d_u0;
DELETE FROM auth_account WHERE auth_id > @d_ar0;
DELETE FROM users        WHERE user_id > @d_u0;
DELETE FROM embedding_outbox WHERE entity = 'player' AND entity_id > @d_u0;
DELETE FROM audit_log    WHERE log_id > @d_a0;
INSERT INTO tmp_test_results SELECT 'CLEANUP: Discord test users, logins, roles, audit and outbox rows are removed',
  IF((SELECT COUNT(*) FROM users) = @d_users0 AND (SELECT COUNT(*) FROM auth_account) = @d_auth0
     AND (SELECT COUNT(*) FROM user_role) = @d_ur0 AND (SELECT COUNT(*) FROM audit_log WHERE log_id > @d_a0) = 0
     AND (SELECT COUNT(*) FROM embedding_outbox WHERE entity = 'player' AND entity_id > @d_u0) = 0, 'PASS', 'FAIL'), NULL;

SELECT * FROM tmp_test_results;
SELECT SUM(result = 'PASS') AS passed, COUNT(*) AS total FROM tmp_test_results;
DROP PROCEDURE t_probe;
DROP PROCEDURE t_expect_msg;
DROP PROCEDURE t_expect_error;
