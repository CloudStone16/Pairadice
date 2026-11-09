SET NAMES utf8mb4;
SET time_zone = '+00:00';   -- all DATETIME columns are UTC
-- PairADice friends and blocks. Run after 01_schema.sql, 02_routines.sql and 09_sessions.sql, before 04_rbac.sql
-- (which grants EXECUTE on these procedures to pairadice_player; moderator and admin inherit it).
-- Sending, answering and blocking need an active account (fn_user_active: NULL, suspended and banned are
-- rejected); cancelling, removing and unblocking stay open so nobody is stuck in a relationship.
-- Each write is one procedure with one transaction, and the database itself decides who may act: p_actor_id
-- is the only identity used, so the web tier cannot act for someone else by passing the wrong id. The player
-- login has no DELETE on friendship, so cancelling a request or removing a friend can only go through here.
-- Rules the triggers in 02_routines.sql already enforce are left to them: trg_friendship_bi rejects a friend
-- request across a block, trg_block_ai deletes the friendship (and writes the audit row) when a block is
-- inserted, and the schema's unique pair key and self-check stop duplicates and self-friendship.
USE pairadice;

DROP PROCEDURE IF EXISTS sp_send_friend_request;
DROP PROCEDURE IF EXISTS sp_respond_friend_request;
DROP PROCEDURE IF EXISTS sp_cancel_friend_request;
DROP PROCEDURE IF EXISTS sp_remove_friend;
DROP PROCEDURE IF EXISTS sp_block_user;
DROP PROCEDURE IF EXISTS sp_unblock_user;
DROP PROCEDURE IF EXISTS sp_friend_overview;

DELIMITER $$

CREATE PROCEDURE sp_send_friend_request(IN p_actor_id BIGINT UNSIGNED, IN p_target_id BIGINT UNSIGNED)
BEGIN                                                        -- new request, or accept when they already asked us
  DECLARE v_status    VARCHAR(16);
  DECLARE v_requester BIGINT UNSIGNED;
  DECLARE v_created   DATETIME;
  DECLARE v_tstatus   VARCHAR(16);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  IF NOT fn_user_active(p_actor_id) THEN                     -- NULL, unknown, suspended or banned
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Your account cannot do that right now.';
  END IF;
  IF p_target_id IS NULL OR p_actor_id = p_target_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You cannot befriend yourself';
  END IF;
  SELECT status INTO v_tstatus FROM users WHERE user_id = p_target_id;
  IF v_tstatus IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That player does not exist';
  END IF;
  IF fn_is_blocked(p_actor_id, p_target_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot send a friend request (blocked)';
  END IF;
  IF v_tstatus <> 'active' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That player cannot receive friend requests';
  END IF;

  START TRANSACTION;
  SELECT status, requester_id, created_at INTO v_status, v_requester, v_created
    FROM friendship
   WHERE pair_low = LEAST(p_actor_id, p_target_id) AND pair_high = GREATEST(p_actor_id, p_target_id)
   FOR UPDATE;

  IF v_status IS NULL THEN
    INSERT INTO friendship (requester_id, addressee_id, status, created_at)
    VALUES (p_actor_id, p_target_id, 'pending', UTC_TIMESTAMP());
  ELSEIF v_status = 'accepted' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You are already friends';
  ELSEIF v_status = 'pending' THEN
    IF v_requester = p_actor_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Request already sent';
    END IF;
    UPDATE friendship SET status = 'accepted'               -- both want it
     WHERE requester_id = p_target_id AND addressee_id = p_actor_id;
  ELSE                                                       -- declined
    IF v_created > UTC_TIMESTAMP() - INTERVAL 7 DAY THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Please wait before asking again';
    END IF;
    UPDATE friendship
       SET requester_id = p_actor_id, addressee_id = p_target_id, status = 'pending', created_at = UTC_TIMESTAMP()
     WHERE pair_low = LEAST(p_actor_id, p_target_id) AND pair_high = GREATEST(p_actor_id, p_target_id);
  END IF;
  COMMIT;
END$$

CREATE PROCEDURE sp_respond_friend_request(IN p_actor_id BIGINT UNSIGNED, IN p_requester_id BIGINT UNSIGNED,
                                           IN p_accept BOOLEAN)
BEGIN
  DECLARE v_found INT DEFAULT 0;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  IF NOT fn_user_active(p_actor_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Your account cannot do that right now.';
  END IF;
  IF p_requester_id IS NULL OR p_accept IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Missing details';
  END IF;
  START TRANSACTION;
  SELECT COUNT(*) INTO v_found FROM friendship
   WHERE requester_id = p_requester_id AND addressee_id = p_actor_id AND status = 'pending' FOR UPDATE;
  IF v_found = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No pending request from that player';
  END IF;
  UPDATE friendship SET status = IF(p_accept, 'accepted', 'declined'), created_at = IF(p_accept, created_at, UTC_TIMESTAMP())
   WHERE requester_id = p_requester_id AND addressee_id = p_actor_id;
  COMMIT;
END$$

CREATE PROCEDURE sp_cancel_friend_request(IN p_actor_id BIGINT UNSIGNED, IN p_target_id BIGINT UNSIGNED)
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  START TRANSACTION;
  DELETE FROM friendship
   WHERE requester_id = p_actor_id AND addressee_id = p_target_id AND status = 'pending';
  IF ROW_COUNT() = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You have no pending request to that player';
  END IF;
  COMMIT;
END$$

CREATE PROCEDURE sp_remove_friend(IN p_actor_id BIGINT UNSIGNED, IN p_other_id BIGINT UNSIGNED)
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  START TRANSACTION;
  DELETE FROM friendship
   WHERE status = 'accepted' AND p_actor_id IS NOT NULL AND p_other_id IS NOT NULL
     AND pair_low = LEAST(p_actor_id, p_other_id) AND pair_high = GREATEST(p_actor_id, p_other_id);
  IF ROW_COUNT() = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You are not friends with that player';
  END IF;
  COMMIT;
END$$

CREATE PROCEDURE sp_block_user(IN p_actor_id BIGINT UNSIGNED, IN p_target_id BIGINT UNSIGNED)
BEGIN                                                        -- trg_block_ai removes the friendship in the same transaction
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  IF NOT fn_user_active(p_actor_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Your account cannot do that right now.';
  END IF;
  IF p_target_id IS NULL OR p_actor_id = p_target_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You cannot block yourself';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE user_id = p_target_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That player does not exist';
  END IF;
  START TRANSACTION;
  IF EXISTS (SELECT 1 FROM user_block WHERE blocker_id = p_actor_id AND blocked_id = p_target_id FOR UPDATE) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Already blocked';
  END IF;
  INSERT INTO user_block (blocker_id, blocked_id, created_at) VALUES (p_actor_id, p_target_id, UTC_TIMESTAMP());
  COMMIT;
END$$

CREATE PROCEDURE sp_unblock_user(IN p_actor_id BIGINT UNSIGNED, IN p_target_id BIGINT UNSIGNED)
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  START TRANSACTION;
  DELETE FROM user_block WHERE blocker_id = p_actor_id AND blocked_id = p_target_id;
  IF ROW_COUNT() = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Not blocked';
  END IF;
  COMMIT;
END$$

CREATE PROCEDURE sp_friend_overview(IN p_actor_id BIGINT UNSIGNED)
BEGIN                                                        -- no gamertags, only account-level fields
  SELECT x.relation, u.user_id, u.username, u.display_name, u.status, x.since
    FROM (SELECT IF(f.status = 'accepted', 'friend', IF(f.requester_id = p_actor_id, 'outgoing', 'incoming')) AS relation,
                 IF(f.requester_id = p_actor_id, f.addressee_id, f.requester_id) AS other_id,
                 f.created_at AS since
            FROM friendship f
           WHERE f.status IN ('accepted', 'pending')
             AND p_actor_id IN (f.requester_id, f.addressee_id)
          UNION ALL
          SELECT 'blocked', b.blocked_id, b.created_at
            FROM user_block b WHERE b.blocker_id = p_actor_id) x
    JOIN users u ON u.user_id = x.other_id
   ORDER BY FIELD(x.relation, 'friend', 'incoming', 'outgoing', 'blocked'), u.display_name;
END$$

DELIMITER ;
