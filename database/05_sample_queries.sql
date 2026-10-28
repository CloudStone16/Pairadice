-- PairADice sample queries: joins, nested, correlated, recursive CTEs, windows, procedures.
-- Read-only (except the CALLs with p_log = FALSE, which also write nothing). Run after 03_seed.sql.
USE pairadice;

-- Q1 JOIN: open sessions with game, mode, host, region, languages and the roles they need
SELECT session_id, title, game, game_mode, host, region, CONCAT(current_players, '/', max_players) AS players,
       languages, tags, looking_for, min_rank, max_rank
FROM v_open_sessions ORDER BY scheduled_start;

-- Q2 JOIN: a session roster; gamertags only for accepted players
SELECT session_id, username, status, game_role, gamertag, identity_label
FROM v_session_roster WHERE session_id = 1 ORDER BY status, username;

-- Q3 JOIN (6 tables): every player's games with platform, gamertag label and rank
SELECT u.username, g.name AS game, pl.name AS platform, pl.identity_label, rt.name AS player_rank, p.hours_played
FROM player_game_profile p
JOIN users u            ON u.user_id = p.user_id
JOIN game g             ON g.game_id = p.game_id
LEFT JOIN platform_account pa ON pa.account_id = p.platform_account_id
LEFT JOIN platform pl   ON pl.platform_id = pa.platform_id
LEFT JOIN rank_tier rt  ON rt.rank_id = p.rank_id
ORDER BY g.name, rt.ordinal DESC;

-- Q4 NESTED (NOT IN): players who have never received a review below 4 stars (and have been reviewed)
SELECT username, avg_rating, review_count FROM users
WHERE review_count > 0
  AND user_id NOT IN (SELECT reviewed_id FROM review WHERE rating < 4);

-- Q5 NESTED (IN + aggregate): hosts whose sessions drew more players than the average session
SELECT u.username, s.title, s.current_players FROM lfg_session s JOIN users u ON u.user_id = s.host_id
WHERE s.current_players > (SELECT AVG(current_players) FROM lfg_session);

-- Q6 CORRELATED: each player's highest-ranked game (rank ordinal = max for that player)
SELECT DISTINCT u.username, g.name AS game, rt.name AS best_rank
FROM player_game_profile p
JOIN users u     ON u.user_id = p.user_id
JOIN game g      ON g.game_id = p.game_id
JOIN rank_tier rt ON rt.rank_id = p.rank_id
WHERE rt.ordinal / (SELECT MAX(ordinal) FROM rank_tier r2 WHERE r2.game_id = p.game_id)
    = (SELECT MAX(rt2.ordinal / (SELECT MAX(ordinal) FROM rank_tier r3 WHERE r3.game_id = p2.game_id))
         FROM player_game_profile p2 JOIN rank_tier rt2 ON rt2.rank_id = p2.rank_id
        WHERE p2.user_id = p.user_id);

-- Q7 CORRELATED (EXISTS): players who speak at least one language of every open session they could join
SELECT DISTINCT u.username, s.session_id, s.title
FROM users u JOIN lfg_session s ON s.status = 'open'
WHERE u.status = 'active'
  AND EXISTS (SELECT 1 FROM session_language sl JOIN user_language ul
                ON ul.language_code = sl.language_code
             WHERE sl.session_id = s.session_id AND ul.user_id = u.user_id)
  AND EXISTS (SELECT 1 FROM player_game_profile p WHERE p.user_id = u.user_id AND p.game_id = s.game_id)
  AND NOT EXISTS (SELECT 1 FROM session_participant sp WHERE sp.session_id = s.session_id AND sp.user_id = u.user_id)
ORDER BY s.session_id, u.username;

-- Q8 RECURSIVE CTE: the region tree with its full path and depth
WITH RECURSIVE tree AS (
  SELECT region_id, name, code, region_level, 0 AS depth, CAST(code AS CHAR(200)) AS path
    FROM geo_region WHERE parent_region_id IS NULL
  UNION ALL
  SELECT c.region_id, c.name, c.code, c.region_level, t.depth + 1, CONCAT(t.path, ' > ', c.code)
    FROM geo_region c JOIN tree t ON c.parent_region_id = t.region_id
)
SELECT CONCAT(REPEAT('    ', depth), name) AS region, region_level, path FROM tree ORDER BY path;

-- Q9 RECURSIVE CTE: every player whose home region is anywhere inside Asia
WITH RECURSIVE inside AS (
  SELECT region_id FROM geo_region WHERE code = 'ASIA'
  UNION ALL
  SELECT g.region_id FROM geo_region g JOIN inside i ON g.parent_region_id = i.region_id
)
SELECT u.username, r.code AS home_region
FROM users u JOIN geo_region r ON r.region_id = u.home_region_id
WHERE u.home_region_id IN (SELECT region_id FROM inside) ORDER BY u.username;

-- Q10 RECURSIVE CTE: friends and friends-of-friends of kiara_ctrl (degree 1 and 2)
WITH RECURSIVE edges AS (
  SELECT requester_id AS a, addressee_id AS b FROM friendship WHERE status = 'accepted'
  UNION ALL
  SELECT addressee_id, requester_id FROM friendship WHERE status = 'accepted'
),
reach AS (
  SELECT b AS user_id, 1 AS degree FROM edges WHERE a = (SELECT user_id FROM users WHERE username = 'kiara_ctrl')
  UNION ALL
  SELECT e.b, r.degree + 1 FROM reach r JOIN edges e ON e.a = r.user_id WHERE r.degree < 2
)
SELECT u.username, MIN(r.degree) AS degree
FROM reach r JOIN users u ON u.user_id = r.user_id
WHERE u.username <> 'kiara_ctrl'
GROUP BY u.username ORDER BY degree, u.username;

-- Q11 CTE + aggregate: average rating and review volume per game
WITH game_reviews AS (
  SELECT s.game_id, r.rating FROM review r JOIN lfg_session s ON s.session_id = r.session_id
)
SELECT g.name AS game, COUNT(*) AS reviews, ROUND(AVG(gr.rating), 2) AS avg_rating
FROM game_reviews gr JOIN game g ON g.game_id = gr.game_id GROUP BY g.name;

-- Q12 WINDOW: rank players by hours played within each game
SELECT g.name AS game, u.username, p.hours_played,
       RANK() OVER (PARTITION BY p.game_id ORDER BY p.hours_played DESC) AS hours_rank
FROM player_game_profile p JOIN users u ON u.user_id = p.user_id JOIN game g ON g.game_id = p.game_id;

-- Q13 GROUP BY + HAVING: modes with at least two sessions
SELECT g.name AS game, gm.name AS game_mode, COUNT(*) AS sessions
FROM lfg_session s JOIN game_mode gm ON gm.mode_id = s.mode_id JOIN game g ON g.game_id = s.game_id
GROUP BY g.name, gm.name HAVING COUNT(*) >= 2;

-- Q14 Trigger results: derived columns, badges and trust (all filled by triggers)
SELECT username, status, avg_rating, review_count, sessions_completed, trust_score, badges
FROM v_player_card ORDER BY trust_score DESC;

-- Q15 Audit trail written by triggers (no secrets inside)
SELECT log_id, actor_id, entity, entity_id, action, old_value, new_value FROM audit_log ORDER BY log_id;

-- Q16 RBAC in the database: what each role can do
SELECT r.role_name, GROUP_CONCAT(p.code ORDER BY p.permission_id) AS permissions
FROM role r JOIN role_permission rp ON rp.role_id = r.role_id JOIN permission p ON p.permission_id = rp.permission_id
GROUP BY r.role_id, r.role_name ORDER BY r.role_id;

-- Q17 Procedures: recommendations for a player, and best teammates for a host
CALL sp_recommend_sessions(1, 5, FALSE);   -- aarav_plays
CALL sp_recommend_players(10, 5);          -- priya_gg's session needs 2 duelists
CALL sp_recommend_players(2, 5);           -- lukas_mc's Bedwars session
