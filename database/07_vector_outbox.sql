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
DROP TRIGGER IF EXISTS trg_profile_role_ad_vec;
DROP TRIGGER IF EXISTS trg_session_ai_vec;
DROP TRIGGER IF EXISTS trg_session_au_vec;
DROP TRIGGER IF EXISTS trg_session_tag_ai_vec;
DROP TRIGGER IF EXISTS trg_session_tag_ad_vec;
DROP TRIGGER IF EXISTS trg_session_language_ai_vec;
DROP TRIGGER IF EXISTS trg_session_language_ad_vec;
DROP TRIGGER IF EXISTS trg_session_slot_ai_vec;
DROP TRIGGER IF EXISTS trg_session_slot_au_vec;
DROP TRIGGER IF EXISTS trg_session_slot_ad_vec;

DELIMITER $$

-- ============================================================ queue helpers
-- One row per entity: a newer change overwrites op and enqueued_at, so the worker only sees the latest.
CREATE PROCEDURE sp_vec_enqueue(IN p_entity VARCHAR(16), IN p_id BIGINT UNSIGNED, IN p_op VARCHAR(16))
MODIFIES SQL DATA
BEGIN
  INSERT INTO embedding_outbox (entity, entity_id, op) VALUES (p_entity, p_id, p_op) AS n
  ON DUPLICATE KEY UPDATE op = n.op, enqueued_at = CURRENT_TIMESTAMP(6), attempts = 0, last_error = NULL;
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
CREATE TRIGGER trg_profile_role_ad_vec AFTER DELETE ON profile_role FOR EACH ROW
  CALL sp_vec_enqueue_profile(OLD.profile_id)$$

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

DELIMITER ;
