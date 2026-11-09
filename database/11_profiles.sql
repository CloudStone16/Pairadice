SET NAMES utf8mb4;
SET time_zone = '+00:00';   -- all DATETIME columns are UTC
-- PairADice profile editing. Run after 01_schema.sql, 02_routines.sql and 07_vector_outbox.sql (the outbox triggers
-- fire on these writes, which is intended: a profile change re-embeds the player), before 04_rbac.sql (which grants
-- EXECUTE on these procedures to pairadice_player; moderator and admin inherit it).
-- IMPORTANT: these procedures open and COMMIT their own transaction. Never call them inside a caller's transaction
-- (START TRANSACTION would implicitly commit it first).
-- player_game_profile.in_game_name is never written here (it stays NULL): the gamertag lives only in platform_account.
-- Every profile write is one DEFINER procedure with one transaction. The actor edits ONLY their own profile:
-- p_actor_id is the only identity used (there is no target-user parameter), and a moderator or admin has no
-- extra reach here. The player login has no INSERT / UPDATE / DELETE on any profile table, so a forged statement
-- cannot skip a rule. The user's row is locked first (SELECT ... FOR UPDATE) so two requests from the same user
-- cannot both pass a count limit. Messages raised with SQLSTATE 45000 are written to be shown to users as is.
-- @audit_actor is set during each write and reset on exit and in the handlers, as in 09_sessions.sql.
-- Note trg_users_au_vec resets @audit_actor itself after any users update; nothing here relies on it surviving.
USE pairadice;

DROP PROCEDURE IF EXISTS sp_my_profile;
DROP PROCEDURE IF EXISTS sp_update_profile;
DROP PROCEDURE IF EXISTS sp_set_user_languages;
DROP PROCEDURE IF EXISTS sp_set_user_tags;
DROP PROCEDURE IF EXISTS sp_upsert_platform_account;
DROP PROCEDURE IF EXISTS sp_remove_platform_account;
DROP PROCEDURE IF EXISTS sp_upsert_game_profile;
DROP PROCEDURE IF EXISTS sp_remove_game_profile;
DROP PROCEDURE IF EXISTS sp_set_availability;

DELIMITER $$

CREATE PROCEDURE sp_my_profile(IN p_actor_id BIGINT UNSIGNED)
BEGIN                                                        -- the editable account fields (bio, country ... are not readable directly)
  SELECT user_id, username, display_name, bio, timezone, country_code, home_region_id, region_strictness
    FROM users WHERE user_id = p_actor_id;
END$$

CREATE PROCEDURE sp_update_profile(IN p_actor_id         BIGINT UNSIGNED,
                                   IN p_display_name     VARCHAR(100),
                                   IN p_bio              TEXT,
                                   IN p_timezone         VARCHAR(100),
                                   IN p_country_code     VARCHAR(16),
                                   IN p_home_region_id   INT UNSIGNED,
                                   IN p_region_strictness VARCHAR(16))
BEGIN                                                        -- NULL timezone / strictness keep the current value
  DECLARE v_name    VARCHAR(100) DEFAULT TRIM(p_display_name);
  DECLARE v_bio     TEXT         DEFAULT NULLIF(TRIM(p_bio), '');
  DECLARE v_tz      VARCHAR(100) DEFAULT TRIM(p_timezone);
  DECLARE v_country VARCHAR(16)  DEFAULT NULLIF(UPPER(TRIM(p_country_code)), '');
  DECLARE v_locked  BIGINT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN SET @audit_actor = NULL; ROLLBACK; RESIGNAL; END;

  IF NOT fn_user_active(p_actor_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Your account cannot do that right now.';
  END IF;
  IF v_name IS NULL OR CHAR_LENGTH(v_name) < 1 OR CHAR_LENGTH(v_name) > 64 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Display name must be 1-64 characters';
  END IF;
  IF v_bio IS NOT NULL AND CHAR_LENGTH(v_bio) > 500 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Bio must be 500 characters or fewer';
  END IF;
  IF v_tz IS NOT NULL AND (CHAR_LENGTH(v_tz) > 64
        OR NOT REGEXP_LIKE(v_tz, '^(UTC|(Africa|America|Antarctica|Asia|Atlantic|Australia|Europe|Indian|Pacific|Etc)(/[A-Za-z0-9_+-]+){1,2})$', 'c')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Timezone must be UTC or look like Area/City (for example Asia/Kolkata)';
  END IF;
  IF v_country IS NOT NULL AND (CHAR_LENGTH(v_country) <> 2 OR NOT EXISTS (SELECT 1 FROM country WHERE country_code = v_country)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Unknown country';
  END IF;
  IF p_home_region_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM geo_region WHERE region_id = p_home_region_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Unknown home region';
  END IF;
  IF p_region_strictness IS NOT NULL AND p_region_strictness NOT IN ('strict', 'nearby', 'any') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Region strictness must be strict, nearby or any';
  END IF;

  START TRANSACTION;
  SET @audit_actor = p_actor_id;
  SELECT user_id INTO v_locked FROM users WHERE user_id = p_actor_id FOR UPDATE;
  UPDATE users
     SET display_name      = v_name,
         bio               = v_bio,
         timezone          = COALESCE(v_tz, timezone),
         country_code      = v_country,
         home_region_id    = p_home_region_id,
         region_strictness = COALESCE(p_region_strictness, region_strictness)
   WHERE user_id = p_actor_id;
  SET @audit_actor = NULL;
  COMMIT;
END$$

CREATE PROCEDURE sp_set_user_languages(IN p_actor_id BIGINT UNSIGNED, IN p_codes JSON, IN p_primary VARCHAR(8))
BEGIN                                                        -- replaces the set; kept languages keep their proficiency
  DECLARE v_primary VARCHAR(8) DEFAULT NULLIF(LOWER(TRIM(p_primary)), '');
  DECLARE v_count   INT;
  DECLARE v_bad     INT;
  DECLARE v_locked  BIGINT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN SET @audit_actor = NULL; ROLLBACK; RESIGNAL; END;

  IF NOT fn_user_active(p_actor_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Your account cannot do that right now.';
  END IF;
  IF p_codes IS NULL OR JSON_TYPE(p_codes) <> 'ARRAY' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Pick at least one language';
  END IF;
  IF JSON_LENGTH(p_codes) > 8 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Pick at most 8 languages';
  END IF;
  DROP TEMPORARY TABLE IF EXISTS tmp_pf_lang;
  CREATE TEMPORARY TABLE tmp_pf_lang (code VARCHAR(16) NOT NULL PRIMARY KEY) ENGINE=MEMORY;
  INSERT IGNORE INTO tmp_pf_lang
    SELECT LOWER(TRIM(j.code)) FROM JSON_TABLE(p_codes, '$[*]' COLUMNS (code VARCHAR(16) PATH '$')) j WHERE j.code IS NOT NULL;
  SELECT COUNT(*) INTO v_count FROM tmp_pf_lang;
  IF v_count < 1 THEN
    DROP TEMPORARY TABLE tmp_pf_lang;
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Pick at least one language';
  END IF;
  IF v_count > 8 THEN
    DROP TEMPORARY TABLE tmp_pf_lang;
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Pick at most 8 languages';
  END IF;
  SELECT COUNT(*) INTO v_bad FROM tmp_pf_lang t LEFT JOIN language l ON l.language_code = t.code WHERE l.language_code IS NULL;
  IF v_bad > 0 THEN
    DROP TEMPORARY TABLE tmp_pf_lang;
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Unknown language code';
  END IF;
  IF v_primary IS NULL THEN                                  -- default: the first language in the list
    SELECT LOWER(TRIM(j.code)) INTO v_primary
      FROM JSON_TABLE(p_codes, '$[*]' COLUMNS (ord FOR ORDINALITY, code VARCHAR(16) PATH '$')) j
     WHERE j.code IS NOT NULL ORDER BY j.ord LIMIT 1;
  ELSEIF CHAR_LENGTH(v_primary) <> 2 OR NOT EXISTS (SELECT 1 FROM language WHERE language_code = v_primary) THEN
    DROP TEMPORARY TABLE tmp_pf_lang;
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Unknown language code';
  ELSEIF NOT EXISTS (SELECT 1 FROM tmp_pf_lang WHERE code = v_primary) THEN
    DROP TEMPORARY TABLE tmp_pf_lang;
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Your main language must be one of the languages you picked';
  END IF;

  START TRANSACTION;
  SET @audit_actor = p_actor_id;
  SELECT user_id INTO v_locked FROM users WHERE user_id = p_actor_id FOR UPDATE;
  DELETE FROM user_language WHERE user_id = p_actor_id AND language_code NOT IN (SELECT code FROM tmp_pf_lang);
  INSERT IGNORE INTO user_language (user_id, language_code, is_preferred)
    SELECT p_actor_id, code, FALSE FROM tmp_pf_lang;
  UPDATE user_language SET is_preferred = (language_code = v_primary)
   WHERE user_id = p_actor_id AND is_preferred <> (language_code = v_primary);
  DROP TEMPORARY TABLE tmp_pf_lang;
  SET @audit_actor = NULL;
  COMMIT;
END$$

CREATE PROCEDURE sp_set_user_tags(IN p_actor_id BIGINT UNSIGNED, IN p_tag_ids JSON)
BEGIN                                                        -- replaces the set; an empty array clears it
  DECLARE v_count  INT;
  DECLARE v_bad    INT;
  DECLARE v_null   INT;
  DECLARE v_locked BIGINT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN SET @audit_actor = NULL; ROLLBACK; RESIGNAL; END;

  IF NOT fn_user_active(p_actor_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Your account cannot do that right now.';
  END IF;
  IF p_tag_ids IS NULL OR JSON_TYPE(p_tag_ids) <> 'ARRAY' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Tags must be a list';
  END IF;
  IF JSON_LENGTH(p_tag_ids) > 10 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Pick at most 10 tags';
  END IF;
  DROP TEMPORARY TABLE IF EXISTS tmp_pf_tag;
  CREATE TEMPORARY TABLE tmp_pf_tag (tag_id BIGINT UNSIGNED NOT NULL PRIMARY KEY) ENGINE=MEMORY;
  INSERT IGNORE INTO tmp_pf_tag
    SELECT j.id FROM JSON_TABLE(p_tag_ids, '$[*]' COLUMNS (id BIGINT UNSIGNED PATH '$')) j WHERE j.id IS NOT NULL;
  SELECT COUNT(*) INTO v_null FROM JSON_TABLE(p_tag_ids, '$[*]' COLUMNS (id BIGINT UNSIGNED PATH '$')) j WHERE j.id IS NULL;
  SELECT COUNT(*) INTO v_count FROM tmp_pf_tag;
  IF v_count > 10 THEN
    DROP TEMPORARY TABLE tmp_pf_tag;
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Pick at most 10 tags';
  END IF;
  SELECT COUNT(*) INTO v_bad FROM tmp_pf_tag x LEFT JOIN tag t ON t.tag_id = x.tag_id WHERE t.tag_id IS NULL;
  IF v_bad > 0 OR v_null > 0 THEN
    DROP TEMPORARY TABLE tmp_pf_tag;
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Unknown tag';
  END IF;

  START TRANSACTION;
  SET @audit_actor = p_actor_id;
  SELECT user_id INTO v_locked FROM users WHERE user_id = p_actor_id FOR UPDATE;
  DELETE FROM user_tag WHERE user_id = p_actor_id AND tag_id NOT IN (SELECT tag_id FROM tmp_pf_tag);
  INSERT IGNORE INTO user_tag (user_id, tag_id) SELECT p_actor_id, tag_id FROM tmp_pf_tag;
  DROP TEMPORARY TABLE tmp_pf_tag;
  SET @audit_actor = NULL;
  COMMIT;
END$$

CREATE PROCEDURE sp_upsert_platform_account(IN p_actor_id      BIGINT UNSIGNED,
                                            IN p_account_id    BIGINT UNSIGNED,
                                            IN p_platform_id   SMALLINT UNSIGNED,
                                            IN p_handle        VARCHAR(100),
                                            IN p_discriminator VARCHAR(32),
                                            IN p_is_public     BOOLEAN)
BEGIN                                                        -- NULL p_account_id adds; result set: account_id
  DECLARE v_handle  VARCHAR(100) DEFAULT TRIM(p_handle);
  DECLARE v_disc    VARCHAR(32)  DEFAULT COALESCE(TRIM(p_discriminator), '');
  DECLARE v_owner   BIGINT UNSIGNED;
  DECLARE v_old_plat SMALLINT UNSIGNED;
  DECLARE v_old_handle VARCHAR(64);
  DECLARE v_old_disc   VARCHAR(16);
  DECLARE v_old_public BOOLEAN;
  DECLARE v_id      BIGINT UNSIGNED;
  DECLARE v_locked  BIGINT UNSIGNED;
  DECLARE EXIT HANDLER FOR 1062 BEGIN SET @audit_actor = NULL; ROLLBACK;
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That gamertag is already linked to an account'; END;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN SET @audit_actor = NULL; ROLLBACK; RESIGNAL; END;

  IF NOT fn_user_active(p_actor_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Your account cannot do that right now.';
  END IF;
  IF v_handle IS NULL OR CHAR_LENGTH(v_handle) < 1 OR CHAR_LENGTH(v_handle) > 64 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Gamertag must be 1-64 characters';
  END IF;
  IF CHAR_LENGTH(v_disc) > 16 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Tag suffix must be 16 characters or fewer';
  END IF;
  IF p_platform_id IS NULL OR NOT EXISTS (SELECT 1 FROM platform WHERE platform_id = p_platform_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Unknown platform';
  END IF;

  START TRANSACTION;
  SET @audit_actor = p_actor_id;
  SELECT user_id INTO v_locked FROM users WHERE user_id = p_actor_id FOR UPDATE;
  IF p_account_id IS NULL THEN
    IF (SELECT COUNT(*) FROM platform_account WHERE user_id = p_actor_id) >= 8 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You can link at most 8 platform accounts';
    END IF;
    INSERT INTO platform_account (user_id, platform_id, handle, discriminator, is_public)
    VALUES (p_actor_id, p_platform_id, v_handle, v_disc, COALESCE(p_is_public, FALSE));
    SET v_id = LAST_INSERT_ID();
  ELSE
    SELECT user_id, platform_id, handle, discriminator, is_public
      INTO v_owner, v_old_plat, v_old_handle, v_old_disc, v_old_public
      FROM platform_account WHERE account_id = p_account_id AND user_id = p_actor_id FOR UPDATE;
    IF v_owner IS NULL OR v_owner <> p_actor_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That platform account is not yours';
    END IF;
    IF v_old_plat <> p_platform_id AND EXISTS (SELECT 1 FROM player_game_profile WHERE platform_account_id = p_account_id) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This account is used by a game profile, so its platform cannot change. Add a new account instead';
    END IF;
    UPDATE platform_account
       SET platform_id = p_platform_id, handle = v_handle, discriminator = v_disc,
           is_public = COALESCE(p_is_public, v_old_public),
           is_verified = IF(v_old_plat = p_platform_id AND v_old_handle = v_handle AND v_old_disc = v_disc, is_verified, FALSE)
     WHERE account_id = p_account_id;
    SET v_id = p_account_id;
  END IF;
  SET @audit_actor = NULL;
  COMMIT;
  SELECT v_id AS account_id;
END$$

CREATE PROCEDURE sp_remove_platform_account(IN p_actor_id BIGINT UNSIGNED, IN p_account_id BIGINT UNSIGNED)
BEGIN                                                        -- game profiles using it keep existing, unlinked (FK SET NULL)
  DECLARE v_owner  BIGINT UNSIGNED;
  DECLARE v_locked BIGINT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN SET @audit_actor = NULL; ROLLBACK; RESIGNAL; END;

  IF NOT fn_user_active(p_actor_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Your account cannot do that right now.';
  END IF;
  START TRANSACTION;
  SET @audit_actor = p_actor_id;
  SELECT user_id INTO v_locked FROM users WHERE user_id = p_actor_id FOR UPDATE;
  SELECT user_id INTO v_owner FROM platform_account WHERE account_id = p_account_id AND user_id = p_actor_id FOR UPDATE;
  IF v_owner IS NULL OR v_owner <> p_actor_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That platform account is not yours';
  END IF;
  DELETE FROM platform_account WHERE account_id = p_account_id;
  SET @audit_actor = NULL;
  COMMIT;
END$$

CREATE PROCEDURE sp_upsert_game_profile(IN p_actor_id            BIGINT UNSIGNED,
                                        IN p_game_id             INT UNSIGNED,
                                        IN p_platform_account_id BIGINT UNSIGNED,
                                        IN p_rank_id             INT UNSIGNED,
                                        IN p_mode_ids            JSON,
                                        IN p_roles               JSON)
BEGIN                                                        -- one profile per (user, game); result set: profile_id
  DECLARE v_profile  BIGINT UNSIGNED;
  DECLARE v_acct_user BIGINT UNSIGNED;
  DECLARE v_acct_plat SMALLINT UNSIGNED;
  DECLARE v_rank_game INT UNSIGNED;
  DECLARE v_main     BOOLEAN;
  DECLARE v_n        INT;
  DECLARE v_bad      INT;
  DECLARE v_locked   BIGINT UNSIGNED;
  DECLARE EXIT HANDLER FOR 1062 BEGIN SET @audit_actor = NULL; ROLLBACK; DROP TEMPORARY TABLE IF EXISTS tmp_pf_mode; DROP TEMPORARY TABLE IF EXISTS tmp_pf_role;
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You already have a profile for this game with that platform account'; END;
  DECLARE EXIT HANDLER FOR 1452 BEGIN SET @audit_actor = NULL; ROLLBACK; DROP TEMPORARY TABLE IF EXISTS tmp_pf_mode; DROP TEMPORARY TABLE IF EXISTS tmp_pf_role;
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That gamertag or choice no longer exists. Refresh and try again.'; END;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN SET @audit_actor = NULL; ROLLBACK; DROP TEMPORARY TABLE IF EXISTS tmp_pf_mode; DROP TEMPORARY TABLE IF EXISTS tmp_pf_role; RESIGNAL; END;

  IF NOT fn_user_active(p_actor_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Your account cannot do that right now.';
  END IF;
  IF p_game_id IS NULL OR NOT EXISTS (SELECT 1 FROM game WHERE game_id = p_game_id AND is_active) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Unknown game';
  END IF;
  IF p_rank_id IS NOT NULL THEN
    SELECT game_id INTO v_rank_game FROM rank_tier WHERE rank_id = p_rank_id;
    IF v_rank_game IS NULL OR v_rank_game <> p_game_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That rank belongs to a different game';
    END IF;
  END IF;
  IF p_platform_account_id IS NOT NULL THEN
    SELECT user_id, platform_id INTO v_acct_user, v_acct_plat
      FROM platform_account WHERE account_id = p_platform_account_id;
    IF v_acct_user IS NULL OR v_acct_user <> p_actor_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That platform account is not yours';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM game_platform WHERE game_id = p_game_id AND platform_id = v_acct_plat) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That platform account is on a platform this game is not played on';
    END IF;
  END IF;
  IF (p_mode_ids IS NOT NULL AND JSON_TYPE(p_mode_ids) <> 'ARRAY') OR (p_roles IS NOT NULL AND JSON_TYPE(p_roles) <> 'ARRAY') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Modes and roles must be lists';
  END IF;
  IF p_mode_ids IS NOT NULL AND JSON_LENGTH(p_mode_ids) > 6 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Pick at most 6 modes';
  END IF;

  DROP TEMPORARY TABLE IF EXISTS tmp_pf_mode;
  DROP TEMPORARY TABLE IF EXISTS tmp_pf_role;
  CREATE TEMPORARY TABLE tmp_pf_mode (mode_id BIGINT UNSIGNED NOT NULL PRIMARY KEY) ENGINE=MEMORY;
  CREATE TEMPORARY TABLE tmp_pf_role (role_id BIGINT UNSIGNED NOT NULL PRIMARY KEY, pref INT NOT NULL) ENGINE=MEMORY;
  IF p_mode_ids IS NOT NULL THEN
    INSERT IGNORE INTO tmp_pf_mode
      SELECT j.id FROM JSON_TABLE(p_mode_ids, '$[*]' COLUMNS (id BIGINT UNSIGNED PATH '$')) j WHERE j.id IS NOT NULL;
  END IF;
  SELECT COUNT(*) INTO v_n FROM tmp_pf_mode;
  IF v_n > 6 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Pick at most 6 modes';
  END IF;
  SELECT COUNT(*) INTO v_bad FROM tmp_pf_mode x LEFT JOIN game_mode m ON m.mode_id = x.mode_id AND m.game_id = p_game_id
   WHERE m.mode_id IS NULL;
  IF v_bad > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'One of the modes does not belong to this game';
  END IF;
  IF p_roles IS NOT NULL THEN
    IF JSON_LENGTH(p_roles) > 3 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Pick at most 3 roles';
    END IF;
    SELECT COUNT(*) INTO v_bad
      FROM JSON_TABLE(p_roles, '$[*]' COLUMNS (role_id BIGINT UNSIGNED PATH '$.role_id', ord INT PATH '$.order')) j
     WHERE j.role_id IS NULL OR j.ord IS NULL OR j.ord NOT BETWEEN 1 AND 3;
    IF v_bad > 0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Each role needs a role_id and an order from 1 to 3';
    END IF;
    SELECT COUNT(DISTINCT j.role_id), COUNT(DISTINCT j.ord), COUNT(*) INTO v_n, v_bad, @pf_total
      FROM JSON_TABLE(p_roles, '$[*]' COLUMNS (role_id BIGINT UNSIGNED PATH '$.role_id', ord INT PATH '$.order')) j;
    IF v_n <> @pf_total OR v_bad <> @pf_total THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Each role needs its own preference order (1 to 3)';
    END IF;
    INSERT INTO tmp_pf_role
      SELECT j.role_id, j.ord FROM JSON_TABLE(p_roles, '$[*]' COLUMNS (role_id BIGINT UNSIGNED PATH '$.role_id', ord INT PATH '$.order')) j;
    SELECT COUNT(*) INTO v_bad FROM tmp_pf_role x LEFT JOIN game_role r ON r.game_role_id = x.role_id AND r.game_id = p_game_id
     WHERE r.game_role_id IS NULL;
    IF v_bad > 0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'One of the roles does not belong to this game';
    END IF;
  END IF;

  START TRANSACTION;
  SET @audit_actor = p_actor_id;
  SELECT user_id INTO v_locked FROM users WHERE user_id = p_actor_id FOR UPDATE;
  IF p_platform_account_id IS NOT NULL THEN                  -- re-check under the lock: it may have changed since the early check
    SET v_acct_user = NULL, v_acct_plat = NULL;
    SELECT user_id, platform_id INTO v_acct_user, v_acct_plat
      FROM platform_account WHERE account_id = p_platform_account_id AND user_id = p_actor_id FOR UPDATE;
    IF v_acct_user IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That gamertag or choice no longer exists. Refresh and try again.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM game_platform WHERE game_id = p_game_id AND platform_id = v_acct_plat) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That platform account is on a platform this game is not played on';
    END IF;
  END IF;
  SELECT MIN(profile_id) INTO v_profile FROM player_game_profile WHERE user_id = p_actor_id AND game_id = p_game_id;
  IF v_profile IS NULL THEN
    SET v_main = NOT EXISTS (SELECT 1 FROM player_game_profile WHERE user_id = p_actor_id AND is_main);
    INSERT INTO player_game_profile (user_id, game_id, platform_account_id, rank_id, in_game_name, is_main)
    VALUES (p_actor_id, p_game_id, p_platform_account_id, p_rank_id, NULL, v_main);
    SET v_profile = LAST_INSERT_ID();
  ELSE
    UPDATE player_game_profile SET platform_account_id = p_platform_account_id, rank_id = p_rank_id, in_game_name = NULL
     WHERE profile_id = v_profile;
    DELETE FROM profile_mode WHERE profile_id = v_profile;
    DELETE FROM profile_role WHERE profile_id = v_profile;
  END IF;
  INSERT INTO profile_mode (profile_id, game_id, mode_id, rank_id, is_preferred)
    SELECT v_profile, p_game_id, x.mode_id, IF(m.is_ranked, p_rank_id, NULL), TRUE
      FROM tmp_pf_mode x JOIN game_mode m ON m.mode_id = x.mode_id;
  INSERT INTO profile_role (profile_id, game_id, game_role_id, preference_order)
    SELECT v_profile, p_game_id, role_id, pref FROM tmp_pf_role;
  DROP TEMPORARY TABLE tmp_pf_mode;
  DROP TEMPORARY TABLE tmp_pf_role;
  SET @audit_actor = NULL;
  COMMIT;
  SELECT v_profile AS profile_id;
END$$

CREATE PROCEDURE sp_remove_game_profile(IN p_actor_id BIGINT UNSIGNED, IN p_profile_id BIGINT UNSIGNED)
BEGIN                                                        -- modes and roles go with it (ON DELETE CASCADE)
  DECLARE v_owner  BIGINT UNSIGNED;
  DECLARE v_locked BIGINT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN SET @audit_actor = NULL; ROLLBACK; RESIGNAL; END;

  IF NOT fn_user_active(p_actor_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Your account cannot do that right now.';
  END IF;
  START TRANSACTION;
  SET @audit_actor = p_actor_id;
  SELECT user_id INTO v_locked FROM users WHERE user_id = p_actor_id FOR UPDATE;
  SELECT user_id INTO v_owner FROM player_game_profile WHERE profile_id = p_profile_id AND user_id = p_actor_id FOR UPDATE;
  IF v_owner IS NULL OR v_owner <> p_actor_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That game profile is not yours';
  END IF;
  DELETE FROM player_game_profile WHERE profile_id = p_profile_id;
  SET @audit_actor = NULL;
  COMMIT;
END$$

CREATE PROCEDURE sp_set_availability(IN p_actor_id BIGINT UNSIGNED, IN p_slots JSON)
BEGIN                                                        -- weekly slots in the user's own timezone; empty array clears
  DECLARE v_bad    INT;
  DECLARE v_locked BIGINT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN SET @audit_actor = NULL; ROLLBACK; DROP TEMPORARY TABLE IF EXISTS tmp_pf_slot; RESIGNAL; END;

  IF NOT fn_user_active(p_actor_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Your account cannot do that right now.';
  END IF;
  IF p_slots IS NULL OR JSON_TYPE(p_slots) <> 'ARRAY' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Availability must be a list of slots';
  END IF;
  IF JSON_LENGTH(p_slots) > 28 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'At most 28 availability slots';
  END IF;
  DROP TEMPORARY TABLE IF EXISTS tmp_pf_slot;
  CREATE TEMPORARY TABLE tmp_pf_slot (n INT NOT NULL PRIMARY KEY, d INT, s VARCHAR(16), e VARCHAR(16)) ENGINE=MEMORY;
  INSERT INTO tmp_pf_slot
    SELECT j.n, j.d, j.s, j.e
      FROM JSON_TABLE(p_slots, '$[*]' COLUMNS (n FOR ORDINALITY, d INT PATH '$.day',
                                               s VARCHAR(16) PATH '$.start', e VARCHAR(16) PATH '$.end')) j;
  SELECT COUNT(*) INTO v_bad FROM tmp_pf_slot
   WHERE d IS NULL OR d NOT BETWEEN 0 AND 6
      OR s IS NULL OR NOT REGEXP_LIKE(s, '^([01][0-9]|2[0-3]):[0-5][0-9]$')
      OR e IS NULL OR NOT REGEXP_LIKE(e, '^([01][0-9]|2[0-3]):[0-5][0-9]$');
  IF v_bad > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Each slot needs a day from 0 (Monday) to 6 (Sunday) and start and end times as HH:MM';
  END IF;
  SELECT COUNT(*) INTO v_bad FROM tmp_pf_slot WHERE e <= s;
  IF v_bad > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Each slot must end after it starts';
  END IF;
  SELECT COUNT(*) INTO v_bad                                 -- (a temporary table cannot be joined to itself, so read the JSON twice)
    FROM JSON_TABLE(p_slots, '$[*]' COLUMNS (n FOR ORDINALITY, d INT PATH '$.day', s VARCHAR(16) PATH '$.start', e VARCHAR(16) PATH '$.end')) a
    JOIN JSON_TABLE(p_slots, '$[*]' COLUMNS (n FOR ORDINALITY, d INT PATH '$.day', s VARCHAR(16) PATH '$.start', e VARCHAR(16) PATH '$.end')) b
      ON a.d = b.d AND a.n < b.n AND a.s < b.e AND b.s < a.e;
  IF v_bad > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Availability slots on the same day cannot overlap';
  END IF;

  START TRANSACTION;
  SET @audit_actor = p_actor_id;
  SELECT user_id INTO v_locked FROM users WHERE user_id = p_actor_id FOR UPDATE;
  DELETE FROM availability WHERE user_id = p_actor_id;
  INSERT INTO availability (user_id, day_of_week, start_time, end_time)
    SELECT p_actor_id, d, CAST(s AS TIME), CAST(e AS TIME) FROM tmp_pf_slot;
  DROP TEMPORARY TABLE tmp_pf_slot;
  SET @audit_actor = NULL;
  COMMIT;
END$$

DELIMITER ;
