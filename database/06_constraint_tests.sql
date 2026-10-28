-- PairADice constraint tests: every statement below MUST be rejected.
-- Runs inside a transaction that is rolled back, so the data is unchanged afterwards.
-- Usage: mysql -u root -p < 06_constraint_tests.sql
USE pairadice;

DROP PROCEDURE IF EXISTS t_expect_error;
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
CALL t_expect_error('PROC: accept into a full session',   "CALL sp_accept_participant(5, 12, 7)");
CALL t_expect_error('PROC: non-host accepts a player',    "CALL sp_accept_participant(10, 1, 8)");
ROLLBACK;

SELECT * FROM tmp_test_results;
SELECT SUM(result = 'PASS') AS passed, COUNT(*) AS total FROM tmp_test_results;
DROP PROCEDURE t_expect_error;
