SET NAMES utf8mb4;
SET time_zone = '+00:00';   -- all DATETIME columns are UTC
-- PairADice sign-up. Run after 01_schema.sql and 02_routines.sql, before 04_rbac.sql (which grants
-- EXECUTE on this procedure to pairadice_auth).
-- Creating an account touches three tables (users, auth_account, user_role). Doing it in one procedure
-- keeps it atomic and lets the sign-in login hold EXECUTE here instead of INSERT on users / user_role,
-- so a compromised web server still cannot hand anyone the moderator or admin role.
USE pairadice;

DROP PROCEDURE IF EXISTS sp_register_user;

DELIMITER $$

CREATE PROCEDURE sp_register_user(IN  p_username      VARCHAR(32),
                                  IN  p_display_name  VARCHAR(64),
                                  IN  p_timezone      VARCHAR(64),
                                  IN  p_email         VARCHAR(254),
                                  IN  p_password_hash VARCHAR(255),
                                  OUT p_user_id       BIGINT UNSIGNED)
BEGIN                                                        -- new email/password account with the player role
  DECLARE v_email  VARCHAR(254) DEFAULT LOWER(TRIM(p_email));
  DECLARE v_player TINYINT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  IF p_username IS NULL OR p_username NOT REGEXP '^[A-Za-z0-9_]{3,32}$' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Username must be 3-32 letters, digits or underscores';
  END IF;
  IF p_display_name IS NULL OR CHAR_LENGTH(TRIM(p_display_name)) = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Display name is required';
  END IF;
  IF v_email IS NULL OR v_email NOT REGEXP '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Enter a valid email address';
  END IF;

  START TRANSACTION;
  IF EXISTS (SELECT 1 FROM users WHERE username = p_username) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That username is taken';
  END IF;
  IF EXISTS (SELECT 1 FROM auth_account WHERE email = v_email) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That email already has an account';
  END IF;
  SELECT role_id INTO v_player FROM role WHERE role_name = 'player';

  INSERT INTO users (username, display_name, timezone)
  VALUES (p_username, TRIM(p_display_name), COALESCE(NULLIF(p_timezone, ''), 'UTC'));
  SET p_user_id = LAST_INSERT_ID();
  INSERT INTO auth_account (user_id, provider, email, password_hash)    -- CHECK rejects a non-argon2id/bcrypt hash
  VALUES (p_user_id, 'email', v_email, p_password_hash);
  INSERT INTO user_role (user_id, role_id) VALUES (p_user_id, v_player);  -- assigned_by NULL: self sign-up
  COMMIT;
END$$

DELIMITER ;
