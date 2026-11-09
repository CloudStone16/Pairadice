SET NAMES utf8mb4;
SET time_zone = '+00:00';   -- all DATETIME columns are UTC
-- PairADice vector-store sync: triggers that queue MongoDB re-embeds in embedding_outbox.
-- Run after 02_routines.sql (setup.sh loads it after 04). Safe to re-run: every object is dropped first.
-- The Node worker (vector/scripts/worker.js) drains the queue into MongoDB.
-- Only interest signals are embedded (bio, tags, games/modes/roles, session text); the other
-- columns watched here feed the MongoDB filter fields (status, region, languages, rating).
USE pairadice;

DROP PROCEDURE IF EXISTS sp_vec_enqueue;
DROP PROCEDURE IF EXISTS sp_vec_enqueue_profile;
DROP TRIGGER IF EXISTS trg_users_au_vec;
DROP TRIGGER IF EXISTS trg_user_tag_ai_vec;
DROP TRIGGER IF EXISTS trg_user_tag_ad_vec;
DROP TRIGGER IF EXISTS trg_user_language_ai_vec;
DROP TRIGGER IF EXISTS trg_user_language_au_vec;
DROP TRIGGER IF EXISTS trg_user_language_ad_vec;
DROP TRIGGER IF EXISTS trg_pgp_ai_vec;
DROP TRIGGER IF EXISTS trg_pgp_au_vec;
DROP TRIGGER IF EXISTS trg_pgp_ad_vec;
DROP TRIGGER IF EXISTS trg_profile_mode_ai_vec;
DROP TRIGGER IF EXISTS trg_profile_mode_au_vec;
DROP TRIGGER IF EXISTS trg_profile_mode_ad_vec;
DROP TRIGGER IF EXISTS trg_profile_role_ai_vec;
DROP TRIGGER IF EXISTS trg_profile_role_au_vec;
DROP TRIGGER IF EXISTS trg_profile_role_ad_vec;
DROP TRIGGER IF EXISTS trg_platform_account_au_vec;
DROP TRIGGER IF EXISTS trg_platform_account_ad_vec;
DROP TRIGGER IF EXISTS trg_session_ai_vec;
DROP TRIGGER IF EXISTS trg_session_au_vec;
DROP TRIGGER IF EXISTS trg_session_tag_ai_vec;
DROP TRIGGER IF EXISTS trg_session_tag_ad_vec;
DROP TRIGGER IF EXISTS trg_session_language_ai_vec;
DROP TRIGGER IF EXISTS trg_session_language_ad_vec;
DROP TRIGGER IF EXISTS trg_session_slot_ai_vec;
DROP TRIGGER IF EXISTS trg_session_slot_au_vec;
DROP TRIGGER IF EXISTS trg_session_slot_ad_vec;
DROP TRIGGER IF EXISTS trg_game_au_vec;
DROP TRIGGER IF EXISTS trg_game_mode_au_vec;
DROP TRIGGER IF EXISTS trg_game_role_au_vec;
DROP TRIGGER IF EXISTS trg_tag_au_vec;
DROP VIEW IF EXISTS v_outbox_dead;

DELIMITER $$

-- ============================================================ queue helpers
-- One row per entity: a newer change overwrites op and enqueued_at, so the worker only sees the latest.
CREATE PROCEDURE sp_vec_enqueue(IN p_entity VARCHAR(16), IN p_id BIGINT UNSIGNED, IN p_op VARCHAR(16))
MODIFIES SQL DATA
BEGIN
  -- UTC_TIMESTAMP, not CURRENT_TIMESTAMP: a writer whose session is not set to UTC (a plain mysql shell
  -- on an IST machine) would otherwise stamp local time and the queue's ages would be off by hours.
  INSERT INTO embedding_outbox (entity, entity_id, op, enqueued_at) VALUES (p_entity, p_id, p_op, UTC_TIMESTAMP(6)) AS n
  ON DUPLICATE KEY UPDATE op = n.op, enqueued_at = UTC_TIMESTAMP(6), attempts = 0, last_error = NULL;
END$$

CREATE PROCEDURE sp_vec_enqueue_profile(IN p_profile_id BIGINT UNSIGNED)
MODIFIES SQL DATA
BEGIN                                                        -- profile_mode / profile_role rows belong to a user via the profile
  DECLARE v_user BIGINT UNSIGNED;
  SELECT user_id INTO v_user FROM player_game_profile WHERE profile_id = p_profile_id;
  IF v_user IS NOT NULL THEN CALL sp_vec_enqueue('player', v_user, 'upsert'); END IF;
END$$

-- ============================================================ player embedding sources
CREATE TRIGGER trg_users_au_vec AFTER UPDATE ON users FOR EACH ROW FOLLOWS trg_users_au
BEGIN                                                        -- users are never deleted: a ban removes the embedding
  IF NOT (NEW.bio <=> OLD.bio AND NEW.username <=> OLD.username AND NEW.display_name <=> OLD.display_name
          AND NEW.status <=> OLD.status
          AND NEW.home_region_id <=> OLD.home_region_id AND NEW.avg_rating <=> OLD.avg_rating) THEN
    CALL sp_vec_enqueue('player', NEW.user_id, IF(NEW.status = 'banned', 'delete', 'upsert'));
  END IF;
END$$

CREATE TRIGGER trg_user_tag_ai_vec AFTER INSERT ON user_tag FOR EACH ROW
  CALL sp_vec_enqueue('player', NEW.user_id, 'upsert')$$
CREATE TRIGGER trg_user_tag_ad_vec AFTER DELETE ON user_tag FOR EACH ROW
  CALL sp_vec_enqueue('player', OLD.user_id, 'upsert')$$

CREATE TRIGGER trg_user_language_ai_vec AFTER INSERT ON user_language FOR EACH ROW
  CALL sp_vec_enqueue('player', NEW.user_id, 'upsert')$$
CREATE TRIGGER trg_user_language_au_vec AFTER UPDATE ON user_language FOR EACH ROW
  CALL sp_vec_enqueue('player', NEW.user_id, 'upsert')$$
CREATE TRIGGER trg_user_language_ad_vec AFTER DELETE ON user_language FOR EACH ROW
  CALL sp_vec_enqueue('player', OLD.user_id, 'upsert')$$

CREATE TRIGGER trg_pgp_ai_vec AFTER INSERT ON player_game_profile FOR EACH ROW
  CALL sp_vec_enqueue('player', NEW.user_id, 'upsert')$$
CREATE TRIGGER trg_pgp_au_vec AFTER UPDATE ON player_game_profile FOR EACH ROW
  CALL sp_vec_enqueue('player', NEW.user_id, 'upsert')$$
CREATE TRIGGER trg_pgp_ad_vec AFTER DELETE ON player_game_profile FOR EACH ROW
  CALL sp_vec_enqueue('player', OLD.user_id, 'upsert')$$

-- profile rows deleted by the player_game_profile cascade fire no triggers; trg_pgp_ad_vec covers them
CREATE TRIGGER trg_profile_mode_ai_vec AFTER INSERT ON profile_mode FOR EACH ROW
  CALL sp_vec_enqueue_profile(NEW.profile_id)$$
CREATE TRIGGER trg_profile_mode_au_vec AFTER UPDATE ON profile_mode FOR EACH ROW
  CALL sp_vec_enqueue_profile(NEW.profile_id)$$
CREATE TRIGGER trg_profile_mode_ad_vec AFTER DELETE ON profile_mode FOR EACH ROW
  CALL sp_vec_enqueue_profile(OLD.profile_id)$$

CREATE TRIGGER trg_profile_role_ai_vec AFTER INSERT ON profile_role FOR EACH ROW
  CALL sp_vec_enqueue_profile(NEW.profile_id)$$
CREATE TRIGGER trg_profile_role_au_vec AFTER UPDATE ON profile_role FOR EACH ROW
BEGIN                                                        -- preference_order / game_role_id change the 'plays <roles>' text
  CALL sp_vec_enqueue_profile(NEW.profile_id);
  IF OLD.profile_id <> NEW.profile_id THEN CALL sp_vec_enqueue_profile(OLD.profile_id); END IF;
END$$
CREATE TRIGGER trg_profile_role_ad_vec AFTER DELETE ON profile_role FOR EACH ROW
  CALL sp_vec_enqueue_profile(OLD.profile_id)$$

-- platform_ids is a filter field (not embedded text), so these only trigger a cheap refresh.
-- player_game_profile.platform_account_id is ON DELETE SET NULL: FK actions fire no triggers, so cover the delete here
CREATE TRIGGER trg_platform_account_ad_vec AFTER DELETE ON platform_account FOR EACH ROW
  CALL sp_vec_enqueue('player', OLD.user_id, 'upsert')$$
CREATE TRIGGER trg_platform_account_au_vec AFTER UPDATE ON platform_account FOR EACH ROW
BEGIN
  IF NOT (NEW.platform_id <=> OLD.platform_id AND NEW.user_id <=> OLD.user_id) THEN
    CALL sp_vec_enqueue('player', NEW.user_id, 'upsert');
    IF OLD.user_id <> NEW.user_id THEN CALL sp_vec_enqueue('player', OLD.user_id, 'upsert'); END IF;
  END IF;
END$$

-- ============================================================ session embedding sources
CREATE TRIGGER trg_session_ai_vec AFTER INSERT ON lfg_session FOR EACH ROW
  CALL sp_vec_enqueue('session', NEW.session_id, 'upsert')$$

CREATE TRIGGER trg_session_au_vec AFTER UPDATE ON lfg_session FOR EACH ROW FOLLOWS trg_session_au
BEGIN                                                        -- current_players alone is not watched; open <-> full is
  IF NOT (NEW.title <=> OLD.title AND NEW.description <=> OLD.description AND NEW.status <=> OLD.status
          AND NEW.visibility <=> OLD.visibility AND NEW.mode_id <=> OLD.mode_id
          AND NEW.platform_id <=> OLD.platform_id AND NEW.region_id <=> OLD.region_id
          AND NEW.region_locked <=> OLD.region_locked) THEN
    CALL sp_vec_enqueue('session', NEW.session_id,
                        IF(NEW.status IN ('completed','cancelled'), 'delete', 'upsert'));
  END IF;
END$$

CREATE TRIGGER trg_session_tag_ai_vec AFTER INSERT ON session_tag FOR EACH ROW
  CALL sp_vec_enqueue('session', NEW.session_id, 'upsert')$$
CREATE TRIGGER trg_session_tag_ad_vec AFTER DELETE ON session_tag FOR EACH ROW
  CALL sp_vec_enqueue('session', OLD.session_id, 'upsert')$$

CREATE TRIGGER trg_session_language_ai_vec AFTER INSERT ON session_language FOR EACH ROW
  CALL sp_vec_enqueue('session', NEW.session_id, 'upsert')$$
CREATE TRIGGER trg_session_language_ad_vec AFTER DELETE ON session_language FOR EACH ROW
  CALL sp_vec_enqueue('session', OLD.session_id, 'upsert')$$

CREATE TRIGGER trg_session_slot_ai_vec AFTER INSERT ON session_slot FOR EACH ROW
  CALL sp_vec_enqueue('session', NEW.session_id, 'upsert')$$
CREATE TRIGGER trg_session_slot_au_vec AFTER UPDATE ON session_slot FOR EACH ROW
  CALL sp_vec_enqueue('session', NEW.session_id, 'upsert')$$
CREATE TRIGGER trg_session_slot_ad_vec AFTER DELETE ON session_slot FOR EACH ROW
  CALL sp_vec_enqueue('session', OLD.session_id, 'upsert')$$

-- ============================================================ catalogue renames
-- A renamed game / mode / role / tag changes the embedded text of every player and session that mentions it.
-- Same upsert semantics as sp_vec_enqueue (newer change overwrites op / enqueued_at, resets attempts / last_error; UTC like sp_vec_enqueue),
-- done set-based. Banned players and completed / cancelled sessions are skipped (the worker re-checks anyway).
CREATE TRIGGER trg_game_au_vec AFTER UPDATE ON game FOR EACH ROW
BEGIN
  IF NOT (OLD.name <=> NEW.name) THEN
    INSERT INTO embedding_outbox (entity, entity_id, op)
      SELECT DISTINCT 'player', p.user_id, 'upsert'
        FROM player_game_profile p JOIN users u ON u.user_id = p.user_id AND u.status <> 'banned'
       WHERE p.game_id = NEW.game_id
    ON DUPLICATE KEY UPDATE op = 'upsert', enqueued_at = UTC_TIMESTAMP(6), attempts = 0, last_error = NULL;
    INSERT INTO embedding_outbox (entity, entity_id, op)
      SELECT 'session', s.session_id, 'upsert'
        FROM lfg_session s WHERE s.game_id = NEW.game_id AND s.status NOT IN ('completed','cancelled')
    ON DUPLICATE KEY UPDATE op = 'upsert', enqueued_at = UTC_TIMESTAMP(6), attempts = 0, last_error = NULL;
  END IF;
END$$

CREATE TRIGGER trg_game_mode_au_vec AFTER UPDATE ON game_mode FOR EACH ROW
BEGIN
  IF NOT (OLD.name <=> NEW.name) THEN
    INSERT INTO embedding_outbox (entity, entity_id, op)
      SELECT DISTINCT 'player', p.user_id, 'upsert'
        FROM profile_mode pm JOIN player_game_profile p ON p.profile_id = pm.profile_id
        JOIN users u ON u.user_id = p.user_id AND u.status <> 'banned'
       WHERE pm.mode_id = NEW.mode_id
    ON DUPLICATE KEY UPDATE op = 'upsert', enqueued_at = UTC_TIMESTAMP(6), attempts = 0, last_error = NULL;
    INSERT INTO embedding_outbox (entity, entity_id, op)
      SELECT 'session', s.session_id, 'upsert'
        FROM lfg_session s WHERE s.mode_id = NEW.mode_id AND s.status NOT IN ('completed','cancelled')
    ON DUPLICATE KEY UPDATE op = 'upsert', enqueued_at = UTC_TIMESTAMP(6), attempts = 0, last_error = NULL;
  END IF;
END$$

CREATE TRIGGER trg_game_role_au_vec AFTER UPDATE ON game_role FOR EACH ROW
BEGIN
  IF NOT (OLD.name <=> NEW.name) THEN
    INSERT INTO embedding_outbox (entity, entity_id, op)
      SELECT DISTINCT 'player', p.user_id, 'upsert'
        FROM profile_role pr JOIN player_game_profile p ON p.profile_id = pr.profile_id
        JOIN users u ON u.user_id = p.user_id AND u.status <> 'banned'
       WHERE pr.game_role_id = NEW.game_role_id
    ON DUPLICATE KEY UPDATE op = 'upsert', enqueued_at = UTC_TIMESTAMP(6), attempts = 0, last_error = NULL;
    INSERT INTO embedding_outbox (entity, entity_id, op)
      SELECT DISTINCT 'session', s.session_id, 'upsert'
        FROM session_slot ss JOIN lfg_session s ON s.session_id = ss.session_id
       WHERE ss.game_role_id = NEW.game_role_id AND s.status NOT IN ('completed','cancelled')
    ON DUPLICATE KEY UPDATE op = 'upsert', enqueued_at = UTC_TIMESTAMP(6), attempts = 0, last_error = NULL;
  END IF;
END$$

CREATE TRIGGER trg_tag_au_vec AFTER UPDATE ON tag FOR EACH ROW
BEGIN
  IF NOT (OLD.name <=> NEW.name) THEN
    INSERT INTO embedding_outbox (entity, entity_id, op)
      SELECT DISTINCT 'player', ut.user_id, 'upsert'
        FROM user_tag ut JOIN users u ON u.user_id = ut.user_id AND u.status <> 'banned'
       WHERE ut.tag_id = NEW.tag_id
    ON DUPLICATE KEY UPDATE op = 'upsert', enqueued_at = UTC_TIMESTAMP(6), attempts = 0, last_error = NULL;
    INSERT INTO embedding_outbox (entity, entity_id, op)
      SELECT DISTINCT 'session', st.session_id, 'upsert'
        FROM session_tag st JOIN lfg_session s ON s.session_id = st.session_id
       WHERE st.tag_id = NEW.tag_id AND s.status NOT IN ('completed','cancelled')
    ON DUPLICATE KEY UPDATE op = 'upsert', enqueued_at = UTC_TIMESTAMP(6), attempts = 0, last_error = NULL;
  END IF;
END$$

DELIMITER ;

-- ============================================================ dead-letter view
-- Rows the worker has given up on (it only reads attempts < max). The 5 must match the worker's
-- max attempts (vector config OUTBOX_MAX_ATTEMPTS, default 5). A new edit to the entity resets the row.
CREATE OR REPLACE VIEW v_outbox_dead AS
  SELECT entity, entity_id, op, enqueued_at, attempts, last_error
  FROM embedding_outbox
  WHERE attempts >= 5;

-- 04_rbac.sql runs before this file, so the view did not exist yet there: grant here instead.
GRANT SELECT ON pairadice.v_outbox_dead TO 'pairadice_vec_worker';
