SET NAMES utf8mb4;
SET time_zone = '+00:00';   -- all DATETIME columns are UTC
-- PairADice camp chat, direct messages and reviews. Run after 01_schema.sql and 02_routines.sql, before 04_rbac.sql
-- (which grants EXECUTE on these routines to the player role).
-- IMPORTANT: the write procedures open and COMMIT their own transaction. Never call them inside a caller's transaction.
-- They replace three direct grants that skipped every rule: player SELECT on message (a player could read other
-- people's DMs), player INSERT on message (sender_id was not checked, no length or rate limit, no DM rules) and
-- player INSERT on review. p_actor_id is the only identity used; there is no sender parameter anywhere.
-- Refusals are SQLSTATE 45000 with a sentence a user can read. trg_message_bi and the trg_review_* triggers stay as
-- backstops (mute, membership, blocks, completed sessions) and still refresh ratings and badges.
--   fn_dm_refusal             NULL when the actor may DM the other player, otherwise the refusal sentence
--   sp_send_session_message   camp chat line (host or accepted participant, not in a cancelled camp)
--   sp_send_dm                direct message (friends, or players who were both accepted, or later left, in the same camp)
--   sp_delete_own_message     soft delete of your own line (refused while a report is open or after a moderator acted on it)
--   sp_write_review           1 to 5 stars for a teammate of a completed camp, once per pair
--   sp_chat_history           camp lines for members, oldest first, blocked senders hidden, removed lines without text
--   sp_dm_thread              one conversation, same paging; empty when blocked
--   sp_dm_inbox               one row per partner, newest first, blocked partners omitted
--   sp_dm_can_message         can_message 0/1 plus the reason
--   sp_my_chat_status         account status and the end of the latest active mute
--   sp_pending_reviews        teammates the actor has not reviewed yet in a completed camp
-- Limits: 1000 characters per message after trimming, 20 messages per 30 seconds per actor across chat and DMs,
-- comments up to 500 characters. Reads allow active and suspended actors (a suspended player may still read).
USE pairadice;

DROP FUNCTION  IF EXISTS fn_dm_refusal;
DROP PROCEDURE IF EXISTS sp_send_session_message;
DROP PROCEDURE IF EXISTS sp_send_dm;
DROP PROCEDURE IF EXISTS sp_delete_own_message;
DROP PROCEDURE IF EXISTS sp_write_review;
DROP PROCEDURE IF EXISTS sp_chat_history;
DROP PROCEDURE IF EXISTS sp_dm_thread;
DROP PROCEDURE IF EXISTS sp_dm_inbox;
DROP PROCEDURE IF EXISTS sp_dm_can_message;
DROP PROCEDURE IF EXISTS sp_my_chat_status;
DROP PROCEDURE IF EXISTS sp_pending_reviews;

DELIMITER $$

CREATE FUNCTION fn_dm_refusal(p_actor_id BIGINT UNSIGNED, p_other_id BIGINT UNSIGNED)
RETURNS VARCHAR(120) READS SQL DATA
BEGIN                                                        -- the relationship rules for a DM; NULL = allowed
  IF p_other_id IS NULL OR NOT EXISTS (SELECT 1 FROM users WHERE user_id = p_other_id) THEN
    RETURN 'That player does not exist.';
  END IF;
  IF p_other_id = p_actor_id THEN
    RETURN 'You cannot message yourself.';
  END IF;
  IF fn_is_blocked(p_actor_id, p_other_id)
     OR EXISTS (SELECT 1 FROM users WHERE user_id = p_other_id AND status = 'banned') THEN
    RETURN 'You cannot message this player.';
  END IF;
  IF fn_are_friends(p_actor_id, p_other_id)
     OR EXISTS (SELECT 1 FROM session_participant a
                  JOIN session_participant b ON b.session_id = a.session_id
                 WHERE a.user_id = p_actor_id AND b.user_id = p_other_id
                   AND a.status IN ('accepted', 'left') AND b.status IN ('accepted', 'left')) THEN
    RETURN NULL;
  END IF;
  RETURN 'You can message friends and teammates only.';
END$$

-- ============================================================ writes
-- The two send procedures serialise one sender's rate limit with a named lock, not a row lock on users: a users-row
-- X lock plus the message foreign keys (shared locks on users(receiver_id)) deadlocked two players DMing each other.
-- Membership, camp status and DM rules are checked after the lock, inside the transaction.
CREATE PROCEDURE sp_send_session_message(IN p_actor_id BIGINT UNSIGNED, IN p_session_id BIGINT UNSIGNED,
                                         IN p_content TEXT, OUT p_message_id BIGINT UNSIGNED)
BEGIN
  DECLARE v_content TEXT;
  DECLARE v_status  VARCHAR(16);
  DECLARE v_lock    VARCHAR(64) DEFAULT CONCAT('pd_chat_', IFNULL(p_actor_id, 0));
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; DO RELEASE_LOCK(v_lock); RESIGNAL; END;

  SET p_message_id = NULL;
  IF NOT fn_user_active(p_actor_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Your account cannot do that right now.';
  END IF;
  SET v_content = REGEXP_REPLACE(IFNULL(p_content, ''),
    '^[\\s\\x{00A0}\\x{200B}\\x{200C}\\x{200D}\\x{FEFF}]+|[\\s\\x{00A0}\\x{200B}\\x{200C}\\x{200D}\\x{FEFF}]+$', '');
  IF CHAR_LENGTH(v_content) < 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Write a message first.';
  END IF;
  IF CHAR_LENGTH(v_content) > 1000 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Messages can be at most 1000 characters.';
  END IF;

  IF IFNULL(GET_LOCK(v_lock, 3), 0) <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You are sending messages too fast. Wait a moment.';
  END IF;
  START TRANSACTION;
  SELECT status INTO v_status FROM lfg_session WHERE session_id = p_session_id;
  IF v_status IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That camp does not exist.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM session_participant
                  WHERE session_id = p_session_id AND user_id = p_actor_id AND status = 'accepted')
     AND NOT EXISTS (SELECT 1 FROM lfg_session WHERE session_id = p_session_id AND host_id = p_actor_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You are not in this camp.';
  END IF;
  IF v_status = 'cancelled' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This camp was cancelled, so its chat is closed.';
  END IF;
  IF EXISTS (SELECT 1 FROM sanction
              WHERE user_id = p_actor_id AND sanction_type = 'mute' AND starts_at <= UTC_TIMESTAMP()
                AND (ends_at IS NULL OR ends_at > UTC_TIMESTAMP())) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You are muted and cannot send messages right now.';
  END IF;
  IF (SELECT COUNT(*) FROM message
       WHERE sender_id = p_actor_id AND sent_at > UTC_TIMESTAMP() - INTERVAL 30 SECOND) >= 20 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You are sending messages too fast. Wait a moment.';
  END IF;
  INSERT INTO message (sender_id, session_id, content, sent_at)
  VALUES (p_actor_id, p_session_id, v_content, UTC_TIMESTAMP());
  SET p_message_id = LAST_INSERT_ID();
  COMMIT;
  DO RELEASE_LOCK(v_lock);
END$$

CREATE PROCEDURE sp_send_dm(IN p_actor_id BIGINT UNSIGNED, IN p_receiver_id BIGINT UNSIGNED,
                            IN p_content TEXT, OUT p_message_id BIGINT UNSIGNED)
BEGIN
  DECLARE v_content TEXT;
  DECLARE v_refusal VARCHAR(120);
  DECLARE v_lock    VARCHAR(64) DEFAULT CONCAT('pd_chat_', IFNULL(p_actor_id, 0));
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; DO RELEASE_LOCK(v_lock); RESIGNAL; END;

  SET p_message_id = NULL;
  IF NOT fn_user_active(p_actor_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Your account cannot do that right now.';
  END IF;
  SET v_content = REGEXP_REPLACE(IFNULL(p_content, ''),
    '^[\\s\\x{00A0}\\x{200B}\\x{200C}\\x{200D}\\x{FEFF}]+|[\\s\\x{00A0}\\x{200B}\\x{200C}\\x{200D}\\x{FEFF}]+$', '');
  IF CHAR_LENGTH(v_content) < 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Write a message first.';
  END IF;
  IF CHAR_LENGTH(v_content) > 1000 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Messages can be at most 1000 characters.';
  END IF;

  IF IFNULL(GET_LOCK(v_lock, 3), 0) <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You are sending messages too fast. Wait a moment.';
  END IF;
  START TRANSACTION;
  SET v_refusal = fn_dm_refusal(p_actor_id, p_receiver_id);
  IF v_refusal IS NOT NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_refusal;
  END IF;
  IF EXISTS (SELECT 1 FROM sanction
              WHERE user_id = p_actor_id AND sanction_type = 'mute' AND starts_at <= UTC_TIMESTAMP()
                AND (ends_at IS NULL OR ends_at > UTC_TIMESTAMP())) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You are muted and cannot send messages right now.';
  END IF;
  IF (SELECT COUNT(*) FROM message
       WHERE sender_id = p_actor_id AND sent_at > UTC_TIMESTAMP() - INTERVAL 30 SECOND) >= 20 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You are sending messages too fast. Wait a moment.';
  END IF;
  INSERT INTO message (sender_id, receiver_id, content, sent_at)
  VALUES (p_actor_id, p_receiver_id, v_content, UTC_TIMESTAMP());
  SET p_message_id = LAST_INSERT_ID();
  COMMIT;
  DO RELEASE_LOCK(v_lock);
END$$

CREATE PROCEDURE sp_delete_own_message(IN p_actor_id BIGINT UNSIGNED, IN p_message_id BIGINT UNSIGNED)
BEGIN
  DECLARE v_sender  BIGINT UNSIGNED;
  DECLARE v_deleted BOOLEAN;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  IF NOT fn_user_active(p_actor_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Your account cannot do that right now.';
  END IF;
  START TRANSACTION;
  SELECT sender_id, is_deleted INTO v_sender, v_deleted FROM message WHERE message_id = p_message_id FOR UPDATE;
  IF v_sender IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That message does not exist.';
  END IF;
  IF v_sender <> p_actor_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You can only remove your own messages.';
  END IF;
  IF v_deleted THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That message is already removed.';
  END IF;
  IF EXISTS (SELECT 1 FROM report WHERE message_id = p_message_id AND status IN ('open', 'reviewing')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This message is part of a report and cannot be removed right now.';
  END IF;
  IF EXISTS (SELECT 1 FROM audit_log WHERE entity = 'message' AND entity_id = CAST(p_message_id AS CHAR)
                AND action IN ('hide', 'restore')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A moderator has reviewed this message.';
  END IF;
  UPDATE message SET is_deleted = TRUE WHERE message_id = p_message_id;
  INSERT INTO audit_log (actor_id, entity, entity_id, action)
  VALUES (p_actor_id, 'message', p_message_id, 'delete_own');
  COMMIT;
END$$

CREATE PROCEDURE sp_write_review(IN p_actor_id BIGINT UNSIGNED, IN p_session_id BIGINT UNSIGNED,
                                 IN p_reviewed_id BIGINT UNSIGNED, IN p_rating INT, IN p_comment VARCHAR(2000))
BEGIN
  DECLARE v_comment VARCHAR(2000);
  DECLARE v_status  VARCHAR(16);
  DECLARE EXIT HANDLER FOR 1062 BEGIN ROLLBACK;
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You already reviewed this player for this camp.'; END;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  IF NOT fn_user_active(p_actor_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Your account cannot do that right now.';
  END IF;
  IF p_rating IS NULL OR p_rating NOT BETWEEN 1 AND 5 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Choose a rating from 1 to 5 stars.';
  END IF;
  SET v_comment = NULLIF(REGEXP_REPLACE(IFNULL(p_comment, ''), '^\\s+|\\s+$', ''), '');
  IF v_comment IS NOT NULL AND CHAR_LENGTH(v_comment) > 500 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The comment must be 500 characters or fewer.';
  END IF;
  IF p_reviewed_id IS NULL OR NOT EXISTS (SELECT 1 FROM users WHERE user_id = p_reviewed_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That player does not exist.';
  END IF;
  IF p_reviewed_id = p_actor_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You cannot review yourself.';
  END IF;
  SELECT status INTO v_status FROM lfg_session WHERE session_id = p_session_id;
  IF v_status IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That camp does not exist.';
  END IF;
  IF v_status <> 'completed' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You can review a camp only after it is completed.';
  END IF;
  IF (SELECT COUNT(*) FROM session_participant
       WHERE session_id = p_session_id AND user_id IN (p_actor_id, p_reviewed_id) AND status = 'accepted') < 2 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only players who both played in this camp can review each other.';
  END IF;
  IF EXISTS (SELECT 1 FROM review
              WHERE session_id = p_session_id AND reviewer_id = p_actor_id AND reviewed_id = p_reviewed_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You already reviewed this player for this camp.';
  END IF;

  START TRANSACTION;
  INSERT INTO review (session_id, reviewer_id, reviewed_id, rating, comment_text, created_at)
  VALUES (p_session_id, p_actor_id, p_reviewed_id, p_rating, v_comment, UTC_TIMESTAMP());
  COMMIT;
END$$

-- ============================================================ reads
CREATE PROCEDURE sp_chat_history(IN p_actor_id BIGINT UNSIGNED, IN p_session_id BIGINT UNSIGNED,
                                 IN p_after_id BIGINT UNSIGNED, IN p_limit INT)
BEGIN
  DECLARE v_limit INT DEFAULT LEAST(200, GREATEST(1, IFNULL(p_limit, 50)));

  IF p_actor_id IS NULL OR NOT EXISTS (SELECT 1 FROM users WHERE user_id = p_actor_id AND status IN ('active', 'suspended')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Your account cannot do that right now.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM session_participant
                  WHERE session_id = p_session_id AND user_id = p_actor_id AND status = 'accepted')
     AND NOT EXISTS (SELECT 1 FROM lfg_session WHERE session_id = p_session_id AND host_id = p_actor_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You are not in this camp.';
  END IF;

  IF IFNULL(p_after_id, 0) = 0 THEN                          -- the latest lines, still oldest first
    SELECT * FROM (
      SELECT m.message_id, m.sender_id, u.username, u.display_name,
             IF(m.is_deleted, NULL, m.content) AS content, m.is_deleted AS is_deleted, m.sent_at, m.edited_at
        FROM message m JOIN users u ON u.user_id = m.sender_id
       WHERE m.session_id = p_session_id
         AND NOT EXISTS (SELECT 1 FROM user_block b
                          WHERE (b.blocker_id = p_actor_id AND b.blocked_id = m.sender_id)
                             OR (b.blocker_id = m.sender_id AND b.blocked_id = p_actor_id))
       ORDER BY m.message_id DESC LIMIT v_limit) t
     ORDER BY t.message_id;
  ELSE
    SELECT m.message_id, m.sender_id, u.username, u.display_name,
           IF(m.is_deleted, NULL, m.content) AS content, m.is_deleted AS is_deleted, m.sent_at, m.edited_at
      FROM message m JOIN users u ON u.user_id = m.sender_id
     WHERE m.session_id = p_session_id AND m.message_id > p_after_id
       AND NOT EXISTS (SELECT 1 FROM user_block b
                        WHERE (b.blocker_id = p_actor_id AND b.blocked_id = m.sender_id)
                           OR (b.blocker_id = m.sender_id AND b.blocked_id = p_actor_id))
     ORDER BY m.message_id LIMIT v_limit;
  END IF;
END$$

CREATE PROCEDURE sp_dm_thread(IN p_actor_id BIGINT UNSIGNED, IN p_other_id BIGINT UNSIGNED,
                              IN p_after_id BIGINT UNSIGNED, IN p_limit INT)
BEGIN
  DECLARE v_limit INT DEFAULT LEAST(200, GREATEST(1, IFNULL(p_limit, 50)));
  DECLARE v_blocked BOOLEAN;

  IF p_actor_id IS NULL OR NOT EXISTS (SELECT 1 FROM users WHERE user_id = p_actor_id AND status IN ('active', 'suspended')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Your account cannot do that right now.';
  END IF;
  SET v_blocked = IFNULL(fn_is_blocked(p_actor_id, p_other_id), FALSE);

  IF IFNULL(p_after_id, 0) = 0 THEN
    SELECT * FROM (
      SELECT m.message_id, m.sender_id, m.receiver_id, IF(m.is_deleted, NULL, m.content) AS content,
             m.is_deleted AS is_deleted, m.sent_at
        FROM message m
       WHERE NOT v_blocked AND m.session_id IS NULL
         AND ((m.sender_id = p_actor_id AND m.receiver_id = p_other_id)
           OR (m.sender_id = p_other_id AND m.receiver_id = p_actor_id))
       ORDER BY m.message_id DESC LIMIT v_limit) t
     ORDER BY t.message_id;
  ELSE
    SELECT m.message_id, m.sender_id, m.receiver_id, IF(m.is_deleted, NULL, m.content) AS content,
           m.is_deleted AS is_deleted, m.sent_at
      FROM message m
     WHERE NOT v_blocked AND m.session_id IS NULL AND m.message_id > p_after_id
       AND ((m.sender_id = p_actor_id AND m.receiver_id = p_other_id)
         OR (m.sender_id = p_other_id AND m.receiver_id = p_actor_id))
     ORDER BY m.message_id LIMIT v_limit;
  END IF;
END$$

CREATE PROCEDURE sp_dm_inbox(IN p_actor_id BIGINT UNSIGNED)
BEGIN
  IF p_actor_id IS NULL OR NOT EXISTS (SELECT 1 FROM users WHERE user_id = p_actor_id AND status IN ('active', 'suspended')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Your account cannot do that right now.';
  END IF;
  SELECT t.message_id, t.other_id, u.username AS other_username, u.display_name AS other_display_name,
         CASE WHEN u.status IN ('suspended', 'banned') THEN 'offline'
              WHEN u.last_active_at >= UTC_TIMESTAMP() - INTERVAL 15 MINUTE THEN 'online'
              ELSE 'away' END AS other_presence,
         t.sender_id, IF(t.is_deleted, NULL, t.content) AS content, t.is_deleted AS is_deleted, t.sent_at
    FROM (SELECT m.message_id, m.sender_id, m.content, m.is_deleted, m.sent_at,
                 IF(m.sender_id = p_actor_id, m.receiver_id, m.sender_id) AS other_id,
                 ROW_NUMBER() OVER (PARTITION BY IF(m.sender_id = p_actor_id, m.receiver_id, m.sender_id)
                                    ORDER BY m.message_id DESC) AS rn
            FROM message m
           WHERE m.session_id IS NULL AND (m.sender_id = p_actor_id OR m.receiver_id = p_actor_id)) t
    JOIN users u ON u.user_id = t.other_id
   WHERE t.rn = 1
     AND NOT EXISTS (SELECT 1 FROM user_block b
                      WHERE (b.blocker_id = p_actor_id AND b.blocked_id = t.other_id)
                         OR (b.blocker_id = t.other_id AND b.blocked_id = p_actor_id))
   ORDER BY t.message_id DESC;
END$$

CREATE PROCEDURE sp_dm_can_message(IN p_actor_id BIGINT UNSIGNED, IN p_other_id BIGINT UNSIGNED)
BEGIN
  DECLARE v_refusal VARCHAR(120);
  IF p_actor_id IS NULL OR NOT EXISTS (SELECT 1 FROM users WHERE user_id = p_actor_id AND status IN ('active', 'suspended')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Your account cannot do that right now.';
  END IF;
  SET v_refusal = fn_dm_refusal(p_actor_id, p_other_id);
  SELECT IF(v_refusal IS NULL, 1, 0) AS can_message, v_refusal AS reason;
END$$

CREATE PROCEDURE sp_my_chat_status(IN p_actor_id BIGINT UNSIGNED)
BEGIN
  IF p_actor_id IS NULL OR NOT EXISTS (SELECT 1 FROM users WHERE user_id = p_actor_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Your account cannot do that right now.';
  END IF;
  SELECT u.status AS account_status,
         (SELECT IF(COUNT(*) = 0, NULL,
                    IF(SUM(s.ends_at IS NULL) > 0, TIMESTAMP('9999-12-31 23:59:59'), MAX(s.ends_at)))   -- permanent mute: far future
            FROM sanction s
           WHERE s.user_id = u.user_id AND s.sanction_type = 'mute' AND s.starts_at <= UTC_TIMESTAMP()
             AND (s.ends_at IS NULL OR s.ends_at > UTC_TIMESTAMP())) AS muted_until
    FROM users u WHERE u.user_id = p_actor_id;
END$$

CREATE PROCEDURE sp_pending_reviews(IN p_actor_id BIGINT UNSIGNED, IN p_session_id BIGINT UNSIGNED)
BEGIN
  IF p_actor_id IS NULL OR NOT EXISTS (SELECT 1 FROM users WHERE user_id = p_actor_id AND status IN ('active', 'suspended')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Your account cannot do that right now.';
  END IF;
  SELECT u.user_id, u.username, u.display_name
    FROM lfg_session s
    JOIN session_participant me ON me.session_id = s.session_id AND me.user_id = p_actor_id AND me.status = 'accepted'
    JOIN session_participant sp ON sp.session_id = s.session_id AND sp.status = 'accepted' AND sp.user_id <> p_actor_id
    JOIN users u ON u.user_id = sp.user_id
   WHERE s.session_id = p_session_id AND s.status = 'completed'
     AND NOT EXISTS (SELECT 1 FROM review r
                      WHERE r.session_id = s.session_id AND r.reviewer_id = p_actor_id AND r.reviewed_id = sp.user_id)
   ORDER BY u.display_name, u.user_id;
END$$

DELIMITER ;
