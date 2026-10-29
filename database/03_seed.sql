SET NAMES utf8mb4;
SET time_zone = '+00:00';   -- all DATETIME columns are UTC
-- PairADice sample data. Run after 01_schema.sql and 02_routines.sql.
-- Triggers are active while seeding, so derived columns (current_players, avg_rating,
-- trust_score, sessions_completed), badges and audit_log rows fill themselves.
-- No real secrets: password hashes are fake argon2id-format placeholders,
-- token hashes are random bytes (RANDOM_BYTES) -- no raw token exists anywhere.
USE pairadice;

-- ============================================================ language & region
INSERT INTO language (language_code, name, native_name) VALUES
 ('en','English','English'), ('hi','Hindi','हिन्दी'), ('ja','Japanese','日本語'),
 ('de','German','Deutsch'), ('es','Spanish','Español'), ('fr','French','Français');

INSERT INTO geo_region (region_id, name, code, region_level, parent_region_id) VALUES
 (1,'Asia','ASIA','continent',NULL), (2,'Europe','EUROPE','continent',NULL), (3,'North America','N-AMERICA','continent',NULL),
 (4,'South Asia','S-ASIA','sub_region',1), (5,'East Asia','E-ASIA','sub_region',1),
 (6,'Western Europe','W-EUROPE','sub_region',2),
 (7,'Eastern North America','E-NA','sub_region',3), (8,'Western North America','W-NA','sub_region',3),
 (9,'AP South (Mumbai)','AP-SOUTH','matchmaking',4), (10,'AP East (Tokyo)','AP-EAST','matchmaking',5),
 (11,'EU West (Paris/London)','EU-WEST','matchmaking',6), (12,'EU Central (Frankfurt)','EU-CENTRAL','matchmaking',6),
 (13,'NA East (Virginia)','NA-EAST','matchmaking',7), (14,'NA West (Oregon)','NA-WEST','matchmaking',8);

INSERT INTO country (country_code, name, region_id) VALUES
 ('IN','India',9), ('JP','Japan',10), ('GB','United Kingdom',11), ('FR','France',11), ('ES','Spain',11),
 ('DE','Germany',12), ('US','United States',13), ('CA','Canada',13);

-- ============================================================ RBAC catalogue
INSERT INTO role (role_id, role_name, description) VALUES
 (1,'player','Regular player'), (2,'moderator','Handles reports and sanctions'), (3,'admin','Full control');

INSERT INTO permission (permission_id, code, description) VALUES
 (1,'session.create','Host an LFG session'), (2,'session.join','Join sessions'), (3,'message.send','Chat and DM'),
 (4,'review.write','Review teammates'), (5,'report.create','Report a player'),
 (6,'report.review','Handle the report queue'), (7,'user.sanction','Warn, mute or suspend users'),
 (8,'audit.read','Read the audit log'), (9,'user.ban','Permanently ban users'),
 (10,'role.assign','Grant or revoke roles'), (11,'game.manage','Edit the game catalogue');

INSERT INTO role_permission (role_id, permission_id) VALUES
 (1,1),(1,2),(1,3),(1,4),(1,5),
 (2,1),(2,2),(2,3),(2,4),(2,5),(2,6),(2,7),(2,8),
 (3,1),(3,2),(3,3),(3,4),(3,5),(3,6),(3,7),(3,8),(3,9),(3,10),(3,11);

-- ============================================================ users
INSERT INTO users (user_id, username, display_name, bio, timezone, region_strictness, country_code, home_region_id, last_active_at) VALUES
 (1,'aarav_plays','Aarav','Gold Valorant duelist, Fortnite on weekends','Asia/Kolkata','nearby','IN',9,NOW()),
 (2,'priya_gg','Priya','Controller main. Comms first.','Asia/Kolkata','strict','IN',9,NOW()),
 (3,'mei_tanaka','Mei','Bedwars builder, JP evenings','Asia/Tokyo','nearby','JP',10,NOW()),
 (4,'lukas_mc','Lukas','Bedwars rusher, chill EU squad','Europe/Berlin','nearby','DE',12,NOW()),
 (5,'sofia_bw','Sofía','Bedwars defender, Java + Bedrock','Europe/Madrid','any','ES',11,NOW()),
 (6,'tom_builds','Tom','Bedrock survival builder','Europe/London','nearby','GB',11,NOW()),
 (7,'jake_fn','Jake','Fortnite Champion, IGL','America/New_York','nearby','US',13,NOW()),
 (8,'rohan_duelist','Rohan','Diamond duelist, flexes Fortnite','Asia/Kolkata','nearby','IN',9,NOW()),
 (9,'mod_alex','Alex (Mod)','Community moderator','America/Chicago','any','US',13,NOW()),
 (10,'admin_sam','Sam (Admin)','Platform admin','Europe/London','any','GB',11,NOW()),
 (11,'toxic_tyler','Tyler','gg ez','America/New_York','any','US',13,NOW()),
 (12,'kiara_ctrl','Kiara','Platinum controller looking for a comp stack','Asia/Kolkata','nearby','IN',9,NOW());

-- login methods (fake argon2id placeholders; Discord rows have no password)
INSERT INTO auth_account (auth_id, user_id, provider, provider_user_id, email, password_hash, email_verified) VALUES
 (1,1,'discord','110000000000000001',NULL,NULL,FALSE),
 (2,1,'email',NULL,'aarav@example.com','$argon2id$v=19$m=65536,t=3,p=4$c2VlZC1zYWx0LTAx$SEED-PLACEHOLDER-NOT-A-REAL-HASH-01',TRUE),
 (3,2,'email',NULL,'priya@example.com','$argon2id$v=19$m=65536,t=3,p=4$c2VlZC1zYWx0LTAy$SEED-PLACEHOLDER-NOT-A-REAL-HASH-02',TRUE),
 (4,3,'discord','110000000000000003',NULL,NULL,FALSE),
 (5,4,'discord','110000000000000004',NULL,NULL,FALSE),
 (6,5,'email',NULL,'sofia@example.com','$argon2id$v=19$m=65536,t=3,p=4$c2VlZC1zYWx0LTA1$SEED-PLACEHOLDER-NOT-A-REAL-HASH-05',FALSE),
 (7,6,'discord','110000000000000006',NULL,NULL,FALSE),
 (8,7,'discord','110000000000000007',NULL,NULL,FALSE),
 (9,7,'email',NULL,'jake@example.com','$argon2id$v=19$m=65536,t=3,p=4$c2VlZC1zYWx0LTA3$SEED-PLACEHOLDER-NOT-A-REAL-HASH-07',TRUE),
 (10,8,'discord','110000000000000008',NULL,NULL,FALSE),
 (11,9,'email',NULL,'alex.mod@example.com','$argon2id$v=19$m=65536,t=3,p=4$c2VlZC1zYWx0LTA5$SEED-PLACEHOLDER-NOT-A-REAL-HASH-09',TRUE),
 (12,10,'email',NULL,'sam.admin@example.com','$argon2id$v=19$m=65536,t=3,p=4$c2VlZC1zYWx0LTEw$SEED-PLACEHOLDER-NOT-A-REAL-HASH-10',TRUE),
 (13,11,'discord','110000000000000011',NULL,NULL,FALSE),
 (14,12,'discord','110000000000000012',NULL,NULL,FALSE);

-- login sessions: only HMAC hashes are stored; these are random bytes, so no token can be derived
INSERT INTO auth_token (user_id, token_hash, created_at, expires_at, revoked_at, user_agent) VALUES
 (1,  RANDOM_BYTES(32), NOW() - INTERVAL 2 DAY,  NOW() + INTERVAL 28 DAY, NULL, 'Chrome/Windows'),
 (1,  RANDOM_BYTES(32), NOW() - INTERVAL 40 DAY, NOW() - INTERVAL 10 DAY, NULL, 'Safari/iOS'),
 (2,  RANDOM_BYTES(32), NOW() - INTERVAL 1 DAY,  NOW() + INTERVAL 29 DAY, NULL, 'Firefox/Linux'),
 (7,  RANDOM_BYTES(32), NOW() - INTERVAL 5 DAY,  NOW() + INTERVAL 25 DAY, NOW() - INTERVAL 1 DAY, 'Chrome/macOS'),
 (9,  RANDOM_BYTES(32), NOW() - INTERVAL 3 HOUR, NOW() + INTERVAL 1 DAY,  NULL, 'Edge/Windows'),
 (12, RANDOM_BYTES(32), NOW() - INTERVAL 1 HOUR, NOW() + INTERVAL 30 DAY, NULL, 'Discord in-app');

-- roles: bootstrap rows (assigned_by NULL), then the admin grants moderator to Alex
INSERT INTO user_role (user_id, role_id, assigned_by) VALUES
 (1,1,NULL),(2,1,NULL),(3,1,NULL),(4,1,NULL),(5,1,NULL),(6,1,NULL),(7,1,NULL),(8,1,NULL),
 (9,1,NULL),(10,1,NULL),(11,1,NULL),(12,1,NULL),(10,3,NULL);
INSERT INTO user_role (user_id, role_id, assigned_by) VALUES (9,2,10);

INSERT INTO user_language (user_id, language_code, proficiency, is_preferred) VALUES
 (1,'hi','native',FALSE),(1,'en','fluent',TRUE),
 (2,'en','fluent',TRUE),(2,'hi','native',FALSE),
 (3,'ja','native',TRUE),(3,'en','conversational',FALSE),
 (4,'de','native',TRUE),(4,'en','fluent',FALSE),
 (5,'es','native',TRUE),(5,'en','conversational',FALSE),
 (6,'en','native',TRUE),(6,'fr','basic',FALSE),
 (7,'en','native',TRUE),(7,'es','basic',FALSE),
 (8,'hi','native',FALSE),(8,'en','fluent',TRUE),
 (9,'en','native',TRUE),(10,'en','native',TRUE),(11,'en','native',TRUE),
 (12,'en','fluent',TRUE),(12,'hi','conversational',FALSE);

-- ============================================================ game catalogue
INSERT INTO game (game_id, name, slug, developer, publisher, release_year, description) VALUES
 (1,'Minecraft','minecraft','Mojang Studios','Microsoft',2011,'Sandbox survival; Bedwars, PvP, Duels and SMP servers'),
 (2,'Valorant','valorant','Riot Games','Riot Games',2020,'5v5 tactical hero shooter'),
 (3,'Fortnite','fortnite','Epic Games','Epic Games',2017,'Battle royale with build and zero-build modes');

INSERT INTO genre (genre_id, name) VALUES
 (1,'Sandbox'),(2,'Survival'),(3,'Tactical Shooter'),(4,'FPS'),(5,'Battle Royale');
INSERT INTO game_genre (game_id, genre_id) VALUES (1,1),(1,2),(2,3),(2,4),(3,5),(3,1);

INSERT INTO platform (platform_id, name, platform_type, identity_label) VALUES
 (1,'PC (Java)','pc_launcher','Minecraft Java username'),
 (2,'PlayStation','console','PSN ID'),
 (3,'Xbox','console','Xbox Gamertag'),
 (4,'Nintendo Switch','console','Nintendo Friend Code'),
 (5,'Mobile','mobile','Account ID'),
 (6,'Riot Client','pc_launcher','Riot ID'),
 (7,'Epic Games','pc_launcher','Epic display name'),
 (8,'Discord','social','Discord username');

INSERT INTO game_platform (game_id, platform_id, crossplay_group) VALUES
 (1,1,NULL),(1,2,'bedrock'),(1,3,'bedrock'),(1,4,'bedrock'),(1,5,'bedrock'),
 (2,6,NULL),
 (3,7,'epic'),(3,2,'epic'),(3,3,'epic'),(3,4,'epic'),(3,5,'epic');

INSERT INTO game_mode (mode_id, game_id, name, min_team_size, max_team_size, is_ranked, description) VALUES
 (1,1,'Bedwars',1,4,FALSE,'Protect your bed, destroy theirs'),
 (2,1,'PvP',1,8,FALSE,'Free-for-all and team PvP arenas'),
 (3,1,'Duels',1,2,FALSE,'1v1 / 2v2 duels'),
 (4,1,'Survival Multiplayer',1,10,FALSE,'Shared survival world'),
 (5,2,'Competitive',1,5,TRUE,'Ranked 5v5'),
 (6,2,'Unrated',1,5,FALSE,'Unranked 5v5'),
 (7,2,'Spike Rush',1,5,FALSE,'Short best-of-7'),
 (8,2,'Deathmatch',1,1,FALSE,'Free-for-all warm-up'),
 (9,3,'Battle Royale Squads',1,4,FALSE,'Classic squads'),
 (10,3,'Zero Build Ranked',1,4,TRUE,'Ranked, no building'),
 (11,3,'Creative',1,16,FALSE,'Custom maps');

INSERT INTO rank_tier (rank_id, game_id, name, ordinal) VALUES
 (1,1,'Beginner',1),(2,1,'Intermediate',2),(3,1,'Advanced',3),(4,1,'Expert',4),
 (5,2,'Iron',1),(6,2,'Bronze',2),(7,2,'Silver',3),(8,2,'Gold',4),(9,2,'Platinum',5),
 (10,2,'Diamond',6),(11,2,'Ascendant',7),(12,2,'Immortal',8),(13,2,'Radiant',9),
 (14,3,'Bronze',1),(15,3,'Silver',2),(16,3,'Gold',3),(17,3,'Platinum',4),
 (18,3,'Diamond',5),(19,3,'Elite',6),(20,3,'Champion',7),(21,3,'Unreal',8);

INSERT INTO game_role (game_role_id, game_id, name) VALUES
 (1,1,'Bed Defender'),(2,1,'Rusher'),(3,1,'Builder'),
 (4,2,'Duelist'),(5,2,'Controller'),(6,2,'Initiator'),(7,2,'Sentinel'),
 (8,3,'Fragger'),(9,3,'Support'),(10,3,'In-Game Leader');

INSERT INTO game_server (game_id, region_id, server_name) VALUES
 (2,9,'Mumbai'),(2,10,'Tokyo'),(2,11,'Paris'),(2,12,'Frankfurt'),(2,13,'Virginia'),(2,14,'Oregon'),
 (3,10,'Asia'),(3,11,'Europe'),(3,13,'NA-East'),(3,14,'NA-West');

-- ============================================================ player profile
INSERT INTO tag (tag_id, name, category) VALUES
 (1,'chill','vibe'),(2,'competitive','vibe'),(3,'mic-required','comms'),(4,'beginner-friendly','vibe'),
 (5,'tryhard','vibe'),(6,'family-friendly','vibe'),(7,'late-night','schedule');

INSERT INTO user_tag (user_id, tag_id) VALUES
 (1,2),(1,3),(1,7), (2,2),(2,3), (3,1),(3,4), (4,1),(4,6), (5,2),(5,5), (6,1),(6,4),
 (7,5),(7,3),(7,7), (8,2),(8,5),(8,3), (11,5), (12,2),(12,1);

INSERT INTO platform_account (account_id, user_id, platform_id, handle, discriminator, is_verified, is_public) VALUES
 (1,1,6,'AaravOP','#IND1',TRUE,FALSE),   (2,1,8,'aarav.plays','',TRUE,TRUE),   (3,1,7,'AaravBuilds','',FALSE,FALSE),
 (4,2,6,'PriyaGG','#0007',TRUE,FALSE),   (5,3,1,'MeiCrafts','',TRUE,FALSE),    (6,3,8,'mei.tanaka','',TRUE,TRUE),
 (7,4,1,'LukasMC','',TRUE,TRUE),         (8,4,8,'lukas_mc','',TRUE,TRUE),      (9,5,2,'SofiaBW_PS','',FALSE,FALSE),
 (10,6,3,'TomBuilds','',TRUE,FALSE),     (11,5,1,'SofiaJava','',TRUE,FALSE),   (12,7,7,'JakeFN','',TRUE,TRUE),
 (13,7,2,'JakeFN_PS','',FALSE,FALSE),    (14,8,6,'RohanDuels','#IN99',TRUE,FALSE), (15,8,7,'RohanFN','',FALSE,FALSE),
 (16,11,6,'TylerTilt','#NA1',FALSE,FALSE), (17,11,7,'TylerTilt','',FALSE,FALSE), (18,2,7,'PriyaFN','',FALSE,FALSE),
 (19,12,6,'KiaraCtrl','#IND2',TRUE,FALSE), (20,12,8,'kiara.ctrl','',TRUE,TRUE);

INSERT INTO player_game_profile (profile_id, user_id, game_id, platform_account_id, rank_id, in_game_name, hours_played, is_main) VALUES
 (1,1,2,1,8,'AaravOP',420,TRUE),   (2,2,2,4,9,'PriyaGG',610,TRUE),    (3,8,2,14,10,'RohanDuels',890,TRUE),
 (4,11,2,16,7,'TylerTilt',150,FALSE), (5,12,2,19,9,'KiaraCtrl',380,TRUE),
 (6,3,1,5,3,'MeiCrafts',1300,TRUE), (7,4,1,7,4,'LukasMC',2100,TRUE),  (8,5,1,11,2,'SofiaJava',300,TRUE),
 (9,5,1,9,2,'SofiaBW_PS',120,FALSE), (10,6,1,10,1,'TomBuilds',80,TRUE),
 (11,7,3,12,20,'JakeFN',1500,TRUE), (12,1,3,3,16,'AaravBuilds',200,FALSE), (13,8,3,15,18,'RohanFN',340,FALSE),
 (14,11,3,17,17,'TylerTilt',500,TRUE), (15,2,3,18,16,'PriyaFN',90,FALSE);

INSERT INTO profile_mode (profile_id, game_id, mode_id, rank_id, is_preferred) VALUES
 (1,2,5,8,TRUE),(1,2,6,NULL,TRUE),(2,2,5,9,TRUE),(3,2,5,10,TRUE),(3,2,8,NULL,TRUE),(4,2,6,NULL,TRUE),(5,2,5,9,TRUE),
 (6,1,1,3,TRUE),(6,1,4,NULL,TRUE),(7,1,1,4,TRUE),(7,1,3,4,TRUE),(8,1,1,2,TRUE),(9,1,1,2,TRUE),(10,1,4,NULL,TRUE),
 (11,3,9,NULL,TRUE),(11,3,10,20,TRUE),(12,3,9,NULL,TRUE),(13,3,10,18,TRUE),(14,3,9,NULL,TRUE),(15,3,9,NULL,TRUE);

INSERT INTO profile_role (profile_id, game_id, game_role_id, preference_order) VALUES
 (1,2,4,1),(1,2,6,2),(2,2,5,1),(2,2,7,2),(3,2,4,1),(4,2,4,1),(5,2,5,1),(5,2,7,2),
 (6,1,3,1),(6,1,1,2),(7,1,2,1),(8,1,1,1),(9,1,1,1),(10,1,3,1),
 (11,3,8,1),(11,3,10,2),(12,3,9,1),(13,3,8,1),(14,3,8,1),(15,3,9,1);

-- weekly availability in each player's local time (0 = Monday)
INSERT INTO availability (user_id, day_of_week, start_time, end_time) VALUES
 (1,0,'19:00','23:30'),(1,2,'19:00','23:30'),(1,4,'19:00','23:30'),(1,5,'14:00','23:59'),
 (2,1,'20:00','23:00'),(2,3,'20:00','23:00'),(2,4,'20:00','23:30'),(2,6,'15:00','22:00'),
 (3,5,'10:00','18:00'),(3,6,'10:00','18:00'),
 (4,4,'18:00','23:00'),(4,5,'12:00','20:00'),(4,6,'12:00','20:00'),
 (5,5,'16:00','22:00'),(5,6,'16:00','22:00'),
 (6,6,'10:00','16:00'),
 (7,1,'18:00','23:59'),(7,3,'18:00','23:59'),(7,5,'18:00','23:59'),
 (8,2,'20:00','23:59'),(8,4,'20:00','23:59'),(8,5,'20:00','23:59'),(8,6,'20:00','23:59'),
 (12,4,'19:00','23:30');

-- ============================================================ teams
INSERT INTO team (team_id, name, tag, owner_id, game_id, region_id, description) VALUES
 (1,'Mumbai Mavericks','MUMV',2,2,9,'Valorant 5-stack from AP-South'),
 (2,'Block Party','BLKP',4,1,12,'Chill EU Bedwars squad');
INSERT INTO team_member (team_id, user_id, team_role) VALUES
 (1,2,'owner'),(1,8,'captain'),(1,1,'member'),
 (2,4,'owner'),(2,3,'member'),(2,5,'member');

-- ============================================================ badges (awarded by triggers)
INSERT INTO badge (badge_id, name, description, criteria) VALUES
 (1,'Veteran','Completed 2 or more sessions','sessions_completed >= 2 (trg_session_au)'),
 (2,'Great Teammate','Rated 4.5+ by teammates','avg_rating >= 4.5 with 3+ reviews (sp_refresh_user_stats)'),
 (3,'Mentor','Hosts beginner-friendly sessions','awarded manually by moderators');

-- ============================================================ social graph (before blocks)
INSERT INTO friendship (requester_id, addressee_id, status) VALUES
 (1,8,'accepted'),(1,2,'accepted'),(2,8,'accepted'),(12,1,'accepted'),(3,4,'accepted'),
 (5,4,'pending'),(6,5,'accepted'),(7,8,'accepted'),(11,1,'declined');

-- ============================================================ sessions (all start open; triggers manage players/status)
INSERT INTO lfg_session (session_id, host_id, game_id, mode_id, platform_id, team_id, region_id, min_rank_id, max_rank_id,
                         title, description, max_players, scheduled_start, region_locked, voice_required,
                         visibility, join_policy, min_avg_rating, require_verified_discord) VALUES
 (1,1,2,5,6,NULL,9,8,10,'Comp grind Gold-Diamond, need a controller','Mumbai servers, mic on, no tilt.',5,'2026-10-30 14:30:00',TRUE,TRUE,'public','approval',NULL,FALSE),
 (2,4,1,1,1,2,12,NULL,NULL,'Bedwars 4s - chill EU evening','Java, Hypixel. Beginners welcome.',4,'2026-10-31 16:00:00',FALSE,FALSE,'public','auto',NULL,FALSE),
 (3,2,2,6,6,1,9,NULL,NULL,'Unrated warm-up','Quick warm-up before comp.',5,'2026-10-24 15:00:00',FALSE,TRUE,'public','approval',NULL,FALSE),
 (4,7,3,10,7,NULL,13,16,NULL,'Zero Build ranked push','Gold+ only, IGL on comms.',4,'2026-10-25 01:00:00',FALSE,TRUE,'public','approval',NULL,FALSE),
 (5,7,3,9,7,NULL,13,NULL,NULL,'Saturday squads','Just vibes.',4,'2026-11-01 02:00:00',FALSE,FALSE,'public','approval',NULL,FALSE),
 (6,6,1,4,3,NULL,11,NULL,NULL,'Bedrock survival world','Crossplay Xbox/PS/Switch.',6,'2026-10-25 11:00:00',FALSE,FALSE,'public','approval',NULL,FALSE),
 (7,3,1,3,1,NULL,10,NULL,NULL,'Duels practice JP/EU','First to 10.',2,'2026-10-28 09:00:00',FALSE,FALSE,'public','approval',NULL,FALSE),
 (8,8,2,7,6,NULL,9,NULL,NULL,'Spike Rush with friends','Friends only.',5,'2026-10-29 15:00:00',FALSE,FALSE,'friends','approval',NULL,FALSE),
 (9,11,2,6,6,NULL,13,NULL,NULL,'Late night unrated NA','',5,'2026-10-31 03:00:00',FALSE,FALSE,'public','auto',NULL,FALSE),
 (10,2,2,6,6,NULL,9,NULL,NULL,'Chill unrated, all ranks welcome','Practice comms.',5,'2026-10-31 10:30:00',FALSE,FALSE,'public','approval',3.50,FALSE);

INSERT INTO session_language (session_id, language_code) VALUES
 (1,'en'),(1,'hi'),(2,'en'),(2,'de'),(3,'en'),(3,'hi'),(4,'en'),(5,'en'),(6,'en'),(7,'en'),(7,'ja'),
 (8,'hi'),(8,'en'),(9,'en'),(10,'en'),(10,'hi');

INSERT INTO session_tag (session_id, tag_id) VALUES
 (1,2),(1,3),(2,1),(2,4),(3,1),(4,5),(4,3),(5,1),(6,1),(6,6),(7,2),(8,1),(9,5),(10,1),(10,4);

INSERT INTO session_slot (session_id, slot_no, game_id, game_role_id, slots_needed) VALUES
 (1,1,2,5,1),(1,2,2,7,1),(2,1,1,1,1),(4,1,3,9,1),(10,1,2,4,2);

-- participants (host rows are auto-accepted by trg_participant_bi)
INSERT INTO session_participant (session_id, user_id, game_role_id, platform_account_id, status) VALUES
 (1,1,4,1,'accepted'),(1,8,4,14,'accepted'),(1,2,5,4,'requested'),
 (2,4,2,7,'accepted'),(2,3,3,5,'requested'),                       -- auto join policy: Mei becomes accepted
 (3,2,5,4,'accepted'),(3,1,4,1,'accepted'),(3,8,4,14,'accepted'),(3,11,4,16,'accepted'),
 (4,7,10,12,'accepted'),(4,8,8,15,'accepted'),(4,1,9,3,'accepted'),(4,2,9,18,'accepted'),   -- 4/4 -> full
 (5,7,10,12,'accepted'),(5,1,9,3,'accepted'),(5,2,9,18,'accepted'),(5,8,8,15,'accepted'),   -- 4/4 -> full
 (6,6,3,10,'accepted'),(6,5,1,9,'accepted'),                       -- PlayStation joins Xbox host via bedrock crossplay
 (7,3,3,5,'accepted'),(7,4,2,7,'accepted'),                        -- 2/2 -> full
 (8,8,4,14,'accepted'),
 (9,11,4,16,'accepted'),
 (10,2,5,4,'accepted');

-- lifecycle transitions (fire audit + completion triggers)
UPDATE session_participant SET status = 'left' WHERE session_id = 6 AND user_id = 5;
UPDATE lfg_session SET status = 'cancelled'   WHERE session_id = 6;
UPDATE lfg_session SET status = 'in_progress' WHERE session_id IN (3, 4, 7);
UPDATE lfg_session SET status = 'completed'   WHERE session_id IN (3, 4);
UPDATE lfg_session SET discord_channel_id = '120000000000000007', discord_invite_url = 'https://discord.gg/example-duels'
 WHERE session_id = 7;

-- ============================================================ chat (after sessions exist)
INSERT INTO message (message_id, sender_id, session_id, receiver_id, content) VALUES
 (1,1,1,NULL,'Need a controller main, Gold+ only. Mic required.'),
 (2,8,1,NULL,'I can flex initiator if needed'),
 (3,2,3,NULL,'gg, warm-up done. Thanks all!'),
 (4,11,3,NULL,'you are all trash, uninstall the game'),
 (5,1,3,NULL,'Reported. Not okay.'),
 (6,1,NULL,8,'Queue comp later tonight?'),
 (7,8,NULL,1,'Yes, after 9 IST'),
 (8,4,NULL,3,'Duels at 18:00 JST?'),
 (9,3,7,NULL,'Ready when you are!');

-- ============================================================ reviews (only after completion; refresh ratings + badges)
INSERT INTO review (session_id, reviewer_id, reviewed_id, rating, comment_text) VALUES
 (3,1,2,5,'Great shotcalling'), (3,2,1,5,'Solid entry frags'), (3,8,2,4,NULL),
 (3,2,8,5,'Clutch king'), (3,1,8,5,NULL), (3,8,1,4,NULL),
 (3,1,11,1,'Toxic in voice, flamed the team'), (3,2,11,1,'Abusive chat'), (3,8,11,2,'Tilted after round 3'),
 (4,7,8,5,'Insane aim'), (4,8,7,5,'Best IGL'), (4,1,7,5,NULL), (4,7,1,4,'Good rotations'),
 (4,2,7,5,NULL), (4,7,2,4,NULL), (4,8,1,5,NULL), (4,1,8,5,NULL), (4,2,8,4,NULL);

-- ============================================================ blocks, reports, sanctions
INSERT INTO user_block (blocker_id, blocked_id, reason) VALUES
 (1,11,'Toxic in voice'), (2,11,'Harassment in chat');          -- also removes the 11->1 friendship row

INSERT INTO report (report_id, reporter_id, reported_user_id, session_id, message_id, category, description) VALUES
 (1,1,11,3,4,'harassment','Abusive chat after the match'),
 (2,2,11,3,NULL,'harassment','Flamed the whole team in voice');

UPDATE report SET status = 'reviewing', handled_by = 9 WHERE report_id IN (1, 2);
INSERT INTO sanction (user_id, sanction_type, reason, issued_by, report_id, starts_at, ends_at) VALUES
 (11,'warn','Flaming teammates in voice (report #2)',9,2,NOW(),NULL),
 (11,'suspend','Harassment in session chat (report #1)',9,1,NOW(),NOW() + INTERVAL 7 DAY);
UPDATE report SET status = 'actioned' WHERE report_id IN (1, 2);

-- ============================================================ matching demo
-- Kiara gets recommendations (logged), requests the top session, and the host accepts.
CALL sp_recommend_sessions(12, 5, TRUE);
CALL sp_recommend_sessions(5, 5, TRUE);
INSERT INTO session_participant (session_id, user_id, game_role_id, platform_account_id, status)
VALUES (1, 12, 5, 19, 'requested');
UPDATE match_recommendation SET outcome = 'requested' WHERE user_id = 12 AND session_id = 1;
CALL sp_accept_participant(1, 12, 1);
UPDATE match_recommendation SET outcome = 'joined' WHERE user_id = 12 AND session_id = 1;
