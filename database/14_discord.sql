SET NAMES utf8mb4;
SET time_zone = '+00:00';   -- all DATETIME columns are UTC
-- PairADice Discord sign-in. Run after 01_schema.sql, 02_routines.sql and 08_auth.sql, before 04_rbac.sql
-- (which grants EXECUTE on this procedure to pairadice_auth only).
-- The web server has already verified the OAuth code exchange and passes the Discord snowflake id. This
-- procedure finds the account behind that id or creates user + auth_account + player role in one
-- transaction, like sp_register_user. It NEVER links by email or username: an existing account is found
-- only by (provider='discord', provider_user_id), so a Discord profile cannot take over another account.
-- Banned users are refused; suspended users may sign in (the app shows them read-only).
USE pairadice;

DROP PROCEDURE IF EXISTS sp_discord_login;

DELIMITER $$

CREATE PROCEDURE sp_discord_login(IN  p_discord_id    VARCHAR(32),
                                  IN  p_username_hint VARCHAR(64),
                                  IN  p_display_hint  VARCHAR(64),
                                  IN  p_timezone      VARCHAR(64),
                                  OUT p_user_id       BIGINT UNSIGNED)
BEGIN                                                        -- existing Discord account, or a new player account
  DECLARE v_base    VARCHAR(64);
  DECLARE v_name    VARCHAR(32);
  DECLARE v_display VARCHAR(64);
  DECLARE v_tz      VARCHAR(64) DEFAULT 'UTC';
  DECLARE v_status  VARCHAR(16);
  DECLARE v_player  TINYINT UNSIGNED;
  DECLARE v_n       INT UNSIGNED;
  DECLARE v_try     TINYINT UNSIGNED DEFAULT 0;
  DECLARE v_dup     TINYINT DEFAULT 0;
  DECLARE v_done    TINYINT DEFAULT 0;
  DECLARE CONTINUE HANDLER FOR 1062 SET v_dup = 1;           -- duplicate key: a concurrent callback won the race
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  IF p_discord_id IS NULL OR p_discord_id NOT REGEXP '^[0-9]{17,20}$' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That Discord account could not be used.';
  END IF;

  -- username: lower-case, anything outside [a-z0-9_] becomes '_', runs of '_' collapse, leading and trailing
  -- '_' are dropped, at most 24 characters; fewer than 3 characters get 'player' appended
  SET v_base = LOWER(COALESCE(TRIM(p_username_hint), ''));
  SET v_base = REGEXP_REPLACE(v_base, '[^a-z0-9_]', '_', 1, 0, 'c');
  SET v_base = REGEXP_REPLACE(v_base, '_+', '_');
  SET v_base = TRIM(BOTH '_' FROM v_base);
  SET v_base = TRIM(TRAILING '_' FROM LEFT(v_base, 24));
  IF CHAR_LENGTH(v_base) < 3 THEN
    SET v_base = CONCAT(v_base, 'player');
  END IF;

  SET v_display = LEFT(TRIM(COALESCE(p_display_hint, '')), 64);
  SET v_tz = COALESCE(NULLIF(TRIM(p_timezone), ''), 'UTC');
  IF CHAR_LENGTH(v_tz) > 64
     OR NOT REGEXP_LIKE(v_tz, '^(UTC|(Africa|America|Antarctica|Asia|Atlantic|Australia|Europe|Indian|Pacific|Etc)(/[A-Za-z0-9_+-]+){1,2})$', 'c') THEN
    SET v_tz = 'UTC';
  END IF;

  SELECT role_id INTO v_player FROM role WHERE role_name = 'player';

  WHILE v_done = 0 DO
    SET v_try = v_try + 1;
    IF v_try > 8 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That Discord account could not be used.';
    END IF;
    SET v_dup = 0;

    START TRANSACTION;
    SET p_user_id = NULL;
    SELECT a.user_id, u.status INTO p_user_id, v_status
      FROM auth_account a JOIN users u ON u.user_id = a.user_id
     WHERE a.provider = 'discord' AND a.provider_user_id = p_discord_id;
    IF p_user_id IS NOT NULL THEN                            -- known Discord account
      IF v_status = 'banned' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This account cannot sign in.';
      END IF;
      COMMIT;
      SET v_done = 1;
    ELSE
      SET v_n = 1;                                           -- first free username: base, base_2, base_3 ...
      SET v_name = v_base;
      WHILE EXISTS (SELECT 1 FROM users WHERE username = v_name) DO
        SET v_n = v_n + 1;
        SET v_name = CONCAT(LEFT(v_base, 32 - CHAR_LENGTH(CONCAT('_', v_n))), '_', v_n);
      END WHILE;

      INSERT INTO users (username, display_name, timezone)
      VALUES (v_name, IF(CHAR_LENGTH(v_display) = 0, v_name, v_display), v_tz);
      IF v_dup = 0 THEN
        SET p_user_id = LAST_INSERT_ID();
        INSERT INTO auth_account (user_id, provider, provider_user_id, email, password_hash)
        VALUES (p_user_id, 'discord', p_discord_id, NULL, NULL);
      END IF;
      IF v_dup = 0 THEN
        INSERT INTO user_role (user_id, role_id) VALUES (p_user_id, v_player);   -- assigned_by NULL: self sign-up
        COMMIT;
        SET v_done = 1;
      ELSE
        ROLLBACK;                                            -- lost a race (same Discord id or same username): look again
        SET p_user_id = NULL;
      END IF;
    END IF;
  END WHILE;
END$$

DELIMITER ;
