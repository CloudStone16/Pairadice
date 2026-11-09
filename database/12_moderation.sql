SET NAMES utf8mb4;
SET time_zone = '+00:00';   -- all DATETIME columns are UTC
-- PairADice moderation. Run after 01_schema.sql and 02_routines.sql, before 04_rbac.sql (which grants EXECUTE on
-- these routines: players get sp_report_user and sp_my_reports, moderators the rest except the two role
-- procedures, which only the admin role can run through its EXECUTE on the whole schema).
-- IMPORTANT: these procedures open and COMMIT their own transaction. Never call them inside a caller's transaction.
-- They replace four direct grants that skipped every rule: player INSERT on report (reporter_id was not checked),
-- moderator INSERT on sanction, UPDATE on report and UPDATE (is_deleted) on message (no audit row). p_actor_id is
-- the only identity used. Refusals are SQLSTATE 45000 with a sentence a user can read.
--   fn_staff_rank          0 player, 1 moderator, 2 admin
--   sp_report_user         file a report (rate limited, evidence must be visible to the reporter)
--   sp_my_reports          the reporter's own reports; never the handler or the sanction
--   sp_claim_report        open -> reviewing, handled_by = actor
--   sp_resolve_report      reviewing/open -> dismissed|actioned; the note is merged into the status_change audit row
--   sp_issue_sanction      warn / mute / suspend / ban with the duration and staff-rank rules; may action a report
--   sp_lift_sanction       ends a sanction now, recomputes the user's status, audits 'sanction lift' with the reason
--   sp_moderate_message    hide or restore a message (soft delete); audits 'message hide' / 'message restore'
--   sp_grant_role / sp_revoke_role   admin only; revoke audits 'user_role revoke'
--   ev_expire_sanctions    EVENT every 5 minutes calling sp_expire_sanctions (needs event_scheduler = ON)
-- Audit rows never contain password hashes or message bodies.
USE pairadice;

DROP FUNCTION  IF EXISTS fn_staff_rank;
DROP PROCEDURE IF EXISTS sp_report_user;
DROP PROCEDURE IF EXISTS sp_my_reports;
DROP PROCEDURE IF EXISTS sp_claim_report;
DROP PROCEDURE IF EXISTS sp_resolve_report;
DROP PROCEDURE IF EXISTS sp_issue_sanction;
DROP PROCEDURE IF EXISTS sp_lift_sanction;
DROP PROCEDURE IF EXISTS sp_moderate_message;
DROP PROCEDURE IF EXISTS sp_grant_role;
DROP PROCEDURE IF EXISTS sp_revoke_role;
DROP EVENT     IF EXISTS ev_expire_sanctions;

DELIMITER $$

CREATE FUNCTION fn_staff_rank(p_user_id BIGINT UNSIGNED)
RETURNS TINYINT READS SQL DATA
BEGIN                                                        -- highest role wins: admin 2, moderator 1, anyone else 0
  RETURN CASE
    WHEN EXISTS (SELECT 1 FROM user_role ur JOIN role r ON r.role_id = ur.role_id
                  WHERE ur.user_id = p_user_id AND r.role_name = 'admin')     THEN 2
    WHEN EXISTS (SELECT 1 FROM user_role ur JOIN role r ON r.role_id = ur.role_id
                  WHERE ur.user_id = p_user_id AND r.role_name = 'moderator') THEN 1
    ELSE 0 END;
END$$

-- ============================================================ player side
CREATE PROCEDURE sp_report_user(IN p_actor_id BIGINT UNSIGNED, IN p_reported_id BIGINT UNSIGNED,
                                IN p_category VARCHAR(16), IN p_description TEXT,
                                IN p_session_id BIGINT UNSIGNED, IN p_message_id BIGINT UNSIGNED,
                                OUT p_report_id BIGINT UNSIGNED)
BEGIN
  DECLARE v_desc     TEXT DEFAULT NULLIF(TRIM(p_description), '');
  DECLARE v_locked   BIGINT UNSIGNED;
  DECLARE v_sender   BIGINT UNSIGNED;
  DECLARE v_msg_sess BIGINT UNSIGNED;
  DECLARE v_msg_recv BIGINT UNSIGNED;
  DECLARE v_count    INT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  SET p_report_id = NULL;
  IF NOT fn_user_active(p_actor_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Your account cannot do that right now.';
  END IF;
  IF NOT fn_has_permission(p_actor_id, 'report.create') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You are not allowed to report players.';
  END IF;
  IF p_reported_id IS NULL OR NOT EXISTS (SELECT 1 FROM users WHERE user_id = p_reported_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That player does not exist.';
  END IF;
  IF p_reported_id = p_actor_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You cannot report yourself.';
  END IF;
  IF p_category IS NULL OR p_category NOT IN ('harassment', 'cheating', 'spam', 'no_show', 'other') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Choose a report category.';
  END IF;
  IF v_desc IS NOT NULL AND CHAR_LENGTH(v_desc) > 1000 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The description must be 1000 characters or fewer.';
  END IF;
  IF p_session_id IS NOT NULL AND (
       (SELECT COUNT(*) FROM session_participant
         WHERE session_id = p_session_id AND user_id IN (p_actor_id, p_reported_id)
           AND status IN ('accepted', 'left', 'kicked')) < 2) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You and that player were not in that session together.';
  END IF;
  IF p_message_id IS NOT NULL THEN
    SELECT sender_id, session_id, receiver_id INTO v_sender, v_msg_sess, v_msg_recv
      FROM message WHERE message_id = p_message_id;
    -- one generic refusal for missing, wrong-sender and invisible messages, so ids cannot be probed
    IF v_sender IS NULL OR v_sender <> p_reported_id
       OR NOT ((v_msg_recv IS NOT NULL AND v_msg_recv = p_actor_id)
            OR (v_msg_sess IS NOT NULL AND EXISTS (SELECT 1 FROM session_participant
                                                    WHERE session_id = v_msg_sess AND user_id = p_actor_id
                                                      AND status = 'accepted'))) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That message cannot be attached to this report.';
    END IF;
  END IF;

  START TRANSACTION;
  SELECT user_id INTO v_locked FROM users WHERE user_id = p_actor_id FOR UPDATE;   -- serialises one reporter's limits
  IF EXISTS (SELECT 1 FROM report
              WHERE reporter_id = p_actor_id AND reported_user_id = p_reported_id
                AND status IN ('open', 'reviewing') AND created_at > UTC_TIMESTAMP() - INTERVAL 24 HOUR) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You already reported this player.';
  END IF;
  SELECT COUNT(*) INTO v_count FROM report
   WHERE reporter_id = p_actor_id AND created_at > UTC_TIMESTAMP() - INTERVAL 24 HOUR;
  IF v_count >= 10 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You have sent too many reports today. Please try again tomorrow.';
  END IF;
  INSERT INTO report (reporter_id, reported_user_id, session_id, message_id, category, description, created_at)
  VALUES (p_actor_id, p_reported_id, p_session_id, p_message_id, p_category, v_desc, UTC_TIMESTAMP());
  SET p_report_id = LAST_INSERT_ID();
  COMMIT;
END$$

CREATE PROCEDURE sp_my_reports(IN p_actor_id BIGINT UNSIGNED)
BEGIN                                                        -- own reports only; no handler, no sanction, no description
  SELECT r.report_id, r.reported_user_id, u.username AS reported_username, r.category, r.status,
         r.created_at, r.resolved_at
    FROM report r JOIN users u ON u.user_id = r.reported_user_id
   WHERE r.reporter_id = p_actor_id
   ORDER BY r.created_at DESC, r.report_id DESC;
END$$

-- ============================================================ report handling
CREATE PROCEDURE sp_claim_report(IN p_actor_id BIGINT UNSIGNED, IN p_report_id BIGINT UNSIGNED)
BEGIN
  DECLARE v_reporter BIGINT UNSIGNED;
  DECLARE v_reported BIGINT UNSIGNED;
  DECLARE v_status   VARCHAR(16);
  DECLARE v_handler  BIGINT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  IF NOT fn_user_active(p_actor_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Your account cannot do that right now.';
  END IF;
  IF NOT fn_has_permission(p_actor_id, 'report.review') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only moderators can handle reports.';
  END IF;
  START TRANSACTION;
  SELECT reporter_id, reported_user_id, status, handled_by INTO v_reporter, v_reported, v_status, v_handler
    FROM report WHERE report_id = p_report_id FOR UPDATE;
  IF v_status IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That report does not exist.';
  END IF;
  IF p_actor_id IN (v_reporter, v_reported) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You cannot handle a report you filed or are the subject of.';
  END IF;
  IF v_status IN ('actioned', 'dismissed') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That report is already resolved.';
  END IF;
  IF v_status = 'reviewing' THEN
    IF v_handler = p_actor_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You already hold this report.';
    END IF;
    IF fn_staff_rank(p_actor_id) < 2 THEN                    -- only an admin may take over
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Another moderator already holds this report.';
    END IF;
    UPDATE report SET handled_by = p_actor_id WHERE report_id = p_report_id;
    INSERT INTO audit_log (actor_id, entity, entity_id, action, old_value, new_value)
    VALUES (p_actor_id, 'report', p_report_id, 'takeover',
            JSON_OBJECT('handled_by', v_handler), JSON_OBJECT('handled_by', p_actor_id));
  ELSE
    UPDATE report SET status = 'reviewing', handled_by = p_actor_id WHERE report_id = p_report_id;
  END IF;
  COMMIT;
END$$

CREATE PROCEDURE sp_resolve_report(IN p_actor_id BIGINT UNSIGNED, IN p_report_id BIGINT UNSIGNED,
                                   IN p_outcome VARCHAR(16), IN p_note TEXT)
BEGIN
  DECLARE v_note     TEXT DEFAULT NULLIF(TRIM(p_note), '');
  DECLARE v_reporter BIGINT UNSIGNED;
  DECLARE v_reported BIGINT UNSIGNED;
  DECLARE v_status   VARCHAR(16);
  DECLARE v_handler  BIGINT UNSIGNED;
  DECLARE v_log      BIGINT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  IF NOT fn_user_active(p_actor_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Your account cannot do that right now.';
  END IF;
  IF NOT fn_has_permission(p_actor_id, 'report.review') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only moderators can handle reports.';
  END IF;
  IF p_outcome IS NULL OR p_outcome NOT IN ('dismissed', 'actioned') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Choose dismissed or actioned.';
  END IF;
  IF v_note IS NOT NULL AND CHAR_LENGTH(v_note) > 500 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The note must be 500 characters or fewer.';
  END IF;
  START TRANSACTION;
  SELECT reporter_id, reported_user_id, status, handled_by INTO v_reporter, v_reported, v_status, v_handler
    FROM report WHERE report_id = p_report_id FOR UPDATE;
  IF v_status IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That report does not exist.';
  END IF;
  IF p_actor_id IN (v_reporter, v_reported) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You cannot handle a report you filed or are the subject of.';
  END IF;
  IF v_status IN ('actioned', 'dismissed') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That report is already resolved.';
  END IF;
  IF v_status = 'reviewing' AND v_handler IS NOT NULL AND v_handler <> p_actor_id AND fn_staff_rank(p_actor_id) < 2 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Another moderator already holds this report.';
  END IF;
  UPDATE report SET status = p_outcome, handled_by = p_actor_id WHERE report_id = p_report_id;   -- trigger audits it
  IF v_note IS NOT NULL THEN                                 -- merge the note into the status_change row just written
    SELECT MAX(log_id) INTO v_log FROM audit_log
     WHERE entity = 'report' AND entity_id = CAST(p_report_id AS CHAR) AND action = 'status_change';
    UPDATE audit_log SET new_value = JSON_SET(new_value, '$.note', v_note) WHERE log_id = v_log;
  END IF;
  COMMIT;
END$$

-- ============================================================ sanctions
CREATE PROCEDURE sp_issue_sanction(IN p_actor_id BIGINT UNSIGNED, IN p_user_id BIGINT UNSIGNED,
                                   IN p_type VARCHAR(16), IN p_reason VARCHAR(1000), IN p_ends_at DATETIME,
                                   IN p_report_id BIGINT UNSIGNED, OUT p_sanction_id BIGINT UNSIGNED)
BEGIN
  DECLARE v_reason   VARCHAR(1000) DEFAULT TRIM(p_reason);
  DECLARE v_now      DATETIME DEFAULT UTC_TIMESTAMP();
  DECLARE v_actor_rk TINYINT;
  DECLARE v_target_rk TINYINT;
  DECLARE v_reporter BIGINT UNSIGNED;
  DECLARE v_reported BIGINT UNSIGNED;
  DECLARE v_status   VARCHAR(16);
  DECLARE v_handler  BIGINT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN SET @audit_actor = NULL; ROLLBACK; RESIGNAL; END;

  SET p_sanction_id = NULL;
  IF NOT fn_user_active(p_actor_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Your account cannot do that right now.';
  END IF;
  IF NOT fn_has_permission(p_actor_id, 'user.sanction') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You are not allowed to issue sanctions.';
  END IF;
  IF p_type IS NULL OR p_type NOT IN ('warn', 'mute', 'suspend', 'ban') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Choose a sanction type.';
  END IF;
  IF p_type = 'ban' AND NOT fn_has_permission(p_actor_id, 'user.ban') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only admins can ban users';
  END IF;
  IF v_reason IS NULL OR CHAR_LENGTH(v_reason) < 3 OR CHAR_LENGTH(v_reason) > 255 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Give a reason of 3 to 255 characters.';
  END IF;
  IF p_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM users WHERE user_id = p_user_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That player does not exist.';
  END IF;
  IF p_user_id = p_actor_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You cannot sanction yourself.';
  END IF;
  SET v_actor_rk = fn_staff_rank(p_actor_id), v_target_rk = fn_staff_rank(p_user_id);
  IF v_actor_rk < 2 AND v_target_rk >= 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Moderators cannot sanction staff.';
  END IF;
  IF v_actor_rk = 2 AND v_target_rk = 2 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Admins cannot sanction another admin.';
  END IF;
  IF p_type IN ('warn', 'ban') THEN
    IF p_ends_at IS NOT NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A warning or ban has no end date.';
    END IF;
  ELSE
    IF p_ends_at IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Choose when this sanction ends.';
    END IF;
    IF p_ends_at <= v_now THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The end date must be in the future.';
    END IF;
    IF p_ends_at > v_now + INTERVAL 90 DAY THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A sanction can last at most 90 days.';
    END IF;
  END IF;

  START TRANSACTION;
  IF p_report_id IS NOT NULL THEN
    SELECT reporter_id, reported_user_id, status, handled_by INTO v_reporter, v_reported, v_status, v_handler
      FROM report WHERE report_id = p_report_id FOR UPDATE;
    IF v_status IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That report does not exist.';
    END IF;
    IF v_reported <> p_user_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That report is about a different player.';
    END IF;
    IF v_reporter = p_actor_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You cannot handle a report you filed or are the subject of.';
    END IF;
    IF v_status IN ('actioned', 'dismissed') THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That report is already resolved.';
    END IF;
    IF v_status = 'reviewing' AND v_handler IS NOT NULL AND v_handler <> p_actor_id AND v_actor_rk < 2 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Another moderator already holds this report.';
    END IF;
  END IF;
  IF p_report_id IS NOT NULL AND v_status = 'reviewing' AND v_handler IS NOT NULL AND v_handler <> p_actor_id THEN
    INSERT INTO audit_log (actor_id, entity, entity_id, action, old_value, new_value)   -- admin takeover, as sp_claim_report
    VALUES (p_actor_id, 'report', p_report_id, 'takeover',
            JSON_OBJECT('handled_by', v_handler), JSON_OBJECT('handled_by', p_actor_id));
  END IF;
  SET @audit_actor = p_actor_id;
  INSERT INTO sanction (user_id, sanction_type, reason, issued_by, report_id, starts_at, ends_at)
  VALUES (p_user_id, p_type, v_reason, p_actor_id, p_report_id, v_now, p_ends_at);   -- triggers audit and flip status
  SET p_sanction_id = LAST_INSERT_ID();
  IF p_report_id IS NOT NULL THEN
    UPDATE report SET status = 'actioned', handled_by = p_actor_id WHERE report_id = p_report_id;
  END IF;
  SET @audit_actor = NULL;
  COMMIT;
END$$

CREATE PROCEDURE sp_lift_sanction(IN p_actor_id BIGINT UNSIGNED, IN p_sanction_id BIGINT UNSIGNED,
                                  IN p_reason VARCHAR(1000))
BEGIN
  DECLARE v_reason  VARCHAR(1000) DEFAULT TRIM(p_reason);
  DECLARE v_user    BIGINT UNSIGNED;
  DECLARE v_type    VARCHAR(16);
  DECLARE v_starts  DATETIME;
  DECLARE v_ends    DATETIME;
  DECLARE v_found   INT DEFAULT 0;
  DECLARE v_new_end DATETIME;
  DECLARE v_issuer  BIGINT UNSIGNED;
  DECLARE v_locked  BIGINT UNSIGNED;
  DECLARE v_bans    INT;
  DECLARE v_susps   INT;
  DECLARE v_active  INT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN SET @audit_actor = NULL; ROLLBACK; RESIGNAL; END;

  IF NOT fn_user_active(p_actor_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Your account cannot do that right now.';
  END IF;
  IF NOT fn_has_permission(p_actor_id, 'user.sanction') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You are not allowed to lift sanctions.';
  END IF;
  IF v_reason IS NULL OR CHAR_LENGTH(v_reason) < 3 OR CHAR_LENGTH(v_reason) > 255 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Give a reason of 3 to 255 characters.';
  END IF;
  START TRANSACTION;
  SELECT 1, user_id, sanction_type, starts_at, ends_at, issued_by INTO v_found, v_user, v_type, v_starts, v_ends, v_issuer
    FROM sanction WHERE sanction_id = p_sanction_id FOR UPDATE;
  IF v_found = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That sanction does not exist.';
  END IF;
  IF v_type = 'ban' AND NOT fn_has_permission(p_actor_id, 'user.ban') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only admins can lift a ban.';
  END IF;
  IF v_user = p_actor_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You cannot lift your own sanction.';
  END IF;
  IF fn_staff_rank(p_actor_id) < 2 AND fn_staff_rank(v_user) >= 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Moderators cannot lift sanctions on staff.';
  END IF;
  IF fn_staff_rank(p_actor_id) < fn_staff_rank(v_issuer) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You cannot lift a sanction issued by a higher-ranked staff member.';
  END IF;
  IF v_ends IS NOT NULL AND v_ends <= UTC_TIMESTAMP() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That sanction has already ended.';
  END IF;

  SET v_new_end = GREATEST(UTC_TIMESTAMP(), v_starts + INTERVAL 1 SECOND);
  UPDATE sanction SET ends_at = v_new_end WHERE sanction_id = p_sanction_id;
  INSERT INTO audit_log (actor_id, entity, entity_id, action, old_value, new_value)
  VALUES (p_actor_id, 'sanction', p_sanction_id, 'lift',
          JSON_OBJECT('user_id', v_user, 'type', v_type, 'ends_at', v_ends),
          JSON_OBJECT('ends_at', v_new_end, 'reason', v_reason));

  SET @audit_actor = p_actor_id;                             -- trg_users_au records who restored the status
  SELECT user_id INTO v_locked FROM users WHERE user_id = v_user FOR UPDATE;   -- serialise against issue / expire
  -- The lifted sanction never counts: ck_sn_period forces ends_at > starts_at, so a lift in the sanction's own second
  -- leaves ends_at up to a second ahead. Sanctions lifted earlier (audit 'lift' row) are left out for the same reason.
  -- Counted into variables first: the UPDATE's own trigger writes audit_log, which it cannot also read (error 1442).
  -- The trust score uses the same formula as fn_trust_score, over the same remaining sanctions.
  SELECT SUM(sanction_type = 'ban'), SUM(sanction_type = 'suspend'), COUNT(*) INTO v_bans, v_susps, v_active
    FROM sanction s
   WHERE s.user_id = v_user AND s.sanction_type IN ('mute', 'suspend', 'ban') AND s.sanction_id <> p_sanction_id
     AND s.starts_at <= UTC_TIMESTAMP() AND (s.ends_at IS NULL OR s.ends_at > UTC_TIMESTAMP())
     AND NOT EXISTS (SELECT 1 FROM audit_log al WHERE al.entity = 'sanction' AND al.entity_id = CAST(s.sanction_id AS CHAR)
                        AND al.action = 'lift');
  UPDATE users
     SET status = CASE WHEN IFNULL(v_bans, 0) > 0 THEN 'banned' WHEN IFNULL(v_susps, 0) > 0 THEN 'suspended' ELSE 'active' END,
         trust_score = GREATEST(0, LEAST(100, 50 + 3 * sessions_completed + IFNULL((avg_rating - 3) * 10, 0) - 20 * v_active))
   WHERE user_id = v_user;
  SET @audit_actor = NULL;
  COMMIT;
END$$

-- ============================================================ message moderation
CREATE PROCEDURE sp_moderate_message(IN p_actor_id BIGINT UNSIGNED, IN p_message_id BIGINT UNSIGNED,
                                     IN p_hide BOOLEAN, IN p_report_id BIGINT UNSIGNED)
BEGIN                                                        -- soft delete keeps the evidence; the audit row has no body
  DECLARE v_deleted BOOLEAN;
  DECLARE v_sender  BIGINT UNSIGNED;
  DECLARE v_found   INT DEFAULT 0;
  DECLARE v_rep_by  BIGINT UNSIGNED;
  DECLARE v_rep_on  BIGINT UNSIGNED;
  DECLARE v_rep_msg BIGINT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  IF NOT fn_user_active(p_actor_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Your account cannot do that right now.';
  END IF;
  IF NOT fn_has_permission(p_actor_id, 'report.review') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only moderators can hide or restore messages.';
  END IF;
  IF p_hide IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Choose hide or restore.';
  END IF;
  IF p_report_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM report WHERE report_id = p_report_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That report does not exist.';
  END IF;
  START TRANSACTION;
  SELECT 1, is_deleted, sender_id INTO v_found, v_deleted, v_sender
    FROM message WHERE message_id = p_message_id FOR UPDATE;
  IF v_found = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That message does not exist.';
  END IF;
  IF v_sender = p_actor_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You cannot moderate your own message.';
  END IF;
  IF p_report_id IS NOT NULL THEN
    SELECT reporter_id, reported_user_id, message_id INTO v_rep_by, v_rep_on, v_rep_msg
      FROM report WHERE report_id = p_report_id;
    IF p_actor_id IN (v_rep_by, v_rep_on) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You cannot handle a report you filed or are the subject of.';
    END IF;
    IF NOT (v_rep_msg <=> p_message_id) AND v_rep_on <> v_sender THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That report is about a different message.';
    END IF;
  END IF;
  IF v_deleted = p_hide THEN
    IF p_hide THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That message is already hidden.';
    END IF;
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That message is already visible.';
  END IF;
  UPDATE message SET is_deleted = p_hide WHERE message_id = p_message_id;
  INSERT INTO audit_log (actor_id, entity, entity_id, action, old_value, new_value)
  VALUES (p_actor_id, 'message', p_message_id, IF(p_hide, 'hide', 'restore'),
          JSON_OBJECT('is_deleted', v_deleted),
          JSON_OBJECT('is_deleted', p_hide, 'sender_id', v_sender, 'report_id', p_report_id));
  COMMIT;
END$$

-- ============================================================ roles (admin only)
CREATE PROCEDURE sp_grant_role(IN p_actor_id BIGINT UNSIGNED, IN p_user_id BIGINT UNSIGNED, IN p_role_name VARCHAR(32))
BEGIN                                                        -- trg_user_role_bi checks role.assign, trg_user_role_ai audits
  DECLARE v_role TINYINT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  IF NOT fn_user_active(p_actor_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Your account cannot do that right now.';
  END IF;
  IF NOT fn_has_permission(p_actor_id, 'role.assign') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only admins can change roles.';
  END IF;
  SELECT role_id INTO v_role FROM role WHERE role_name = p_role_name;
  IF v_role IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That role does not exist.';
  END IF;
  IF p_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM users WHERE user_id = p_user_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That player does not exist.';
  END IF;
  START TRANSACTION;
  IF EXISTS (SELECT 1 FROM user_role WHERE user_id = p_user_id AND role_id = v_role FOR UPDATE) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That player already has that role.';
  END IF;
  INSERT INTO user_role (user_id, role_id, assigned_at, assigned_by)
  VALUES (p_user_id, v_role, UTC_TIMESTAMP(), p_actor_id);
  COMMIT;
END$$

CREATE PROCEDURE sp_revoke_role(IN p_actor_id BIGINT UNSIGNED, IN p_user_id BIGINT UNSIGNED, IN p_role_name VARCHAR(32))
BEGIN
  DECLARE v_role   TINYINT UNSIGNED;
  DECLARE v_admins INT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  IF NOT fn_user_active(p_actor_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Your account cannot do that right now.';
  END IF;
  IF NOT fn_has_permission(p_actor_id, 'role.assign') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only admins can change roles.';
  END IF;
  SELECT role_id INTO v_role FROM role WHERE role_name = p_role_name;
  IF v_role IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That role does not exist.';
  END IF;
  IF p_role_name = 'player' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The player role cannot be removed.';
  END IF;
  IF p_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM users WHERE user_id = p_user_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That player does not exist.';
  END IF;
  START TRANSACTION;
  IF p_role_name = 'admin' THEN
    SELECT COUNT(*) INTO v_admins FROM user_role ur JOIN users u ON u.user_id = ur.user_id
     WHERE ur.role_id = v_role AND u.status = 'active' FOR UPDATE;
    IF v_admins <= 1 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You cannot remove the last admin.';
    END IF;
    IF p_user_id = p_actor_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You cannot remove your own admin role.';
    END IF;
  END IF;
  DELETE FROM user_role WHERE user_id = p_user_id AND role_id = v_role;
  IF ROW_COUNT() = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That player does not have that role.';
  END IF;
  INSERT INTO audit_log (actor_id, entity, entity_id, action, old_value)
  VALUES (p_actor_id, 'user_role', p_user_id, 'revoke', JSON_OBJECT('role_id', v_role, 'role', p_role_name));
  COMMIT;
END$$

DELIMITER ;

-- ============================================================ scheduled expiry
-- Returns suspended users to active once their last suspension has ended (it never restores a banned user).
-- Runs only while the server has event_scheduler = ON (the MySQL 8+ default); the web sanctions page also calls
-- sp_expire_sanctions on load, so a server with the scheduler off still converges.
CREATE EVENT IF NOT EXISTS ev_expire_sanctions
  ON SCHEDULE EVERY 5 MINUTE
  COMMENT 'Lifts expired suspensions and refreshes trust scores'
  DO CALL sp_expire_sanctions();
