SET NAMES utf8mb4;
SET time_zone = '+00:00';   -- all DATETIME columns are UTC
-- PairADice session lifecycle. Run after 01_schema.sql and 02_routines.sql, before 04_rbac.sql (which grants
-- EXECUTE on these procedures to pairadice_player; moderator and admin inherit it).
-- Creating a session touches six tables (lfg_session, session_participant, session_slot, session_language,
-- session_tag, plus the trigger-written audit_log), and every join / leave / kick / status change is a
-- check-then-write on a row another request may be changing. Each is one procedure with one transaction and
-- a row lock on the session, and the database itself decides who may act (p_actor_id is checked against
-- host ownership, fn_has_permission, blocks, friendships and platform accounts), so the web tier cannot
-- skip a rule by forgetting an IF. Rules the triggers in 02_routines.sql already enforce (suspended users,
-- full sessions, max_players vs team size, current_players, open <-> full flips, completion counters and
-- badges, audit rows) are left to them. @audit_actor tells the audit trigger who made a status change.
USE pairadice;

DROP PROCEDURE IF EXISTS sp_create_session;
DROP PROCEDURE IF EXISTS sp_request_join;
DROP PROCEDURE IF EXISTS sp_withdraw_or_leave;
DROP PROCEDURE IF EXISTS sp_decline_participant;
DROP PROCEDURE IF EXISTS sp_kick_participant;
DROP PROCEDURE IF EXISTS sp_set_session_status;
DROP PROCEDURE IF EXISTS sp_my_platform_accounts;

DELIMITER $$

CREATE PROCEDURE sp_create_session(IN  p_actor_id        BIGINT UNSIGNED,
                                   IN  p_game_id         INT UNSIGNED,
                                   IN  p_mode_id         INT UNSIGNED,
                                   IN  p_platform_id     SMALLINT UNSIGNED,
                                   IN  p_region_id       INT UNSIGNED,
                                   IN  p_title           VARCHAR(120),
                                   IN  p_description     TEXT,
                                   IN  p_max_players     TINYINT UNSIGNED,
                                   IN  p_scheduled_start DATETIME,
                                   IN  p_region_locked   BOOLEAN,
                                   IN  p_voice_required  BOOLEAN,
                                   IN  p_visibility      VARCHAR(16),
                                   IN  p_join_policy     VARCHAR(16),
                                   IN  p_min_rank_id     INT UNSIGNED,
                                   IN  p_max_rank_id     INT UNSIGNED,
                                   IN  p_min_avg_rating  DECIMAL(3,2),
                                   IN  p_host_role_id    INT UNSIGNED,
                                   IN  p_host_account_id BIGINT UNSIGNED,
                                   IN  p_slots           JSON,
                                   IN  p_language_codes  JSON,
                                   IN  p_tag_ids         JSON,
                                   OUT p_session_id      BIGINT UNSIGNED)
BEGIN                                                        -- session + host row + slots + languages + tags, atomically
  DECLARE v_title VARCHAR(120) DEFAULT TRIM(p_title);
  DECLARE v_acct_user BIGINT UNSIGNED;
  DECLARE v_acct_plat SMALLINT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  IF p_actor_id IS NULL OR NOT fn_has_permission(p_actor_id, 'session.create') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You are not allowed to host sessions';
  END IF;
  IF v_title IS NULL OR CHAR_LENGTH(v_title) < 3 OR CHAR_LENGTH(v_title) > 120 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Title must be 3-120 characters';
  END IF;
  IF p_scheduled_start IS NOT NULL AND p_scheduled_start < UTC_TIMESTAMP() - INTERVAL 1 HOUR THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Start time is in the past';
  END IF;
  IF p_language_codes IS NULL OR JSON_TYPE(p_language_codes) <> 'ARRAY' OR JSON_LENGTH(p_language_codes) < 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Pick at least one language';
  END IF;
  IF p_host_account_id IS NOT NULL THEN
    SELECT user_id, platform_id INTO v_acct_user, v_acct_plat
      FROM platform_account WHERE account_id = p_host_account_id;
    IF v_acct_user IS NULL OR v_acct_user <> p_actor_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That platform account is not yours';
    END IF;
    IF v_acct_plat <> p_platform_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That platform account is on a different platform';
    END IF;
  END IF;

  START TRANSACTION;
  SET @audit_actor = p_actor_id;
  INSERT INTO lfg_session (host_id, game_id, mode_id, platform_id, region_id, min_rank_id, max_rank_id,
                           title, description, max_players, scheduled_start, region_locked, voice_required,
                           visibility, join_policy, min_avg_rating)
  VALUES (p_actor_id, p_game_id, p_mode_id, p_platform_id, p_region_id, p_min_rank_id, p_max_rank_id,
          v_title, p_description, p_max_players, p_scheduled_start, COALESCE(p_region_locked, FALSE),
          COALESCE(p_voice_required, FALSE), COALESCE(p_visibility, 'public'),
          COALESCE(p_join_policy, 'approval'), p_min_avg_rating);
  SET p_session_id = LAST_INSERT_ID();

  INSERT INTO session_participant (session_id, user_id, game_role_id, platform_account_id, status)
  VALUES (p_session_id, p_actor_id, p_host_role_id, p_host_account_id, 'accepted');   -- trigger cannot insert it (error 1442)

  IF p_slots IS NOT NULL AND JSON_LENGTH(p_slots) > 0 THEN
    INSERT INTO session_slot (session_id, slot_no, game_id, game_role_id, slots_needed)
    SELECT p_session_id, j.slot_no, p_game_id, j.role_id, j.needed
      FROM JSON_TABLE(p_slots, '$[*]' COLUMNS (slot_no FOR ORDINALITY,
                                               role_id INT UNSIGNED PATH '$.role_id',
                                               needed  INT UNSIGNED PATH '$.needed' DEFAULT '1' ON EMPTY)) j;
  END IF;
  INSERT INTO session_language (session_id, language_code)
  SELECT DISTINCT p_session_id, j.code
    FROM JSON_TABLE(p_language_codes, '$[*]' COLUMNS (code CHAR(2) PATH '$')) j;
  IF p_tag_ids IS NOT NULL AND JSON_LENGTH(p_tag_ids) > 0 THEN
    INSERT INTO session_tag (session_id, tag_id)
    SELECT DISTINCT p_session_id, j.tag_id
      FROM JSON_TABLE(p_tag_ids, '$[*]' COLUMNS (tag_id SMALLINT UNSIGNED PATH '$')) j;
  END IF;
  SET @audit_actor = NULL;
  COMMIT;
END$$

CREATE PROCEDURE sp_request_join(IN p_actor_id   BIGINT UNSIGNED,
                                 IN p_session_id BIGINT UNSIGNED,
                                 IN p_role_id    INT UNSIGNED,
                                 IN p_account_id BIGINT UNSIGNED)
BEGIN                                                        -- ask to join (or join straight away when join_policy is auto)
  DECLARE v_host    BIGINT UNSIGNED;
  DECLARE v_status  VARCHAR(16);
  DECLARE v_vis     VARCHAR(16);
  DECLARE v_policy  VARCHAR(16);
  DECLARE v_plat    SMALLINT UNSIGNED;
  DECLARE v_minrate DECIMAL(3,2);
  DECLARE v_pstatus VARCHAR(16);
  DECLARE v_acct_user BIGINT UNSIGNED;
  DECLARE v_acct_plat SMALLINT UNSIGNED;
  DECLARE v_rating  DECIMAL(3,2);
  DECLARE v_new     VARCHAR(16);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  IF p_actor_id IS NULL OR NOT fn_has_permission(p_actor_id, 'session.join') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You are not allowed to join sessions';
  END IF;

  START TRANSACTION;
  SELECT host_id, status, visibility, join_policy, platform_id, min_avg_rating
    INTO v_host, v_status, v_vis, v_policy, v_plat, v_minrate
    FROM lfg_session WHERE session_id = p_session_id FOR UPDATE;
  IF v_host IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Session not found';
  END IF;
  IF v_status <> 'open' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Session is not open for joining';
  END IF;
  IF v_host = p_actor_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You are the host of this session';
  END IF;
  IF v_vis = 'invite' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This session is invite-only';
  END IF;
  IF v_vis = 'friends' AND NOT fn_are_friends(p_actor_id, v_host) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This session is for the host''s friends only';
  END IF;
  IF fn_is_blocked(p_actor_id, v_host) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You cannot join this session';
  END IF;
  IF p_account_id IS NOT NULL THEN
    SELECT user_id, platform_id INTO v_acct_user, v_acct_plat
      FROM platform_account WHERE account_id = p_account_id;
    IF v_acct_user IS NULL OR v_acct_user <> p_actor_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That platform account is not yours';
    END IF;
    IF v_acct_plat <> v_plat THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That platform account is on a different platform';
    END IF;
  END IF;
  IF v_minrate IS NOT NULL THEN
    SELECT avg_rating INTO v_rating FROM users WHERE user_id = p_actor_id;
    IF v_rating IS NOT NULL AND v_rating < v_minrate THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Your average rating is below this session''s minimum';
    END IF;
  END IF;

  SELECT status INTO v_pstatus FROM session_participant
   WHERE session_id = p_session_id AND user_id = p_actor_id FOR UPDATE;
  IF v_pstatus IN ('requested','accepted') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You already have a place or a pending request here';
  END IF;
  IF v_pstatus = 'kicked' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You were removed from this session';
  END IF;

  SET v_new = IF(v_policy = 'auto', 'accepted', 'requested');   -- full-session trigger still guards capacity
  IF v_pstatus IS NULL THEN
    INSERT INTO session_participant (session_id, user_id, game_role_id, platform_account_id, status)
    VALUES (p_session_id, p_actor_id, p_role_id, p_account_id, v_new);
  ELSE                                                       -- declined / left: ask again
    UPDATE session_participant
       SET status = v_new, game_role_id = p_role_id, platform_account_id = p_account_id,
           joined_at = UTC_TIMESTAMP(), left_at = NULL
     WHERE session_id = p_session_id AND user_id = p_actor_id;
  END IF;
  COMMIT;
END$$

CREATE PROCEDURE sp_withdraw_or_leave(IN p_actor_id   BIGINT UNSIGNED,
                                      IN p_session_id BIGINT UNSIGNED)
BEGIN                                                        -- pending request -> withdrawn (row deleted); accepted -> left
  DECLARE v_host    BIGINT UNSIGNED;
  DECLARE v_pstatus VARCHAR(16);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  START TRANSACTION;
  SELECT host_id INTO v_host FROM lfg_session WHERE session_id = p_session_id FOR UPDATE;
  IF v_host IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Session not found';
  END IF;
  IF v_host = p_actor_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The host cannot leave; cancel the session instead';
  END IF;
  SELECT status INTO v_pstatus FROM session_participant
   WHERE session_id = p_session_id AND user_id = p_actor_id FOR UPDATE;
  IF v_pstatus = 'requested' THEN
    DELETE FROM session_participant WHERE session_id = p_session_id AND user_id = p_actor_id;
  ELSEIF v_pstatus = 'accepted' THEN
    UPDATE session_participant SET status = 'left', left_at = UTC_TIMESTAMP()
     WHERE session_id = p_session_id AND user_id = p_actor_id;
  ELSE
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You have no active place or request in this session';
  END IF;
  COMMIT;
END$$

CREATE PROCEDURE sp_decline_participant(IN p_actor_id   BIGINT UNSIGNED,
                                        IN p_session_id BIGINT UNSIGNED,
                                        IN p_user_id    BIGINT UNSIGNED)
BEGIN                                                        -- host (or moderator) turns down a pending request
  DECLARE v_host    BIGINT UNSIGNED;
  DECLARE v_pstatus VARCHAR(16);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  START TRANSACTION;
  SELECT host_id INTO v_host FROM lfg_session WHERE session_id = p_session_id FOR UPDATE;
  IF v_host IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Session not found';
  END IF;
  IF p_actor_id IS NULL OR (v_host <> p_actor_id AND NOT fn_has_permission(p_actor_id, 'report.review')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only the host (or a moderator) can decline players';
  END IF;
  SELECT status INTO v_pstatus FROM session_participant
   WHERE session_id = p_session_id AND user_id = p_user_id FOR UPDATE;
  IF v_pstatus IS NULL OR v_pstatus <> 'requested' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No pending join request from this player';
  END IF;
  UPDATE session_participant SET status = 'declined'
   WHERE session_id = p_session_id AND user_id = p_user_id;
  COMMIT;
END$$

CREATE PROCEDURE sp_kick_participant(IN p_actor_id   BIGINT UNSIGNED,
                                     IN p_session_id BIGINT UNSIGNED,
                                     IN p_user_id    BIGINT UNSIGNED)
BEGIN                                                        -- host (or moderator) removes an accepted player
  DECLARE v_host    BIGINT UNSIGNED;
  DECLARE v_pstatus VARCHAR(16);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  START TRANSACTION;
  SELECT host_id INTO v_host FROM lfg_session WHERE session_id = p_session_id FOR UPDATE;
  IF v_host IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Session not found';
  END IF;
  IF p_actor_id IS NULL OR (v_host <> p_actor_id AND NOT fn_has_permission(p_actor_id, 'report.review')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only the host (or a moderator) can remove players';
  END IF;
  IF p_user_id = v_host THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The host cannot be removed; cancel the session instead';
  END IF;
  SELECT status INTO v_pstatus FROM session_participant
   WHERE session_id = p_session_id AND user_id = p_user_id FOR UPDATE;
  IF v_pstatus IS NULL OR v_pstatus <> 'accepted' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This player is not in the session';
  END IF;
  UPDATE session_participant SET status = 'kicked', left_at = UTC_TIMESTAMP()
   WHERE session_id = p_session_id AND user_id = p_user_id;
  COMMIT;
END$$

CREATE PROCEDURE sp_set_session_status(IN p_actor_id   BIGINT UNSIGNED,
                                       IN p_session_id BIGINT UNSIGNED,
                                       IN p_status     VARCHAR(16))
BEGIN                                                        -- start, cancel or complete; open <-> full is trigger-managed
  DECLARE v_host   BIGINT UNSIGNED;
  DECLARE v_status VARCHAR(16);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  START TRANSACTION;
  SELECT host_id, status INTO v_host, v_status
    FROM lfg_session WHERE session_id = p_session_id FOR UPDATE;
  IF v_host IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Session not found';
  END IF;
  IF p_actor_id IS NULL OR (v_host <> p_actor_id AND NOT fn_has_permission(p_actor_id, 'report.review')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only the host (or a moderator) can change the session status';
  END IF;
  IF NOT ((p_status = 'in_progress' AND v_status IN ('open','full'))
       OR (p_status = 'cancelled'   AND v_status IN ('open','full','in_progress'))
       OR (p_status = 'completed'   AND v_status = 'in_progress')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That status change is not allowed';
  END IF;
  SET @audit_actor = p_actor_id;
  UPDATE lfg_session SET status = p_status WHERE session_id = p_session_id;   -- trigger: audit row, counters, badges
  SET @audit_actor = NULL;
  COMMIT;
END$$

-- The player login has no SELECT on platform_account (gamertags are private), so a player reads only
-- their own accounts, through this procedure, when choosing which account to host or join with.
CREATE PROCEDURE sp_my_platform_accounts(IN p_actor_id BIGINT UNSIGNED)
BEGIN
  SELECT pa.account_id, pa.platform_id, p.name AS platform, pa.handle, pa.discriminator, pa.is_verified
    FROM platform_account pa JOIN platform p ON p.platform_id = pa.platform_id
   WHERE pa.user_id = p_actor_id
   ORDER BY p.name, pa.handle;
END$$

DELIMITER ;
