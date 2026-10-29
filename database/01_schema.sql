SET NAMES utf8mb4;
SET time_zone = '+00:00';   -- all DATETIME columns are UTC
-- TIMESTAMPS: every DATETIME column in this schema is UTC. Connections must run
-- SET time_zone='+00:00' (setup.sh passes --init-command for this; app pools must do the same),
-- otherwise CURRENT_TIMESTAMP / NOW() defaults and trigger writes are stored in the session's local time.
-- ENCODING: load/connect as utf8mb4 (mysql --default-character-set=utf8mb4), or text is double-encoded.
-- PairADice relational schema (MySQL 8.0.16+; tested on 9.x)
-- Mirrors documents/pairadice_erd.drawio and documents/RELATIONAL_SCHEMA.md.
-- Load order: 01_schema, 02_routines, 03_seed, 04_rbac, 05_sample_queries.
-- Secrets: no plaintext passwords or tokens are ever stored (see RELATIONAL_SCHEMA.md).

DROP DATABASE IF EXISTS pairadice;
CREATE DATABASE pairadice CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE pairadice;

-- ============================================================ language & region
CREATE TABLE language (
  language_code CHAR(2)     NOT NULL PRIMARY KEY,            -- ISO 639-1
  name          VARCHAR(64) NOT NULL,
  native_name   VARCHAR(64) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE geo_region (                                    -- recursive tree: continent > sub_region > matchmaking
  region_id        INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name             VARCHAR(64)  NOT NULL,
  code             VARCHAR(16)  NOT NULL UNIQUE,
  region_level     ENUM('continent','sub_region','matchmaking') NOT NULL,
  parent_region_id INT UNSIGNED NULL,
  CONSTRAINT fk_geo_parent FOREIGN KEY (parent_region_id) REFERENCES geo_region (region_id),
  CONSTRAINT ck_geo_root   CHECK ((region_level = 'continent') = (parent_region_id IS NULL))
) ENGINE=InnoDB;

CREATE TABLE country (
  country_code CHAR(2)      NOT NULL PRIMARY KEY,            -- ISO 3166-1 alpha-2
  name         VARCHAR(64)  NOT NULL,
  region_id    INT UNSIGNED NOT NULL,
  CONSTRAINT fk_country_region FOREIGN KEY (region_id) REFERENCES geo_region (region_id)
) ENGINE=InnoDB;

-- ============================================================ identity & access
CREATE TABLE users (
  user_id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username           VARCHAR(32)  NOT NULL UNIQUE,
  display_name       VARCHAR(64)  NOT NULL,
  avatar_url         VARCHAR(255) NULL,
  bio                TEXT NULL,
  status             ENUM('active','suspended','banned') NOT NULL DEFAULT 'active',
  timezone           VARCHAR(64)  NOT NULL DEFAULT 'UTC',    -- IANA name
  region_strictness  ENUM('strict','nearby','any') NOT NULL DEFAULT 'nearby',
  country_code       CHAR(2)      NULL,
  home_region_id     INT UNSIGNED NULL,                      -- matchmaking-level region
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_active_at     DATETIME NULL,
  -- derived columns, maintained by triggers via sp_refresh_user_stats
  avg_rating         DECIMAL(3,2) NULL,
  review_count       INT UNSIGNED NOT NULL DEFAULT 0,
  sessions_completed INT UNSIGNED NOT NULL DEFAULT 0,
  trust_score        DECIMAL(5,2) NOT NULL DEFAULT 50.00,
  CONSTRAINT fk_users_country FOREIGN KEY (country_code)   REFERENCES country (country_code),
  CONSTRAINT fk_users_region  FOREIGN KEY (home_region_id) REFERENCES geo_region (region_id)
) ENGINE=InnoDB;

CREATE TABLE auth_account (                                  -- one row per login method
  auth_id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id          BIGINT UNSIGNED NOT NULL,
  provider         ENUM('discord','email') NOT NULL,
  provider_user_id VARCHAR(64)  NULL,                        -- Discord snowflake (identifier, not a secret)
  email            VARCHAR(254) NULL,
  password_hash    VARCHAR(255) NULL,                        -- argon2id hash; NULL for OAuth logins
  email_verified   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_auth_provider (provider, provider_user_id),
  UNIQUE KEY uq_auth_email (email),
  CONSTRAINT fk_auth_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT ck_auth_shape CHECK (
       (provider = 'email'   AND email IS NOT NULL AND password_hash IS NOT NULL)
    OR (provider = 'discord' AND provider_user_id IS NOT NULL AND password_hash IS NULL)),
  CONSTRAINT ck_auth_hash_format CHECK (password_hash IS NULL
    OR password_hash LIKE '$argon2id$%' OR password_hash LIKE '$2b$%')   -- never plaintext
) ENGINE=InnoDB;

CREATE TABLE auth_token (                                    -- login sessions; raw token never stored
  token_id   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id    BIGINT UNSIGNED NOT NULL,
  token_hash BINARY(32) NOT NULL UNIQUE,                     -- HMAC-SHA256(token, server secret)
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  user_agent VARCHAR(255) NULL,
  CONSTRAINT fk_token_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT ck_token_expiry CHECK (expires_at > created_at)
) ENGINE=InnoDB;

CREATE TABLE role (
  role_id     TINYINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  role_name   VARCHAR(32)  NOT NULL UNIQUE,
  description VARCHAR(255) NULL
) ENGINE=InnoDB;

CREATE TABLE permission (
  permission_id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code          VARCHAR(64)  NOT NULL UNIQUE,
  description   VARCHAR(255) NULL
) ENGINE=InnoDB;

CREATE TABLE role_permission (                               -- GRANTS (M:N)
  role_id       TINYINT UNSIGNED  NOT NULL,
  permission_id SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_rp_role FOREIGN KEY (role_id)       REFERENCES role (role_id)             ON DELETE CASCADE,
  CONSTRAINT fk_rp_perm FOREIGN KEY (permission_id) REFERENCES permission (permission_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE user_role (                                     -- HAS_ROLE (M:N)
  user_id     BIGINT UNSIGNED  NOT NULL,
  role_id     TINYINT UNSIGNED NOT NULL,
  assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  assigned_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (user_id, role_id),
  CONSTRAINT fk_ur_user FOREIGN KEY (user_id)     REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_ur_role FOREIGN KEY (role_id)     REFERENCES role (role_id),
  CONSTRAINT fk_ur_by   FOREIGN KEY (assigned_by) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE user_language (                                 -- SPEAKS (M:N)
  user_id       BIGINT UNSIGNED NOT NULL,
  language_code CHAR(2) NOT NULL,
  proficiency   ENUM('native','fluent','conversational','basic') NOT NULL DEFAULT 'conversational',
  is_preferred  BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (user_id, language_code),
  CONSTRAINT fk_ul_user FOREIGN KEY (user_id)       REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_ul_lang FOREIGN KEY (language_code) REFERENCES language (language_code)
) ENGINE=InnoDB;

-- ============================================================ game catalog
CREATE TABLE game (
  game_id      INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(100) NOT NULL UNIQUE,
  slug         VARCHAR(100) NOT NULL UNIQUE,
  developer    VARCHAR(100) NULL,
  publisher    VARCHAR(100) NULL,
  cover_url    VARCHAR(255) NULL,
  release_year SMALLINT NULL,
  description  TEXT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;

CREATE TABLE genre (
  genre_id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name     VARCHAR(64) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE game_genre (                                    -- HAS_GENRE (M:N)
  game_id  INT UNSIGNED      NOT NULL,
  genre_id SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (game_id, genre_id),
  CONSTRAINT fk_gg_game  FOREIGN KEY (game_id)  REFERENCES game (game_id)   ON DELETE CASCADE,
  CONSTRAINT fk_gg_genre FOREIGN KEY (genre_id) REFERENCES genre (genre_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE platform (
  platform_id    SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(64) NOT NULL UNIQUE,
  platform_type  ENUM('console','pc_launcher','mobile','social') NOT NULL,
  identity_label VARCHAR(64) NOT NULL                        -- "PSN ID", "Riot ID", ...
) ENGINE=InnoDB;

CREATE TABLE game_platform (                                 -- AVAILABLE_ON (M:N)
  game_id         INT UNSIGNED      NOT NULL,
  platform_id     SMALLINT UNSIGNED NOT NULL,
  crossplay_group VARCHAR(32) NULL,                          -- same group = can play together
  PRIMARY KEY (game_id, platform_id),
  CONSTRAINT fk_gp_game FOREIGN KEY (game_id)     REFERENCES game (game_id)         ON DELETE CASCADE,
  CONSTRAINT fk_gp_plat FOREIGN KEY (platform_id) REFERENCES platform (platform_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE game_mode (
  mode_id       INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  game_id       INT UNSIGNED NOT NULL,
  name          VARCHAR(64)  NOT NULL,
  min_team_size TINYINT UNSIGNED NOT NULL DEFAULT 1,
  max_team_size TINYINT UNSIGNED NOT NULL,
  is_ranked     BOOLEAN NOT NULL DEFAULT FALSE,
  description   VARCHAR(255) NULL,
  UNIQUE KEY uq_mode_name (game_id, name),
  UNIQUE KEY uq_mode_game (mode_id, game_id),                -- target of composite FKs
  CONSTRAINT fk_mode_game FOREIGN KEY (game_id) REFERENCES game (game_id) ON DELETE CASCADE,
  CONSTRAINT ck_mode_size CHECK (min_team_size >= 1 AND min_team_size <= max_team_size)
) ENGINE=InnoDB;

CREATE TABLE rank_tier (
  rank_id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  game_id INT UNSIGNED NOT NULL,
  name    VARCHAR(64)  NOT NULL,
  ordinal TINYINT UNSIGNED NOT NULL,                         -- 1 = lowest
  UNIQUE KEY uq_rank_name (game_id, name),
  UNIQUE KEY uq_rank_ord  (game_id, ordinal),
  UNIQUE KEY uq_rank_game (rank_id, game_id),
  CONSTRAINT fk_rank_game FOREIGN KEY (game_id) REFERENCES game (game_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE game_role (
  game_role_id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  game_id      INT UNSIGNED NOT NULL,
  name         VARCHAR(64)  NOT NULL,
  UNIQUE KEY uq_grole_name (game_id, name),
  UNIQUE KEY uq_grole_game (game_role_id, game_id),
  CONSTRAINT fk_grole_game FOREIGN KEY (game_id) REFERENCES game (game_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE game_server (                                   -- HAS_SERVER_IN (M:N, GAME x GEO_REGION)
  game_id     INT UNSIGNED NOT NULL,
  region_id   INT UNSIGNED NOT NULL,
  server_name VARCHAR(64)  NOT NULL,
  PRIMARY KEY (game_id, region_id),
  CONSTRAINT fk_gs_game   FOREIGN KEY (game_id)   REFERENCES game (game_id) ON DELETE CASCADE,
  CONSTRAINT fk_gs_region FOREIGN KEY (region_id) REFERENCES geo_region (region_id)
) ENGINE=InnoDB;

-- ============================================================ player profile
CREATE TABLE tag (
  tag_id   SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name     VARCHAR(48) NOT NULL UNIQUE,
  category VARCHAR(32) NULL
) ENGINE=InnoDB;

CREATE TABLE user_tag (                                      -- LIKES_TAG (M:N)
  user_id BIGINT UNSIGNED   NOT NULL,
  tag_id  SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (user_id, tag_id),
  CONSTRAINT fk_ut_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_ut_tag  FOREIGN KEY (tag_id)  REFERENCES tag (tag_id)    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE platform_account (                              -- gamertags
  account_id    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id       BIGINT UNSIGNED   NOT NULL,
  platform_id   SMALLINT UNSIGNED NOT NULL,
  handle        VARCHAR(64) NOT NULL,
  discriminator VARCHAR(16) NOT NULL DEFAULT '',             -- e.g. Riot tagline "#APAC"
  is_verified   BOOLEAN NOT NULL DEFAULT FALSE,
  is_public     BOOLEAN NOT NULL DEFAULT FALSE,              -- hidden until accepted into a session
  UNIQUE KEY uq_pa_handle (platform_id, handle, discriminator),
  CONSTRAINT fk_pa_user FOREIGN KEY (user_id)     REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_pa_plat FOREIGN KEY (platform_id) REFERENCES platform (platform_id)
) ENGINE=InnoDB;

CREATE TABLE player_game_profile (
  profile_id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id             BIGINT UNSIGNED NOT NULL,
  game_id             INT UNSIGNED    NOT NULL,
  platform_account_id BIGINT UNSIGNED NULL,
  rank_id             INT UNSIGNED    NULL,
  in_game_name        VARCHAR(64) NULL,
  hours_played        INT UNSIGNED NOT NULL DEFAULT 0,
  is_main             BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE KEY uq_pgp      (user_id, game_id, platform_account_id),
  UNIQUE KEY uq_pgp_game (profile_id, game_id),
  CONSTRAINT fk_pgp_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_pgp_game FOREIGN KEY (game_id) REFERENCES game (game_id),
  CONSTRAINT fk_pgp_acct FOREIGN KEY (platform_account_id) REFERENCES platform_account (account_id) ON DELETE SET NULL,
  CONSTRAINT fk_pgp_rank FOREIGN KEY (rank_id, game_id) REFERENCES rank_tier (rank_id, game_id)   -- rank must belong to the same game
) ENGINE=InnoDB;

CREATE TABLE profile_mode (                                  -- PREFERS_MODE (M:N)
  profile_id   BIGINT UNSIGNED NOT NULL,
  game_id      INT UNSIGNED    NOT NULL,
  mode_id      INT UNSIGNED    NOT NULL,
  rank_id      INT UNSIGNED    NULL,
  is_preferred BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (profile_id, mode_id),
  CONSTRAINT fk_pm_profile FOREIGN KEY (profile_id, game_id) REFERENCES player_game_profile (profile_id, game_id) ON DELETE CASCADE,
  CONSTRAINT fk_pm_mode    FOREIGN KEY (mode_id, game_id)    REFERENCES game_mode (mode_id, game_id),
  CONSTRAINT fk_pm_rank    FOREIGN KEY (rank_id, game_id)    REFERENCES rank_tier (rank_id, game_id)
) ENGINE=InnoDB;

CREATE TABLE profile_role (                                  -- PREFERS_ROLE (M:N)
  profile_id       BIGINT UNSIGNED  NOT NULL,
  game_id          INT UNSIGNED     NOT NULL,
  game_role_id     INT UNSIGNED     NOT NULL,
  preference_order TINYINT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (profile_id, game_role_id),
  CONSTRAINT fk_pr_profile FOREIGN KEY (profile_id, game_id)   REFERENCES player_game_profile (profile_id, game_id) ON DELETE CASCADE,
  CONSTRAINT fk_pr_role    FOREIGN KEY (game_role_id, game_id) REFERENCES game_role (game_role_id, game_id)
) ENGINE=InnoDB;

CREATE TABLE availability (                                  -- weak entity of USER; times in users.timezone
  user_id     BIGINT UNSIGNED  NOT NULL,
  day_of_week TINYINT UNSIGNED NOT NULL,                     -- 0 = Monday ... 6 = Sunday (matches WEEKDAY())
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  PRIMARY KEY (user_id, day_of_week, start_time),
  CONSTRAINT fk_av_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT ck_av_day  CHECK (day_of_week BETWEEN 0 AND 6),
  CONSTRAINT ck_av_time CHECK (end_time > start_time)
) ENGINE=InnoDB;

-- ============================================================ sessions & teams
CREATE TABLE team (
  team_id     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(64) NOT NULL UNIQUE,
  tag         VARCHAR(8)  NULL,
  owner_id    BIGINT UNSIGNED NOT NULL,
  game_id     INT UNSIGNED NULL,
  region_id   INT UNSIGNED NULL,
  description VARCHAR(255) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_team_owner  FOREIGN KEY (owner_id)  REFERENCES users (user_id),
  CONSTRAINT fk_team_game   FOREIGN KEY (game_id)   REFERENCES game (game_id),
  CONSTRAINT fk_team_region FOREIGN KEY (region_id) REFERENCES geo_region (region_id)
) ENGINE=InnoDB;

CREATE TABLE team_member (                                   -- MEMBER_OF (M:N)
  team_id   BIGINT UNSIGNED NOT NULL,
  user_id   BIGINT UNSIGNED NOT NULL,
  team_role ENUM('owner','captain','member') NOT NULL DEFAULT 'member',
  joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (team_id, user_id),
  CONSTRAINT fk_tm_team FOREIGN KEY (team_id) REFERENCES team (team_id) ON DELETE CASCADE,
  CONSTRAINT fk_tm_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE lfg_session (
  session_id      BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT PRIMARY KEY,
  host_id         BIGINT UNSIGNED   NOT NULL,
  game_id         INT UNSIGNED      NOT NULL,
  mode_id         INT UNSIGNED      NOT NULL,
  platform_id     SMALLINT UNSIGNED NOT NULL,
  team_id         BIGINT UNSIGNED   NULL,
  region_id       INT UNSIGNED      NULL,
  min_rank_id     INT UNSIGNED      NULL,
  max_rank_id     INT UNSIGNED      NULL,
  title           VARCHAR(120) NOT NULL,
  description     TEXT NULL,
  status          ENUM('open','full','in_progress','completed','cancelled') NOT NULL DEFAULT 'open',
  max_players     TINYINT UNSIGNED NOT NULL,
  current_players TINYINT UNSIGNED NOT NULL DEFAULT 0,        -- derived: accepted participants (trigger-maintained)
  scheduled_start DATETIME NULL,                              -- UTC
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  region_locked   BOOLEAN NOT NULL DEFAULT FALSE,
  voice_required  BOOLEAN NOT NULL DEFAULT FALSE,
  visibility      ENUM('public','friends','invite') NOT NULL DEFAULT 'public',
  join_policy     ENUM('auto','approval') NOT NULL DEFAULT 'approval',
  min_avg_rating  DECIMAL(3,2) NULL,
  require_verified_discord BOOLEAN NOT NULL DEFAULT FALSE,
  discord_channel_id VARCHAR(32)  NULL,
  discord_invite_url VARCHAR(255) NULL,
  UNIQUE KEY uq_session_game (session_id, game_id),
  CONSTRAINT fk_ls_host     FOREIGN KEY (host_id)     REFERENCES users (user_id),
  CONSTRAINT fk_ls_game     FOREIGN KEY (game_id)     REFERENCES game (game_id),
  CONSTRAINT fk_ls_mode     FOREIGN KEY (mode_id, game_id)     REFERENCES game_mode (mode_id, game_id),   -- mode must belong to game
  CONSTRAINT fk_ls_platform FOREIGN KEY (platform_id) REFERENCES platform (platform_id),
  CONSTRAINT fk_ls_team     FOREIGN KEY (team_id)     REFERENCES team (team_id),
  CONSTRAINT fk_ls_region   FOREIGN KEY (region_id)   REFERENCES geo_region (region_id),
  CONSTRAINT fk_ls_minrank  FOREIGN KEY (min_rank_id, game_id) REFERENCES rank_tier (rank_id, game_id),
  CONSTRAINT fk_ls_maxrank  FOREIGN KEY (max_rank_id, game_id) REFERENCES rank_tier (rank_id, game_id),
  CONSTRAINT ck_ls_players  CHECK (max_players >= 1 AND current_players <= max_players),
  CONSTRAINT ck_ls_rating   CHECK (min_avg_rating IS NULL OR min_avg_rating BETWEEN 1 AND 5)
) ENGINE=InnoDB;

CREATE TABLE session_language (                              -- CONDUCTED_IN (M:N)
  session_id    BIGINT UNSIGNED NOT NULL,
  language_code CHAR(2) NOT NULL,
  PRIMARY KEY (session_id, language_code),
  CONSTRAINT fk_sl_session FOREIGN KEY (session_id)    REFERENCES lfg_session (session_id) ON DELETE CASCADE,
  CONSTRAINT fk_sl_lang    FOREIGN KEY (language_code) REFERENCES language (language_code)
) ENGINE=InnoDB;

CREATE TABLE session_tag (                                   -- SESSION_TAGGED (M:N)
  session_id BIGINT UNSIGNED   NOT NULL,
  tag_id     SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (session_id, tag_id),
  CONSTRAINT fk_st_session FOREIGN KEY (session_id) REFERENCES lfg_session (session_id) ON DELETE CASCADE,
  CONSTRAINT fk_st_tag     FOREIGN KEY (tag_id)     REFERENCES tag (tag_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE session_slot (                                  -- weak entity of LFG_SESSION: "need 1 support"
  session_id   BIGINT UNSIGNED  NOT NULL,
  slot_no      TINYINT UNSIGNED NOT NULL,
  game_id      INT UNSIGNED     NOT NULL,
  game_role_id INT UNSIGNED     NOT NULL,
  slots_needed TINYINT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (session_id, slot_no),
  CONSTRAINT fk_ss_session FOREIGN KEY (session_id, game_id)   REFERENCES lfg_session (session_id, game_id) ON DELETE CASCADE,
  CONSTRAINT fk_ss_role    FOREIGN KEY (game_role_id, game_id) REFERENCES game_role (game_role_id, game_id),
  CONSTRAINT ck_ss_needed  CHECK (slots_needed >= 1)
) ENGINE=InnoDB;

CREATE TABLE session_participant (                           -- weak entity of LFG_SESSION
  session_id          BIGINT UNSIGNED NOT NULL,
  user_id             BIGINT UNSIGNED NOT NULL,
  game_role_id        INT UNSIGNED    NULL,
  platform_account_id BIGINT UNSIGNED NULL,
  status              ENUM('requested','accepted','declined','left','kicked') NOT NULL DEFAULT 'requested',
  joined_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  left_at             DATETIME NULL,
  PRIMARY KEY (session_id, user_id),
  CONSTRAINT fk_sp_session FOREIGN KEY (session_id)          REFERENCES lfg_session (session_id) ON DELETE CASCADE,
  CONSTRAINT fk_sp_user    FOREIGN KEY (user_id)             REFERENCES users (user_id),
  CONSTRAINT fk_sp_role    FOREIGN KEY (game_role_id)        REFERENCES game_role (game_role_id),
  CONSTRAINT fk_sp_acct    FOREIGN KEY (platform_account_id) REFERENCES platform_account (account_id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE match_recommendation (
  rec_id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id         BIGINT UNSIGNED NOT NULL,
  session_id      BIGINT UNSIGNED NOT NULL,
  score           DECIMAL(6,4) NOT NULL,
  score_breakdown JSON NULL,
  source          ENUM('sql','vector','hybrid') NOT NULL DEFAULT 'sql',
  shown_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  outcome         ENUM('ignored','viewed','requested','joined') NOT NULL DEFAULT 'ignored',
  CONSTRAINT fk_mr_user    FOREIGN KEY (user_id)    REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_mr_session FOREIGN KEY (session_id) REFERENCES lfg_session (session_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================ social & trust
-- MySQL forbids CHECKs on columns that have CASCADE / SET NULL referential actions,
-- so tables below with CHECKs on FK columns keep the default (RESTRICT) actions.
CREATE TABLE friendship (                                    -- FRIENDS_WITH (recursive M:N on USER)
  requester_id BIGINT UNSIGNED NOT NULL,
  addressee_id BIGINT UNSIGNED NOT NULL,
  status       ENUM('pending','accepted','declined') NOT NULL DEFAULT 'pending',
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  pair_low     BIGINT UNSIGNED AS (LEAST(requester_id, addressee_id))    STORED,
  pair_high    BIGINT UNSIGNED AS (GREATEST(requester_id, addressee_id)) STORED,
  PRIMARY KEY (requester_id, addressee_id),
  UNIQUE KEY uq_friend_pair (pair_low, pair_high),           -- A->B and B->A count once
  CONSTRAINT fk_fr_req  FOREIGN KEY (requester_id) REFERENCES users (user_id),
  CONSTRAINT fk_fr_addr FOREIGN KEY (addressee_id) REFERENCES users (user_id),
  CONSTRAINT ck_fr_self CHECK (requester_id <> addressee_id)
) ENGINE=InnoDB;

CREATE TABLE message (
  message_id  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  sender_id   BIGINT UNSIGNED NOT NULL,
  session_id  BIGINT UNSIGNED NULL,                          -- session chat ...
  receiver_id BIGINT UNSIGNED NULL,                          -- ... or a direct message
  content     TEXT NOT NULL,
  sent_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  edited_at   DATETIME NULL,
  is_deleted  BOOLEAN NOT NULL DEFAULT FALSE,                -- soft delete keeps moderator evidence
  CONSTRAINT fk_msg_sender   FOREIGN KEY (sender_id)   REFERENCES users (user_id),
  CONSTRAINT fk_msg_session  FOREIGN KEY (session_id)  REFERENCES lfg_session (session_id),
  CONSTRAINT fk_msg_receiver FOREIGN KEY (receiver_id) REFERENCES users (user_id),
  CONSTRAINT ck_msg_target CHECK ((session_id IS NULL) <> (receiver_id IS NULL)),
  CONSTRAINT ck_msg_self   CHECK (receiver_id IS NULL OR receiver_id <> sender_id)
) ENGINE=InnoDB;

CREATE TABLE review (                                        -- weak entity: (session, reviewer, reviewed)
  session_id   BIGINT UNSIGNED  NOT NULL,
  reviewer_id  BIGINT UNSIGNED  NOT NULL,
  reviewed_id  BIGINT UNSIGNED  NOT NULL,
  rating       TINYINT UNSIGNED NOT NULL,
  comment_text VARCHAR(500) NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (session_id, reviewer_id, reviewed_id),
  CONSTRAINT fk_rv_session  FOREIGN KEY (session_id)  REFERENCES lfg_session (session_id),
  CONSTRAINT fk_rv_reviewer FOREIGN KEY (reviewer_id) REFERENCES users (user_id),
  CONSTRAINT fk_rv_reviewed FOREIGN KEY (reviewed_id) REFERENCES users (user_id),
  CONSTRAINT ck_rv_rating CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT ck_rv_self   CHECK (reviewer_id <> reviewed_id)
) ENGINE=InnoDB;

CREATE TABLE badge (
  badge_id    SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(64)  NOT NULL UNIQUE,
  description VARCHAR(255) NULL,
  criteria    VARCHAR(255) NULL
) ENGINE=InnoDB;

CREATE TABLE user_badge (                                    -- EARNS (M:N)
  user_id    BIGINT UNSIGNED   NOT NULL,
  badge_id   SMALLINT UNSIGNED NOT NULL,
  awarded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  session_id BIGINT UNSIGNED NULL,
  PRIMARY KEY (user_id, badge_id),
  CONSTRAINT fk_ub_user    FOREIGN KEY (user_id)    REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_ub_badge   FOREIGN KEY (badge_id)   REFERENCES badge (badge_id),
  CONSTRAINT fk_ub_session FOREIGN KEY (session_id) REFERENCES lfg_session (session_id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ============================================================ moderation & audit
CREATE TABLE user_block (                                    -- BLOCKS (recursive M:N on USER)
  blocker_id BIGINT UNSIGNED NOT NULL,
  blocked_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reason     VARCHAR(255) NULL,
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT fk_ubk_blocker FOREIGN KEY (blocker_id) REFERENCES users (user_id),
  CONSTRAINT fk_ubk_blocked FOREIGN KEY (blocked_id) REFERENCES users (user_id),
  CONSTRAINT ck_ubk_self CHECK (blocker_id <> blocked_id)
) ENGINE=InnoDB;

CREATE TABLE report (
  report_id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  reporter_id      BIGINT UNSIGNED NOT NULL,
  reported_user_id BIGINT UNSIGNED NOT NULL,
  session_id       BIGINT UNSIGNED NULL,
  message_id       BIGINT UNSIGNED NULL,
  category         ENUM('harassment','cheating','spam','no_show','other') NOT NULL,
  description      TEXT NULL,
  status           ENUM('open','reviewing','actioned','dismissed') NOT NULL DEFAULT 'open',
  handled_by       BIGINT UNSIGNED NULL,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at      DATETIME NULL,
  CONSTRAINT fk_rp_reporter FOREIGN KEY (reporter_id)      REFERENCES users (user_id),
  CONSTRAINT fk_rp_reported FOREIGN KEY (reported_user_id) REFERENCES users (user_id),
  CONSTRAINT fk_rp_session  FOREIGN KEY (session_id)       REFERENCES lfg_session (session_id),
  CONSTRAINT fk_rp_message  FOREIGN KEY (message_id)       REFERENCES message (message_id),
  CONSTRAINT fk_rp_handler  FOREIGN KEY (handled_by)       REFERENCES users (user_id),
  CONSTRAINT ck_rp_self CHECK (reporter_id <> reported_user_id)
) ENGINE=InnoDB;

CREATE TABLE sanction (
  sanction_id   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id       BIGINT UNSIGNED NOT NULL,
  sanction_type ENUM('warn','mute','suspend','ban') NOT NULL,
  reason        VARCHAR(255) NOT NULL,
  issued_by     BIGINT UNSIGNED NOT NULL,
  report_id     BIGINT UNSIGNED NULL,
  starts_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ends_at       DATETIME NULL,                               -- NULL = permanent
  CONSTRAINT fk_sn_user   FOREIGN KEY (user_id)   REFERENCES users (user_id),
  CONSTRAINT fk_sn_issuer FOREIGN KEY (issued_by) REFERENCES users (user_id),
  CONSTRAINT fk_sn_report FOREIGN KEY (report_id) REFERENCES report (report_id),
  CONSTRAINT ck_sn_period CHECK (ends_at IS NULL OR ends_at > starts_at),
  CONSTRAINT ck_sn_self   CHECK (user_id <> issued_by)
) ENGINE=InnoDB;

CREATE TABLE audit_log (                                     -- append-only; filled by triggers
  log_id    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  actor_id  BIGINT UNSIGNED NULL,
  entity    VARCHAR(64) NOT NULL,
  entity_id VARCHAR(64) NOT NULL,
  action    VARCHAR(32) NOT NULL,
  old_value JSON NULL,
  new_value JSON NULL,
  logged_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_audit_entity (entity, entity_id)
) ENGINE=InnoDB;

-- ============================================================ vector store sync
CREATE TABLE embedding_outbox (                              -- MySQL -> MongoDB queue; filled by 07_vector_outbox.sql triggers
  entity      ENUM('player','session') NOT NULL,             -- player = users.user_id, session = lfg_session.session_id
  entity_id   BIGINT UNSIGNED NOT NULL,
  op          ENUM('upsert','delete') NOT NULL,
  enqueued_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  attempts    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  last_error  VARCHAR(255) NULL,
  PRIMARY KEY (entity, entity_id),                           -- repeated edits coalesce into one row
  KEY ix_outbox_enqueued (enqueued_at)
) ENGINE=InnoDB;

-- ============================================================ indexes for common lookups
CREATE INDEX ix_session_status   ON lfg_session (status, game_id, scheduled_start);
CREATE INDEX ix_participant_user ON session_participant (user_id, status);
CREATE INDEX ix_message_session  ON message (session_id, sent_at);
CREATE INDEX ix_review_reviewed  ON review (reviewed_id);
CREATE INDEX ix_pgp_game         ON player_game_profile (game_id, rank_id);
CREATE INDEX ix_token_user       ON auth_token (user_id, expires_at);
