SET NAMES utf8mb4;
SET time_zone = '+00:00';   -- all DATETIME columns are UTC
-- PairADice routines: helper functions, procedures, triggers, views.
-- Run after 01_schema.sql. Business rules that CHECK constraints cannot express live here.
USE pairadice;

DELIMITER $$

-- ============================================================ helper functions
CREATE FUNCTION fn_has_permission(p_user_id BIGINT UNSIGNED, p_code VARCHAR(64))
RETURNS BOOLEAN READS SQL DATA
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_role ur
    JOIN role_permission rp ON rp.role_id = ur.role_id
    JOIN permission p       ON p.permission_id = rp.permission_id
    WHERE ur.user_id = p_user_id AND p.code = p_code);
END$$

CREATE FUNCTION fn_is_blocked(p_a BIGINT UNSIGNED, p_b BIGINT UNSIGNED)
RETURNS BOOLEAN READS SQL DATA
BEGIN                                                        -- either direction counts
  RETURN EXISTS (SELECT 1 FROM user_block
                 WHERE (blocker_id = p_a AND blocked_id = p_b) OR (blocker_id = p_b AND blocked_id = p_a));
END$$

CREATE FUNCTION fn_are_friends(p_a BIGINT UNSIGNED, p_b BIGINT UNSIGNED)
RETURNS BOOLEAN READS SQL DATA
BEGIN
  RETURN EXISTS (SELECT 1 FROM friendship
                 WHERE status = 'accepted' AND pair_low = LEAST(p_a, p_b) AND pair_high = GREATEST(p_a, p_b));
END$$

CREATE FUNCTION fn_platform_compatible(p_game_id INT UNSIGNED, p_a SMALLINT UNSIGNED, p_b SMALLINT UNSIGNED)
RETURNS BOOLEAN READS SQL DATA
BEGIN                                                        -- same platform, or same crossplay group for this game
  IF p_a = p_b THEN RETURN TRUE; END IF;
  RETURN EXISTS (SELECT 1 FROM game_platform a
                 JOIN game_platform b ON b.game_id = a.game_id AND b.crossplay_group = a.crossplay_group
                 WHERE a.game_id = p_game_id AND a.platform_id = p_a AND b.platform_id = p_b);
END$$

CREATE FUNCTION fn_local_time(p_utc DATETIME, p_tz VARCHAR(64))
RETURNS DATETIME DETERMINISTIC NO SQL
BEGIN                                                        -- uses MySQL tz tables when loaded, else a fixed-offset fallback
  RETURN COALESCE(
    CONVERT_TZ(p_utc, '+00:00', p_tz),
    CONVERT_TZ(p_utc, '+00:00', CASE p_tz
      WHEN 'Asia/Kolkata'        THEN '+05:30'
      WHEN 'Asia/Tokyo'          THEN '+09:00'
      WHEN 'Europe/London'       THEN '+00:00'
      WHEN 'Europe/Berlin'       THEN '+01:00'
      WHEN 'Europe/Madrid'       THEN '+01:00'
      WHEN 'Europe/Paris'        THEN '+01:00'
      WHEN 'America/New_York'    THEN '-05:00'
      WHEN 'America/Chicago'     THEN '-06:00'
      WHEN 'America/Los_Angeles' THEN '-08:00'
      ELSE '+00:00' END));
END$$

CREATE FUNCTION fn_trust_score(p_user_id BIGINT UNSIGNED, p_sessions INT, p_avg DECIMAL(3,2))
RETURNS DECIMAL(5,2) READS SQL DATA
BEGIN                                                        -- 0..100: base 50, +3 per completed session, rating, -20 per active sanction
  DECLARE v_active INT;
  SELECT COUNT(*) INTO v_active FROM sanction
   WHERE user_id = p_user_id AND sanction_type IN ('mute','suspend','ban')
     AND starts_at <= UTC_TIMESTAMP() AND (ends_at IS NULL OR ends_at > UTC_TIMESTAMP());
  RETURN GREATEST(0, LEAST(100, 50 + 3 * p_sessions + IFNULL((p_avg - 3) * 10, 0) - 20 * v_active));
END$$

-- ============================================================ maintenance procedures
CREATE PROCEDURE sp_refresh_session(IN p_session_id BIGINT UNSIGNED)
BEGIN                                                        -- current_players + open <-> full
  DECLARE v_cnt INT;
  SELECT COUNT(*) INTO v_cnt FROM session_participant
   WHERE session_id = p_session_id AND status = 'accepted';
  UPDATE lfg_session
     SET current_players = v_cnt,
         status = CASE WHEN status = 'open' AND v_cnt >= max_players THEN 'full'
                       WHEN status = 'full' AND v_cnt <  max_players THEN 'open'
                       ELSE status END
   WHERE session_id = p_session_id;
END$$

CREATE PROCEDURE sp_refresh_user_stats(IN p_user_id BIGINT UNSIGNED)
BEGIN                                                        -- avg_rating, review_count, trust_score, Great Teammate badge
  DECLARE v_cnt INT;
  DECLARE v_avg DECIMAL(3,2);
  SELECT COUNT(*), ROUND(AVG(rating), 2) INTO v_cnt, v_avg FROM review WHERE reviewed_id = p_user_id;
  UPDATE users
     SET review_count = v_cnt,
         avg_rating   = v_avg,
         trust_score  = fn_trust_score(user_id, sessions_completed, v_avg)
   WHERE user_id = p_user_id;
  IF v_cnt >= 3 AND v_avg >= 4.50 THEN
    INSERT IGNORE INTO user_badge (user_id, badge_id)
    SELECT p_user_id, badge_id FROM badge WHERE name = 'Great Teammate';
  END IF;
END$$

CREATE PROCEDURE sp_expire_sanctions()
BEGIN                                                        -- lift expired suspensions (run periodically)
  UPDATE users u
     SET u.status = 'active'
   WHERE u.status = 'suspended'
     AND NOT EXISTS (SELECT 1 FROM sanction s
                     WHERE s.user_id = u.user_id AND s.sanction_type = 'suspend'
                       AND (s.ends_at IS NULL OR s.ends_at > UTC_TIMESTAMP()));
  UPDATE users SET trust_score = fn_trust_score(user_id, sessions_completed, avg_rating);
END$$

-- ============================================================ matching flow
CREATE PROCEDURE sp_accept_participant(IN p_session_id BIGINT UNSIGNED,
                                       IN p_user_id    BIGINT UNSIGNED,
                                       IN p_actor_id   BIGINT UNSIGNED)
BEGIN                                                        -- host approves a join request; row lock prevents overbooking
  DECLARE v_host    BIGINT UNSIGNED;
  DECLARE v_status  VARCHAR(16);
  DECLARE v_cur     INT;
  DECLARE v_max     INT;
  DECLARE v_pstatus VARCHAR(16);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  START TRANSACTION;
  SELECT host_id, status, current_players, max_players
    INTO v_host, v_status, v_cur, v_max
    FROM lfg_session WHERE session_id = p_session_id FOR UPDATE;
  IF v_host IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Session not found';
  END IF;
  IF v_host <> p_actor_id AND NOT fn_has_permission(p_actor_id, 'report.review') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only the host (or a moderator) can accept players';
  END IF;
  IF v_status <> 'open' OR v_cur >= v_max THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Session is full or not open';
  END IF;
  SELECT status INTO v_pstatus FROM session_participant
   WHERE session_id = p_session_id AND user_id = p_user_id FOR UPDATE;
  IF v_pstatus IS NULL OR v_pstatus <> 'requested' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No pending join request from this player';
  END IF;
  UPDATE session_participant SET status = 'accepted'
   WHERE session_id = p_session_id AND user_id = p_user_id;
  COMMIT;

  SELECT s.session_id, s.title, s.status, s.current_players, s.max_players
    FROM lfg_session s WHERE s.session_id = p_session_id;
END$$

-- Stage 1: hard filters (all ANDed). Stage 2: weighted score of 0..1 signals -> ranked list.
CREATE PROCEDURE sp_recommend_sessions(IN p_user_id BIGINT UNSIGNED, IN p_limit INT, IN p_log BOOLEAN)
BEGIN
  DROP TEMPORARY TABLE IF EXISTS tmp_session_rec;
  -- NOTE: semijoin=off works around a MySQL 9.x optimizer bug that drops valid rows
  -- when EXISTS + NOT EXISTS filters are combined with LATERAL derived tables.
  CREATE TEMPORARY TABLE tmp_session_rec AS
  SELECT /*+ SET_VAR(optimizer_switch = 'semijoin=off') */ x.*,
         ROUND(0.25 * x.rank_fit + 0.20 * x.avail_fit + 0.20 * x.tag_fit
             + 0.15 * x.rating_fit + 0.10 * x.social_fit + 0.10 * x.region_fit, 4) AS score
  FROM (
    SELECT s.session_id, s.title, g.name AS game, gm.name AS game_mode, h.username AS host,
           s.current_players, s.max_players,
           CASE WHEN my.ord IS NULL OR tgt.ord IS NULL THEN 0.5
                ELSE 1 - LEAST(1, ABS(my.ord - tgt.ord) / GREATEST(1, mx.top - 1)) END        AS rank_fit,
           CASE WHEN s.scheduled_start IS NULL
                  OR NOT EXISTS (SELECT 1 FROM availability a WHERE a.user_id = me.user_id) THEN 0.5
                WHEN EXISTS (SELECT 1 FROM availability a
                             WHERE a.user_id = me.user_id
                               AND a.day_of_week = WEEKDAY(fn_local_time(s.scheduled_start, me.timezone))
                               AND TIME(fn_local_time(s.scheduled_start, me.timezone)) BETWEEN a.start_time AND a.end_time)
                THEN 1 ELSE 0 END                                                             AS avail_fit,
           COALESCE((SELECT COUNT(*) FROM session_tag st
                       JOIN user_tag ut ON ut.tag_id = st.tag_id AND ut.user_id = me.user_id
                      WHERE st.session_id = s.session_id)
                    / NULLIF((SELECT COUNT(*) FROM session_tag st2 WHERE st2.session_id = s.session_id), 0), 0.5) AS tag_fit,
           COALESCE(h.avg_rating / 5, 0.6)                                                     AS rating_fit,
           CASE WHEN fn_are_friends(me.user_id, s.host_id)
                  OR EXISTS (SELECT 1 FROM session_participant sp
                             WHERE sp.session_id = s.session_id AND sp.status = 'accepted'
                               AND fn_are_friends(sp.user_id, me.user_id))
                THEN 1 ELSE 0 END                                                             AS social_fit,
           CASE WHEN s.region_id IS NULL OR me.home_region_id IS NULL THEN 0.5
                WHEN s.region_id = me.home_region_id THEN 1
                WHEN sr.parent_region_id = ur.parent_region_id THEN 0.6
                ELSE 0.2 END                                                                  AS region_fit
    FROM lfg_session s
    JOIN users me     ON me.user_id = p_user_id
    JOIN users h      ON h.user_id  = s.host_id
    JOIN game g       ON g.game_id  = s.game_id
    JOIN game_mode gm ON gm.mode_id = s.mode_id
    LEFT JOIN geo_region sr ON sr.region_id = s.region_id
    LEFT JOIN geo_region ur ON ur.region_id = me.home_region_id
    JOIN LATERAL (SELECT MAX(rt.ordinal) AS ord FROM player_game_profile p
                  JOIN rank_tier rt ON rt.rank_id = p.rank_id
                  WHERE p.user_id = me.user_id AND p.game_id = s.game_id) my ON TRUE
    JOIN LATERAL (SELECT (SELECT ordinal FROM rank_tier WHERE rank_id = s.min_rank_id) AS lo,
                         (SELECT ordinal FROM rank_tier WHERE rank_id = s.max_rank_id) AS hi) b ON TRUE
    JOIN LATERAL (SELECT COALESCE((b.lo + b.hi) / 2, b.lo, b.hi,
                                  (SELECT MAX(rt.ordinal) FROM player_game_profile p
                                   JOIN rank_tier rt ON rt.rank_id = p.rank_id
                                   WHERE p.user_id = s.host_id AND p.game_id = s.game_id)) AS ord) tgt ON TRUE
    JOIN LATERAL (SELECT MAX(ordinal) AS top FROM rank_tier WHERE game_id = s.game_id) mx ON TRUE
    WHERE s.status = 'open' AND s.current_players < s.max_players
      AND s.host_id <> me.user_id
      AND me.status = 'active' AND h.status = 'active'
      AND (s.visibility = 'public' OR (s.visibility = 'friends' AND fn_are_friends(me.user_id, s.host_id)))
      AND NOT EXISTS (SELECT 1 FROM session_participant sp
                      WHERE sp.session_id = s.session_id AND sp.user_id = me.user_id)
      AND EXISTS (SELECT 1 FROM player_game_profile p
                  JOIN platform_account pa ON pa.account_id = p.platform_account_id
                  WHERE p.user_id = me.user_id AND p.game_id = s.game_id
                    AND fn_platform_compatible(s.game_id, pa.platform_id, s.platform_id))
      AND (NOT EXISTS (SELECT 1 FROM session_language sl WHERE sl.session_id = s.session_id)
           OR EXISTS (SELECT 1 FROM session_language sl
                      JOIN user_language ul ON ul.language_code = sl.language_code AND ul.user_id = me.user_id
                      WHERE sl.session_id = s.session_id))
      AND NOT ((me.region_strictness = 'strict' OR s.region_locked)
               AND s.region_id IS NOT NULL AND NOT (me.home_region_id <=> s.region_id))
      AND (b.lo IS NULL OR my.ord >= b.lo)
      AND (b.hi IS NULL OR my.ord <= b.hi)
      AND (s.min_avg_rating IS NULL OR me.avg_rating >= s.min_avg_rating)
      AND NOT fn_is_blocked(me.user_id, s.host_id)
      AND NOT EXISTS (SELECT 1 FROM session_participant sp
                      WHERE sp.session_id = s.session_id AND sp.status = 'accepted'
                        AND fn_is_blocked(sp.user_id, me.user_id))
      AND (NOT s.require_verified_discord
           OR EXISTS (SELECT 1 FROM auth_account aa WHERE aa.user_id = me.user_id AND aa.provider = 'discord'))
      AND (NOT EXISTS (SELECT 1 FROM session_slot ss WHERE ss.session_id = s.session_id)
           OR EXISTS (SELECT 1 FROM session_slot ss
                      JOIN profile_role pr ON pr.game_role_id = ss.game_role_id
                      JOIN player_game_profile p ON p.profile_id = pr.profile_id AND p.user_id = me.user_id
                      WHERE ss.session_id = s.session_id))
  ) x;

  IF p_log THEN
    INSERT INTO match_recommendation (user_id, session_id, score, score_breakdown, source)
    SELECT p_user_id, session_id, score,
           JSON_OBJECT('rank', rank_fit, 'availability', avail_fit, 'tags', tag_fit,
                       'rating', rating_fit, 'social', social_fit, 'region', region_fit), 'sql'
      FROM tmp_session_rec ORDER BY score DESC, session_id LIMIT p_limit;
  END IF;

  SELECT session_id, title, game, game_mode, host, current_players, max_players, score,
         ROUND(rank_fit, 2) AS rank_fit, ROUND(avail_fit, 2) AS avail_fit, ROUND(tag_fit, 2) AS tag_fit,
         ROUND(rating_fit, 2) AS rating_fit, social_fit, ROUND(region_fit, 2) AS region_fit
    FROM tmp_session_rec ORDER BY score DESC, session_id LIMIT p_limit;
  DROP TEMPORARY TABLE IF EXISTS tmp_session_rec;
END$$

-- Host view: ranked list of best teammates for a session.
CREATE PROCEDURE sp_recommend_players(IN p_session_id BIGINT UNSIGNED, IN p_limit INT)
BEGIN
  SELECT /*+ SET_VAR(optimizer_switch = 'semijoin=off') */
         x.user_id, x.username, x.country_code, x.player_rank, x.avg_rating,
         ROUND(0.25 * x.role_fit + 0.20 * x.rank_fit + 0.15 * x.avail_fit + 0.15 * x.tag_fit
             + 0.15 * x.rating_fit + 0.10 * x.social_fit, 4) AS score,
         ROUND(x.role_fit, 2) AS role_fit, ROUND(x.rank_fit, 2) AS rank_fit, ROUND(x.avail_fit, 2) AS avail_fit,
         ROUND(x.tag_fit, 2) AS tag_fit, ROUND(x.rating_fit, 2) AS rating_fit, x.social_fit
  FROM (
    SELECT u.user_id, u.username, u.country_code, u.avg_rating,
           (SELECT rt.name FROM player_game_profile p JOIN rank_tier rt ON rt.rank_id = p.rank_id
             WHERE p.user_id = u.user_id AND p.game_id = s.game_id ORDER BY rt.ordinal DESC LIMIT 1) AS player_rank,
           CASE WHEN NOT EXISTS (SELECT 1 FROM session_slot ss WHERE ss.session_id = s.session_id) THEN 0.5
                WHEN EXISTS (SELECT 1 FROM session_slot ss
                             JOIN profile_role pr ON pr.game_role_id = ss.game_role_id
                             JOIN player_game_profile p ON p.profile_id = pr.profile_id AND p.user_id = u.user_id
                             WHERE ss.session_id = s.session_id) THEN 1 ELSE 0 END           AS role_fit,
           CASE WHEN ur.ord IS NULL OR tgt.ord IS NULL THEN 0.5
                ELSE 1 - LEAST(1, ABS(ur.ord - tgt.ord) / GREATEST(1, mx.top - 1)) END       AS rank_fit,
           CASE WHEN s.scheduled_start IS NULL
                  OR NOT EXISTS (SELECT 1 FROM availability a WHERE a.user_id = u.user_id) THEN 0.5
                WHEN EXISTS (SELECT 1 FROM availability a
                             WHERE a.user_id = u.user_id
                               AND a.day_of_week = WEEKDAY(fn_local_time(s.scheduled_start, u.timezone))
                               AND TIME(fn_local_time(s.scheduled_start, u.timezone)) BETWEEN a.start_time AND a.end_time)
                THEN 1 ELSE 0 END                                                            AS avail_fit,
           COALESCE((SELECT COUNT(*) FROM session_tag st
                       JOIN user_tag ut ON ut.tag_id = st.tag_id AND ut.user_id = u.user_id
                      WHERE st.session_id = s.session_id)
                    / NULLIF((SELECT COUNT(*) FROM session_tag st2 WHERE st2.session_id = s.session_id), 0), 0.5) AS tag_fit,
           COALESCE(u.avg_rating / 5, 0.6)                                                    AS rating_fit,
           CASE WHEN fn_are_friends(u.user_id, s.host_id)
                  OR EXISTS (SELECT 1 FROM session_participant sp
                             WHERE sp.session_id = s.session_id AND sp.status = 'accepted'
                               AND fn_are_friends(sp.user_id, u.user_id))
                THEN 1 ELSE 0 END                                                            AS social_fit
    FROM lfg_session s
    JOIN users u ON u.user_id <> s.host_id
    JOIN LATERAL (SELECT MAX(rt.ordinal) AS ord FROM player_game_profile p
                  JOIN rank_tier rt ON rt.rank_id = p.rank_id
                  WHERE p.user_id = u.user_id AND p.game_id = s.game_id) ur ON TRUE
    JOIN LATERAL (SELECT (SELECT ordinal FROM rank_tier WHERE rank_id = s.min_rank_id) AS lo,
                         (SELECT ordinal FROM rank_tier WHERE rank_id = s.max_rank_id) AS hi) b ON TRUE
    JOIN LATERAL (SELECT COALESCE((b.lo + b.hi) / 2, b.lo, b.hi,
                                  (SELECT MAX(rt.ordinal) FROM player_game_profile p
                                   JOIN rank_tier rt ON rt.rank_id = p.rank_id
                                   WHERE p.user_id = s.host_id AND p.game_id = s.game_id)) AS ord) tgt ON TRUE
    JOIN LATERAL (SELECT MAX(ordinal) AS top FROM rank_tier WHERE game_id = s.game_id) mx ON TRUE
    WHERE s.session_id = p_session_id
      AND u.status = 'active'
      AND NOT EXISTS (SELECT 1 FROM session_participant sp
                      WHERE sp.session_id = s.session_id AND sp.user_id = u.user_id)
      AND EXISTS (SELECT 1 FROM player_game_profile p
                  JOIN platform_account pa ON pa.account_id = p.platform_account_id
                  WHERE p.user_id = u.user_id AND p.game_id = s.game_id
                    AND fn_platform_compatible(s.game_id, pa.platform_id, s.platform_id))
      AND (NOT EXISTS (SELECT 1 FROM session_language sl WHERE sl.session_id = s.session_id)
           OR EXISTS (SELECT 1 FROM session_language sl
                      JOIN user_language ul ON ul.language_code = sl.language_code AND ul.user_id = u.user_id
                      WHERE sl.session_id = s.session_id))
      AND NOT ((u.region_strictness = 'strict' OR s.region_locked)
               AND s.region_id IS NOT NULL AND NOT (u.home_region_id <=> s.region_id))
      AND (b.lo IS NULL OR ur.ord >= b.lo)
      AND (b.hi IS NULL OR ur.ord <= b.hi)
      AND (s.min_avg_rating IS NULL OR u.avg_rating >= s.min_avg_rating)
      AND NOT fn_is_blocked(u.user_id, s.host_id)
      AND NOT EXISTS (SELECT 1 FROM session_participant sp
                      WHERE sp.session_id = s.session_id AND sp.status = 'accepted'
                        AND fn_is_blocked(sp.user_id, u.user_id))
      AND (NOT s.require_verified_discord
           OR EXISTS (SELECT 1 FROM auth_account aa WHERE aa.user_id = u.user_id AND aa.provider = 'discord'))
  ) x
  ORDER BY score DESC, x.user_id
  LIMIT p_limit;
END$$

-- ============================================================ triggers: sessions
CREATE TRIGGER trg_session_bi BEFORE INSERT ON lfg_session FOR EACH ROW
BEGIN
  IF NEW.max_players > (SELECT max_team_size FROM game_mode WHERE mode_id = NEW.mode_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'max_players exceeds the team size of this game mode';
  END IF;
  IF (SELECT status FROM users WHERE user_id = NEW.host_id) <> 'active' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Suspended or banned users cannot host sessions';
  END IF;
  IF NOT fn_has_permission(NEW.host_id, 'session.create') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Host lacks the session.create permission';
  END IF;
  SET NEW.current_players = 0;                               -- derived; filled when participants are accepted
END$$

CREATE TRIGGER trg_session_bu BEFORE UPDATE ON lfg_session FOR EACH ROW
BEGIN
  IF OLD.status IN ('completed','cancelled') AND NEW.status <> OLD.status THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Session is already closed';
  END IF;
  IF (NEW.max_players <> OLD.max_players OR NEW.mode_id <> OLD.mode_id)
     AND NEW.max_players > (SELECT max_team_size FROM game_mode WHERE mode_id = NEW.mode_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'max_players exceeds the team size of this game mode';
  END IF;
END$$

CREATE TRIGGER trg_session_au AFTER UPDATE ON lfg_session FOR EACH ROW
BEGIN
  IF NEW.status <> OLD.status THEN
    INSERT INTO audit_log (actor_id, entity, entity_id, action, old_value, new_value)
    VALUES (@audit_actor, 'lfg_session', NEW.session_id, 'status_change',
            JSON_OBJECT('status', OLD.status), JSON_OBJECT('status', NEW.status));
    IF NEW.status = 'completed' THEN
      UPDATE users
         SET sessions_completed = sessions_completed + 1,
             trust_score = fn_trust_score(user_id, sessions_completed, avg_rating)
       WHERE user_id IN (SELECT user_id FROM session_participant
                         WHERE session_id = NEW.session_id AND status = 'accepted');
      INSERT IGNORE INTO user_badge (user_id, badge_id, session_id)
      SELECT u.user_id, b.badge_id, NEW.session_id
        FROM users u JOIN badge b ON b.name = 'Veteran'
       WHERE u.sessions_completed >= 2
         AND u.user_id IN (SELECT user_id FROM session_participant
                           WHERE session_id = NEW.session_id AND status = 'accepted');
    END IF;
  END IF;
END$$

-- ============================================================ triggers: participants
CREATE TRIGGER trg_participant_bi BEFORE INSERT ON session_participant FOR EACH ROW
BEGIN
  DECLARE v_sstatus VARCHAR(16);
  DECLARE v_policy  VARCHAR(16);
  DECLARE v_cur     INT;
  DECLARE v_max     INT;
  DECLARE v_host    BIGINT UNSIGNED;
  SELECT status, join_policy, current_players, max_players, host_id
    INTO v_sstatus, v_policy, v_cur, v_max, v_host
    FROM lfg_session WHERE session_id = NEW.session_id;
  IF v_sstatus <> 'open' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Session is not open for joining';
  END IF;
  IF (SELECT status FROM users WHERE user_id = NEW.user_id) <> 'active' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Suspended or banned users cannot join sessions';
  END IF;
  IF EXISTS (SELECT 1 FROM session_participant p
             WHERE p.session_id = NEW.session_id AND p.status = 'accepted'
               AND fn_is_blocked(p.user_id, NEW.user_id)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Blocked: you and a player in this session have blocked each other';
  END IF;
  IF NEW.user_id = v_host OR (NEW.status = 'requested' AND v_policy = 'auto') THEN
    SET NEW.status = 'accepted';
  END IF;
  IF NEW.status NOT IN ('requested','accepted') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A new participant must be requested or accepted';
  END IF;
  IF NEW.status = 'accepted' AND v_cur >= v_max THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Session is full';
  END IF;
END$$

CREATE TRIGGER trg_participant_bu BEFORE UPDATE ON session_participant FOR EACH ROW
BEGIN
  DECLARE v_sstatus VARCHAR(16);
  DECLARE v_cur     INT;
  DECLARE v_max     INT;
  IF NEW.status = 'accepted' AND OLD.status <> 'accepted' THEN
    SELECT status, current_players, max_players INTO v_sstatus, v_cur, v_max
      FROM lfg_session WHERE session_id = NEW.session_id;
    IF v_sstatus <> 'open' OR v_cur >= v_max THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Session is full or not open';
    END IF;
    IF (SELECT status FROM users WHERE user_id = NEW.user_id) <> 'active' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Suspended or banned users cannot join sessions';
    END IF;
    IF EXISTS (SELECT 1 FROM session_participant p
               WHERE p.session_id = NEW.session_id AND p.status = 'accepted' AND p.user_id <> NEW.user_id
                 AND fn_is_blocked(p.user_id, NEW.user_id)) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Blocked: you and a player in this session have blocked each other';
    END IF;
  END IF;
  IF NEW.status IN ('left','kicked') AND OLD.status <> NEW.status AND NEW.left_at IS NULL THEN
    SET NEW.left_at = UTC_TIMESTAMP();
  END IF;
END$$

CREATE TRIGGER trg_participant_ai AFTER INSERT ON session_participant FOR EACH ROW
BEGIN CALL sp_refresh_session(NEW.session_id); END$$

CREATE TRIGGER trg_participant_au AFTER UPDATE ON session_participant FOR EACH ROW
BEGIN CALL sp_refresh_session(NEW.session_id); END$$

CREATE TRIGGER trg_participant_ad AFTER DELETE ON session_participant FOR EACH ROW
BEGIN CALL sp_refresh_session(OLD.session_id); END$$

-- ============================================================ triggers: reviews
CREATE TRIGGER trg_review_bi BEFORE INSERT ON review FOR EACH ROW
BEGIN
  IF (SELECT status FROM lfg_session WHERE session_id = NEW.session_id) <> 'completed' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reviews open only after the session is completed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM session_participant
                 WHERE session_id = NEW.session_id AND user_id = NEW.reviewer_id AND status = 'accepted')
     OR NOT EXISTS (SELECT 1 FROM session_participant
                    WHERE session_id = NEW.session_id AND user_id = NEW.reviewed_id AND status = 'accepted') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reviewer and reviewed must both have played in this session';
  END IF;
END$$

CREATE TRIGGER trg_review_ai AFTER INSERT ON review FOR EACH ROW
BEGIN CALL sp_refresh_user_stats(NEW.reviewed_id); END$$

CREATE TRIGGER trg_review_au AFTER UPDATE ON review FOR EACH ROW
BEGIN
  CALL sp_refresh_user_stats(NEW.reviewed_id);
  IF NEW.reviewed_id <> OLD.reviewed_id THEN CALL sp_refresh_user_stats(OLD.reviewed_id); END IF;
END$$

CREATE TRIGGER trg_review_ad AFTER DELETE ON review FOR EACH ROW
BEGIN CALL sp_refresh_user_stats(OLD.reviewed_id); END$$

-- ============================================================ triggers: social safety
CREATE TRIGGER trg_message_bi BEFORE INSERT ON message FOR EACH ROW
BEGIN
  IF (SELECT status FROM users WHERE user_id = NEW.sender_id) <> 'active'
     OR EXISTS (SELECT 1 FROM sanction
                WHERE user_id = NEW.sender_id AND sanction_type = 'mute'
                  AND starts_at <= UTC_TIMESTAMP() AND (ends_at IS NULL OR ends_at > UTC_TIMESTAMP())) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sender is muted, suspended or banned';
  END IF;
  IF NEW.session_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM session_participant
                     WHERE session_id = NEW.session_id AND user_id = NEW.sender_id AND status = 'accepted') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only accepted participants can post in session chat';
  END IF;
  IF NEW.receiver_id IS NOT NULL AND fn_is_blocked(NEW.sender_id, NEW.receiver_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot message this user (blocked)';
  END IF;
END$$

CREATE TRIGGER trg_friendship_bi BEFORE INSERT ON friendship FOR EACH ROW
BEGIN
  IF fn_is_blocked(NEW.requester_id, NEW.addressee_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot send a friend request (blocked)';
  END IF;
END$$

CREATE TRIGGER trg_block_ai AFTER INSERT ON user_block FOR EACH ROW
BEGIN                                                        -- blocking ends any friendship
  DELETE FROM friendship
   WHERE pair_low = LEAST(NEW.blocker_id, NEW.blocked_id)
     AND pair_high = GREATEST(NEW.blocker_id, NEW.blocked_id);
  INSERT INTO audit_log (actor_id, entity, entity_id, action, new_value)
  VALUES (NEW.blocker_id, 'user_block', CONCAT(NEW.blocker_id, '>', NEW.blocked_id), 'block',
          JSON_OBJECT('blocked_id', NEW.blocked_id));
END$$

-- ============================================================ triggers: moderation & RBAC
CREATE TRIGGER trg_report_bu BEFORE UPDATE ON report FOR EACH ROW
BEGIN
  IF NEW.handled_by IS NOT NULL AND NOT fn_has_permission(NEW.handled_by, 'report.review') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only moderators can handle reports';
  END IF;
  IF NEW.status IN ('actioned','dismissed') AND OLD.status NOT IN ('actioned','dismissed') THEN
    SET NEW.resolved_at = UTC_TIMESTAMP();
  END IF;
END$$

CREATE TRIGGER trg_report_au AFTER UPDATE ON report FOR EACH ROW
BEGIN
  IF NEW.status <> OLD.status THEN
    INSERT INTO audit_log (actor_id, entity, entity_id, action, old_value, new_value)
    VALUES (NEW.handled_by, 'report', NEW.report_id, 'status_change',
            JSON_OBJECT('status', OLD.status), JSON_OBJECT('status', NEW.status));
  END IF;
END$$

CREATE TRIGGER trg_sanction_bi BEFORE INSERT ON sanction FOR EACH ROW
BEGIN
  IF NOT fn_has_permission(NEW.issued_by, 'user.sanction') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Issuer lacks the user.sanction permission';
  END IF;
  IF NEW.sanction_type = 'ban' AND NOT fn_has_permission(NEW.issued_by, 'user.ban') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only admins can ban users';
  END IF;
END$$

CREATE TRIGGER trg_sanction_ai AFTER INSERT ON sanction FOR EACH ROW
BEGIN
  INSERT INTO audit_log (actor_id, entity, entity_id, action, new_value)
  VALUES (NEW.issued_by, 'sanction', NEW.sanction_id, 'issue',
          JSON_OBJECT('user_id', NEW.user_id, 'type', NEW.sanction_type,
                      'ends_at', NEW.ends_at, 'report_id', NEW.report_id));
  SET @audit_actor = NEW.issued_by;
  UPDATE users
     SET status = CASE NEW.sanction_type
                    WHEN 'ban'     THEN 'banned'
                    WHEN 'suspend' THEN IF(status = 'banned', 'banned', 'suspended')
                    ELSE status END,
         trust_score = fn_trust_score(user_id, sessions_completed, avg_rating)
   WHERE user_id = NEW.user_id;
  SET @audit_actor = NULL;
END$$

CREATE TRIGGER trg_users_au AFTER UPDATE ON users FOR EACH ROW
BEGIN                                                        -- only non-secret fields are ever logged
  IF NEW.status <> OLD.status THEN
    INSERT INTO audit_log (actor_id, entity, entity_id, action, old_value, new_value)
    VALUES (@audit_actor, 'users', NEW.user_id, 'status_change',
            JSON_OBJECT('status', OLD.status), JSON_OBJECT('status', NEW.status));
  END IF;
END$$

CREATE TRIGGER trg_user_role_bi BEFORE INSERT ON user_role FOR EACH ROW
BEGIN
  IF NEW.assigned_by IS NOT NULL AND NOT fn_has_permission(NEW.assigned_by, 'role.assign') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Assigner lacks the role.assign permission';
  END IF;
END$$

CREATE TRIGGER trg_user_role_ai AFTER INSERT ON user_role FOR EACH ROW
BEGIN
  INSERT INTO audit_log (actor_id, entity, entity_id, action, new_value)
  VALUES (NEW.assigned_by, 'user_role', NEW.user_id, 'grant', JSON_OBJECT('role_id', NEW.role_id));
END$$

CREATE TRIGGER trg_auth_account_ai AFTER INSERT ON auth_account FOR EACH ROW
BEGIN                                                        -- never copies password_hash / provider secrets
  INSERT INTO audit_log (actor_id, entity, entity_id, action, new_value)
  VALUES (NEW.user_id, 'auth_account', NEW.auth_id, 'login_method_added',
          JSON_OBJECT('provider', NEW.provider, 'email_verified', NEW.email_verified));
END$$

DELIMITER ;

-- ============================================================ views
CREATE VIEW v_open_sessions AS
SELECT s.session_id, s.title, g.name AS game, gm.name AS game_mode, pl.name AS platform,
       h.username AS host, r.code AS region,
       s.current_players, s.max_players, s.max_players - s.current_players AS open_slots,
       minr.name AS min_rank, maxr.name AS max_rank,
       (SELECT GROUP_CONCAT(sl.language_code ORDER BY sl.language_code)
          FROM session_language sl WHERE sl.session_id = s.session_id) AS languages,
       (SELECT GROUP_CONCAT(t.name ORDER BY t.name)
          FROM session_tag st JOIN tag t ON t.tag_id = st.tag_id WHERE st.session_id = s.session_id) AS tags,
       (SELECT GROUP_CONCAT(CONCAT(ss.slots_needed, 'x ', gr.name) ORDER BY ss.slot_no)
          FROM session_slot ss JOIN game_role gr ON gr.game_role_id = ss.game_role_id
         WHERE ss.session_id = s.session_id) AS looking_for,
       s.scheduled_start, s.visibility, s.join_policy, s.voice_required
FROM lfg_session s
JOIN game g       ON g.game_id = s.game_id
JOIN game_mode gm ON gm.mode_id = s.mode_id
JOIN platform pl  ON pl.platform_id = s.platform_id
JOIN users h      ON h.user_id = s.host_id
LEFT JOIN geo_region r   ON r.region_id = s.region_id
LEFT JOIN rank_tier minr ON minr.rank_id = s.min_rank_id
LEFT JOIN rank_tier maxr ON maxr.rank_id = s.max_rank_id
WHERE s.status = 'open';

-- Public player card: no gamertags, no auth data.
CREATE VIEW v_player_card AS
SELECT u.user_id, u.username, u.display_name, u.country_code, r.code AS home_region, u.status,
       (SELECT GROUP_CONCAT(CONCAT(ul.language_code, ':', ul.proficiency) ORDER BY ul.is_preferred DESC, ul.language_code)
          FROM user_language ul WHERE ul.user_id = u.user_id) AS languages,
       (SELECT GROUP_CONCAT(CONCAT(g.name, IFNULL(CONCAT(' (', rt.name, ')'), '')) ORDER BY p.is_main DESC, g.name SEPARATOR ', ')
          FROM player_game_profile p JOIN game g ON g.game_id = p.game_id
          LEFT JOIN rank_tier rt ON rt.rank_id = p.rank_id
         WHERE p.user_id = u.user_id) AS games,
       u.avg_rating, u.review_count, u.sessions_completed, u.trust_score,
       (SELECT GROUP_CONCAT(b.name ORDER BY b.name)
          FROM user_badge ub JOIN badge b ON b.badge_id = ub.badge_id WHERE ub.user_id = u.user_id) AS badges
FROM users u
LEFT JOIN geo_region r ON r.region_id = u.home_region_id;

-- Session roster: gamertags revealed only to accepted participants.
CREATE VIEW v_session_roster AS
SELECT sp.session_id, sp.user_id, u.username, sp.status, gr.name AS game_role,
       CASE WHEN sp.status = 'accepted' THEN CONCAT(pa.handle, pa.discriminator) ELSE '(hidden until accepted)' END AS gamertag,
       pl.identity_label, sp.joined_at, sp.left_at
FROM session_participant sp
JOIN users u ON u.user_id = sp.user_id
LEFT JOIN game_role gr        ON gr.game_role_id = sp.game_role_id
LEFT JOIN platform_account pa ON pa.account_id   = sp.platform_account_id
LEFT JOIN platform pl         ON pl.platform_id  = pa.platform_id;

-- Optional: lift expired suspensions hourly (needs event_scheduler=ON).
-- CREATE EVENT ev_expire_sanctions ON SCHEDULE EVERY 1 HOUR DO CALL sp_expire_sanctions();
