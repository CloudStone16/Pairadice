#!/usr/bin/env python3
"""Generate documents/pairadice_erd.drawio (Chen notation, one page per domain).

Edit the ENTITIES / RELS / PAGES tables below, then run:

    python3 documents/tools/gen_erd.py            # writes documents/pairadice_erd.drawio + layout report
    python3 documents/tools/gen_erd.py --check    # layout report only

Attribute prefixes:  *key  !partial-key(weak)  ~derived  +multivalued
Foreign keys are NOT drawn as attributes (Chen draws them as relationships);
they are listed in documents/ER_DESIGN.md.
"""
import math
import os
import re
import sys
from xml.sax.saxutils import escape



def esc(v):
    return escape(v, {'"': "&quot;"})


HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "pairadice_erd.drawio")
SCHEMA_SQL = os.path.join(HERE, "..", "..", "database", "01_schema.sql")   # source for page 9

# ---------------------------------------------------------------- domains
DOMAINS = {
    "identity":   ("Identity & Access",      "#dae8fc", "#6c8ebf"),
    "locale":     ("Language & Region",      "#e1d5e7", "#9673a6"),
    "games":      ("Game Catalog",           "#ffe6cc", "#d79b00"),
    "profile":    ("Player Profile",         "#d5e8d4", "#82b366"),
    "sessions":   ("Sessions & Matching",    "#b0e3e6", "#0e8088"),
    "social":     ("Social & Trust",         "#f8cecc", "#b85450"),
    "moderation": ("Moderation & Audit",     "#e6e6e6", "#36393d"),
    "vector":     ("Vector Store (MongoDB)", "#ffffff", "#2e8b57"),
}
REL_FILL, REL_STROKE = "#fff2cc", "#d6b656"
ATTR_FILL, ATTR_STROKE = "#f5f5f5", "#666666"
TYPE_COLOR = {"1:1": "#2e8b57", "1:N": "#1a5fb4", "M:N": "#c01c28"}


def rel_type(r):
    cards = [p[1] for p in r["parts"]]
    if "1" not in cards:
        return "M:N"
    if all(c == "1" for c in cards):
        return "1:1"
    return "1:N"

# --------------------------------------------------------------- entities
ENTITIES = {}


def ent(name, domain, attrs, weak=False, ext=False):
    ENTITIES[name] = dict(domain=domain, attrs=attrs, weak=weak, ext=ext)


# identity
ent("USER", "identity", [
    "*user_id", "username", "display_name", "avatar_url", "bio", "status",
    "timezone", "region_strictness", "created_at", "last_active_at",
    "~avg_rating", "~review_count", "~sessions_completed", "~trust_score"])
ent("AUTH_ACCOUNT", "identity", [
    "*auth_id", "provider", "provider_user_id", "email", "password_hash",
    "email_verified", "created_at"])
ent("AUTH_TOKEN", "identity", [
    "*token_id", "token_hash", "expires_at", "revoked_at", "user_agent"])
ent("ROLE", "identity", ["*role_id", "role_name", "description"])
ent("PERMISSION", "identity", ["*permission_id", "code", "description"])
# locale
ent("LANGUAGE", "locale", ["*language_code", "name", "native_name"])
ent("GEO_REGION", "locale", ["*region_id", "name", "code", "level"])
ent("COUNTRY", "locale", ["*country_code", "name"])
# games
ent("GAME", "games", [
    "*game_id", "name", "slug", "developer", "publisher", "cover_url",
    "release_year", "description", "is_active"])
ent("GENRE", "games", ["*genre_id", "name"])
ent("PLATFORM", "games", ["*platform_id", "name", "platform_type", "identity_label"])
ent("GAME_MODE", "games", [
    "*mode_id", "name", "min_team_size", "max_team_size", "is_ranked", "description"])
ent("RANK_TIER", "games", ["*rank_id", "name", "ordinal"])
ent("GAME_ROLE", "games", ["*game_role_id", "name"])
# profile
ent("PLATFORM_ACCOUNT", "profile", [
    "*account_id", "handle", "discriminator", "is_verified", "is_public"])
ent("PLAYER_GAME_PROFILE", "profile", [
    "*profile_id", "in_game_name", "hours_played", "is_main"])
ent("TAG", "profile", ["*tag_id", "name", "category"])
ent("AVAILABILITY", "profile", [
    "!day_of_week", "!start_time", "end_time"], weak=True)
# sessions
ent("LFG_SESSION", "sessions", [
    "*session_id", "title", "description", "status", "max_players",
    "~current_players", "scheduled_start", "created_at", "region_locked",
    "voice_required", "visibility", "join_policy", "min_avg_rating",
    "require_verified_discord", "discord_channel_id", "discord_invite_url"])
ent("SESSION_SLOT", "sessions", ["!slot_no", "slots_needed"], weak=True)
ent("SESSION_PARTICIPANT", "sessions", [
    "!user_id", "status", "joined_at", "left_at"], weak=True)
ent("MATCH_RECOMMENDATION", "sessions", [
    "*rec_id", "score", "score_breakdown", "source", "shown_at", "outcome"])
ent("TEAM", "social", ["*team_id", "name", "tag", "description", "created_at"])
# social
ent("MESSAGE", "social", [
    "*message_id", "content", "sent_at", "edited_at", "is_deleted"])
ent("REVIEW", "social", [
    "!reviewer_id", "!reviewed_id", "rating", "comment", "created_at"], weak=True)
ent("BADGE", "social", ["*badge_id", "name", "description", "criteria"])
# moderation
ent("REPORT", "moderation", [
    "*report_id", "category", "description", "status", "created_at", "resolved_at"])
ent("SANCTION", "moderation", [
    "*sanction_id", "type", "reason", "starts_at", "ends_at"])
ent("AUDIT_LOG", "moderation", [
    "*log_id", "entity", "entity_id", "action", "old_value", "new_value", "logged_at"])
# vector (external, MongoDB)
ent("PLAYER_EMBEDDING", "vector", [
    "*user_id", "embedding", "source_text", "model", "updated_at",
    "+game_ids", "+language_codes", "region_id"], ext=True)
ent("SESSION_EMBEDDING", "vector", [
    "*session_id", "embedding", "source_text", "model", "updated_at",
    "game_id", "region_id", "+language_codes", "status"], ext=True)

# ---------------------------------------------------------- relationships
RELS = {}
T = True  # total participation


def rel(name, *parts, attrs=(), ident=False, ext=False):
    """parts: (entity, cardinality, total?, role?)"""
    norm = []
    for p in parts:
        e, card = p[0], p[1]
        total = p[2] if len(p) > 2 else False
        role = p[3] if len(p) > 3 else ""
        norm.append((e, card, total, role))
    RELS[name] = dict(parts=norm, attrs=list(attrs), ident=ident, ext=ext)


# identity
rel("HAS_LOGIN", ("USER", "1"), ("AUTH_ACCOUNT", "N", T))
rel("HAS_TOKEN", ("USER", "1"), ("AUTH_TOKEN", "N", T))
rel("HAS_ROLE", ("USER", "M", T), ("ROLE", "N"), attrs=["assigned_at", "assigned_by"])
rel("GRANTS", ("ROLE", "M"), ("PERMISSION", "N"))
# locale
rel("SPEAKS", ("USER", "M"), ("LANGUAGE", "N"), attrs=["proficiency", "is_preferred"])
rel("LIVES_IN", ("USER", "N"), ("COUNTRY", "1"))
rel("PREFERS_REGION", ("USER", "N"), ("GEO_REGION", "1"))
rel("PARENT_OF", ("GEO_REGION", "1", False, "parent"), ("GEO_REGION", "N", False, "child"))
rel("CONTAINS", ("GEO_REGION", "1"), ("COUNTRY", "N", T))
rel("HAS_SERVER_IN", ("GAME", "M"), ("GEO_REGION", "N"), attrs=["server_name"])
rel("CONDUCTED_IN", ("LFG_SESSION", "M"), ("LANGUAGE", "N"))
rel("LOCATED_IN", ("LFG_SESSION", "N"), ("GEO_REGION", "1"))
# games
rel("HAS_GENRE", ("GAME", "M"), ("GENRE", "N"))
rel("AVAILABLE_ON", ("GAME", "M"), ("PLATFORM", "N"), attrs=["crossplay_group"])
rel("HAS_MODE", ("GAME", "1"), ("GAME_MODE", "N", T))
rel("HAS_RANK_TIER", ("GAME", "1"), ("RANK_TIER", "N", T))
rel("OFFERS_ROLE", ("GAME", "1"), ("GAME_ROLE", "N", T))
# profile
rel("OWNS_ACCOUNT", ("USER", "1"), ("PLATFORM_ACCOUNT", "N", T))
rel("ACCOUNT_ON", ("PLATFORM_ACCOUNT", "N", T), ("PLATFORM", "1"))
rel("HAS_PROFILE", ("USER", "1"), ("PLAYER_GAME_PROFILE", "N", T))
rel("PROFILE_OF", ("PLAYER_GAME_PROFILE", "N", T), ("GAME", "1"))
rel("PLAYS_UNDER", ("PLAYER_GAME_PROFILE", "N"), ("PLATFORM_ACCOUNT", "1"))
rel("RANKED_AT", ("PLAYER_GAME_PROFILE", "N"), ("RANK_TIER", "1"))
rel("PREFERS_MODE", ("PLAYER_GAME_PROFILE", "M"), ("GAME_MODE", "N"),
    attrs=["is_preferred", "rank_id"])
rel("PREFERS_ROLE", ("PLAYER_GAME_PROFILE", "M"), ("GAME_ROLE", "N"),
    attrs=["preference_order"])
rel("LIKES_TAG", ("USER", "M"), ("TAG", "N"))
rel("AVAILABLE_AT", ("USER", "1"), ("AVAILABILITY", "N", T), ident=True)
# sessions
rel("HOSTS", ("USER", "1"), ("LFG_SESSION", "N", T))
rel("FOR_MODE", ("LFG_SESSION", "N", T), ("GAME_MODE", "1"))
rel("RANK_RANGE", ("LFG_SESSION", "N"), ("RANK_TIER", "1", False, "min"),
    ("RANK_TIER", "1", False, "max"))
rel("NEEDS_SLOT", ("LFG_SESSION", "1"), ("SESSION_SLOT", "N", T), ident=True)
rel("SLOT_FOR_ROLE", ("SESSION_SLOT", "N"), ("GAME_ROLE", "1"))
rel("HAS_PARTICIPANT", ("LFG_SESSION", "1"), ("SESSION_PARTICIPANT", "N", T), ident=True)
rel("PARTICIPATES_AS", ("USER", "1"), ("SESSION_PARTICIPANT", "N", T))
rel("SESSION_TAGGED", ("LFG_SESSION", "M"), ("TAG", "N"))
rel("RUN_BY_TEAM", ("TEAM", "1"), ("LFG_SESSION", "N"))
rel("RECOMMENDS", ("LFG_SESSION", "1"), ("MATCH_RECOMMENDATION", "N", T))
rel("RECEIVES", ("USER", "1"), ("MATCH_RECOMMENDATION", "N", T))
# social
rel("FRIENDS_WITH", ("USER", "M", False, "requester"), ("USER", "N", False, "addressee"),
    attrs=["status", "created_at"])
rel("SENDS", ("USER", "1"), ("MESSAGE", "N", T))
rel("POSTED_IN", ("LFG_SESSION", "1"), ("MESSAGE", "N"))
rel("DIRECT_TO", ("USER", "1", False, "receiver"), ("MESSAGE", "N"))
rel("GENERATES", ("LFG_SESSION", "1"), ("REVIEW", "N", T), ident=True)
rel("WRITES", ("USER", "1", False, "reviewer"), ("REVIEW", "N", T))
rel("ABOUT", ("USER", "1", False, "reviewed"), ("REVIEW", "N", T))
rel("EARNS", ("USER", "M"), ("BADGE", "N"), attrs=["awarded_at"])
rel("MEMBER_OF", ("USER", "M"), ("TEAM", "N"), attrs=["team_role", "joined_at"])
rel("OWNS_TEAM", ("USER", "1"), ("TEAM", "N", T))
# moderation
rel("FILES", ("USER", "1", False, "reporter"), ("REPORT", "N", T))
rel("TARGETS", ("USER", "1", False, "reported"), ("REPORT", "N", T))
rel("HANDLES", ("USER", "1", False, "moderator"), ("REPORT", "N"))
rel("ABOUT_SESSION", ("LFG_SESSION", "1"), ("REPORT", "N"))
rel("ABOUT_MESSAGE", ("MESSAGE", "1"), ("REPORT", "N"))
rel("RESULTS_IN", ("REPORT", "1"), ("SANCTION", "N"))
rel("RECEIVES_SANCTION", ("USER", "1"), ("SANCTION", "N", T))
rel("ISSUES", ("USER", "1", False, "moderator"), ("SANCTION", "N", T))
rel("BLOCKS", ("USER", "M", False, "blocker"), ("USER", "N", False, "blocked"),
    attrs=["created_at"])
rel("LOGS", ("USER", "1", False, "actor"), ("AUDIT_LOG", "N"))
# vector (logical link by id only)
rel("HAS_PLAYER_EMBEDDING", ("USER", "1"), ("PLAYER_EMBEDDING", "1"), ext=True)
rel("HAS_SESSION_EMBEDDING", ("LFG_SESSION", "1"), ("SESSION_EMBEDDING", "1"), ext=True)

# ------------------------------------------------------------------ pages
# detail page: ents = [(name, col, row, ghost_attrs_or_None)]  (None = show all attrs)
# rels = [name | (name, {"off": (dx, dy)})]
PAGES = [
    dict(
        key="overview", name="0 Big Picture", kind="overview",
        title="PairADice - Big Picture",
        sub="Every entity grouped by area; lines show how areas connect (name and 1:N / M:N). Numbered pages show attributes and keys.",
        lane=(900, 700, 90), legend=False,
        lanes={  # domain: (col, row)
            "locale": (0, 0), "games": (1, 0), "profile": (2, 0),
            "identity": (1, 1), "sessions": (2, 1),
            "moderation": (0, 2), "social": (1, 2), "vector": (2, 2),
        },
        pos={  # entity: (x, y) relative to its area's top-left corner
            "GEO_REGION": (300, 250), "COUNTRY": (700, 330), "LANGUAGE": (620, 590),
            "GAME": (450, 330), "RANK_TIER": (130, 120), "GAME_ROLE": (450, 100),
            "GAME_MODE": (780, 560), "PLATFORM": (780, 140), "GENRE": (130, 570),
            "PLATFORM_ACCOUNT": (200, 130), "PLAYER_GAME_PROFILE": (200, 360),
            "TAG": (790, 610), "AVAILABILITY": (790, 480),
            "USER": (450, 330), "AUTH_ACCOUNT": (110, 190), "AUTH_TOKEN": (110, 470),
            "ROLE": (800, 90), "PERMISSION": (450, 100),
            "LFG_SESSION": (150, 230), "SESSION_PARTICIPANT": (520, 330),
            "SESSION_SLOT": (610, 130), "MATCH_RECOMMENDATION": (610, 560),
            "REPORT": (760, 130), "AUDIT_LOG": (760, 420), "SANCTION": (400, 430),
            "BADGE": (110, 130), "MESSAGE": (350, 130), "REVIEW": (590, 130),
            "TEAM": (840, 300),
            "PLAYER_EMBEDDING": (160, 160), "SESSION_EMBEDDING": (560, 160),
        },
        rels=[
            "HAS_LOGIN", "HAS_TOKEN", "HAS_ROLE", "GRANTS",
            "SPEAKS", "LIVES_IN", "CONTAINS", "HAS_MODE", "HAS_RANK_TIER", "OFFERS_ROLE",
            "HAS_GENRE", "AVAILABLE_ON", "OWNS_ACCOUNT", "ACCOUNT_ON", "HAS_PROFILE",
            "PROFILE_OF", "LIKES_TAG", "AVAILABLE_AT", "HOSTS", "FOR_MODE",
            "NEEDS_SLOT", "HAS_PARTICIPANT", "PARTICIPATES_AS", "RECOMMENDS",
            "RUN_BY_TEAM", ("FRIENDS_WITH", {"off": (0, -130)}), "SENDS", "POSTED_IN",
            "GENERATES", "WRITES", "EARNS", "MEMBER_OF", "FILES", "RESULTS_IN", "LOGS",
            "HAS_PLAYER_EMBEDDING", "HAS_SESSION_EMBEDDING",
        ],
    ),
    dict(
        key="identity", name="1 Identity & Access", cw=900, rh=720,
        title="1 - Identity & Access",
        sub="Who can log in (Discord or email) and what they are allowed to do (roles + permissions).",
        ents=[("USER", 1, 1, None), ("AUTH_ACCOUNT", 0, 0, None), ("AUTH_TOKEN", 2, 0, None),
              ("ROLE", 0, 2, None), ("PERMISSION", 2, 2, None)],
        rels=["HAS_LOGIN", "HAS_TOKEN", "HAS_ROLE", "GRANTS"],
    ),
    dict(
        key="locale", name="2 Language & Region", cw=900, rh=800,
        title="2 - Language & Region",
        sub="Players and sessions are matched by shared language and region. Regions form a tree (continent > sub-region).",
        ents=[("USER", 0, 0, ["*user_id", "timezone", "region_strictness"]),
              ("COUNTRY", 1, 0, None), ("GEO_REGION", 1, 1, None),
              ("LANGUAGE", 0, 1, None),
              ("LFG_SESSION", 0, 2, ["*session_id", "region_locked"]),
              ("GAME", 2, 1, ["*game_id", "name"])],
        rels=["SPEAKS", "LIVES_IN", "PREFERS_REGION", "CONTAINS",
              ("PARENT_OF", {"off": (330, 190)}), "HAS_SERVER_IN",
              "CONDUCTED_IN", "LOCATED_IN"],
    ),
    dict(
        key="games", name="3 Game Catalog", cw=900, rh=800,
        title="3 - Game Catalog",
        sub="A game has many modes (Bedwars, Duels...), rank tiers and roles. Platforms say where it can be played.",
        ents=[("GAME", 1, 1, None), ("GENRE", 0, 0, None), ("PLATFORM", 2, 0, None),
              ("GAME_MODE", 0, 2, None), ("RANK_TIER", 1, 2, None), ("GAME_ROLE", 2, 2, None)],
        rels=["HAS_GENRE", "AVAILABLE_ON", "HAS_MODE", "HAS_RANK_TIER", "OFFERS_ROLE"],
    ),
    dict(
        key="profile", name="4 Player Profile", cw=900, rh=800,
        title="4 - Player Profile",
        sub="Gamertags per platform, what each player plays and at what rank, playstyle tags, weekly availability.",
        ents=[("TAG", 2, 0, None), ("USER", 2, 1, ["*user_id"]),
              ("PLATFORM_ACCOUNT", 1, 1, None),
              ("PLATFORM", 0, 1, ["*platform_id", "name", "identity_label"]),
              ("AVAILABILITY", 3, 1, None), ("PLAYER_GAME_PROFILE", 2, 2, None),
              ("GAME", 1, 2, ["*game_id", "name"]), ("RANK_TIER", 2, 3, ["*rank_id", "name"]),
              ("GAME_MODE", 3, 3, ["*mode_id", "name"]),
              ("GAME_ROLE", 1, 3, ["*game_role_id", "name"])],
        rels=["OWNS_ACCOUNT", "ACCOUNT_ON", "HAS_PROFILE", "PROFILE_OF", "PLAYS_UNDER",
              "RANKED_AT", "PREFERS_MODE", "PREFERS_ROLE", "LIKES_TAG", "AVAILABLE_AT"],
    ),
    dict(
        key="sessions", name="5 Sessions & Matching", cw=1150, rh=1050,
        title="5 - Sessions & Matching",
        sub="A host creates a session for a game mode; role slots and participants fill it; recommendations are logged.",
        ents=[("LFG_SESSION", 1, 1, None), ("TEAM", 0, 0, None),
              ("GAME_MODE", 1, 0, ["*mode_id", "name"]), ("RANK_TIER", 2, 0, ["*rank_id", "name"]),
              ("TAG", 0, 1, ["*tag_id", "name"]), ("MATCH_RECOMMENDATION", 2, 1, None),
              ("USER", 2, 2, ["*user_id"]), ("SESSION_PARTICIPANT", 1, 2, None),
              ("SESSION_SLOT", 0, 2, None), ("GAME_ROLE", 0, 3, ["*game_role_id", "name"])],
        rels=["HOSTS", "FOR_MODE", "RANK_RANGE", "NEEDS_SLOT", "SLOT_FOR_ROLE",
              "HAS_PARTICIPANT", "PARTICIPATES_AS", "SESSION_TAGGED", "RUN_BY_TEAM",
              "RECOMMENDS", "RECEIVES"],
    ),
    dict(
        key="social", name="6 Social & Trust", cw=950, rh=820,
        title="6 - Social & Trust",
        sub="Friends, chat, reviews after a game, badges earned from good play, and persistent teams.",
        ents=[("LFG_SESSION", 1, 0, ["*session_id", "title"]), ("MESSAGE", 0, 0, None),
              ("REVIEW", 2, 0, None), ("USER", 1, 1, ["*user_id", "username"]),
              ("BADGE", 0, 2, None), ("TEAM", 2, 2, None)],
        rels=["SENDS", "POSTED_IN", "DIRECT_TO", "GENERATES", "WRITES", "ABOUT",
              "EARNS", "MEMBER_OF", "OWNS_TEAM",
              ("FRIENDS_WITH", {"off": (0, 330)})],
    ),
    dict(
        key="moderation", name="7 Moderation & Audit", cw=950, rh=850,
        title="7 - Moderation & Audit",
        sub="Block, report, sanction. Every sensitive change is written to the audit log by triggers.",
        ents=[("USER", 1, 1, ["*user_id", "username"]), ("REPORT", 2, 1, None),
              ("LFG_SESSION", 2, 0, ["*session_id", "title"]),
              ("MESSAGE", 3, 1, ["*message_id"]), ("SANCTION", 2, 3, None),
              ("AUDIT_LOG", 0, 3, None)],
        rels=["FILES", "TARGETS", "HANDLES", "ABOUT_SESSION", "ABOUT_MESSAGE",
              "RESULTS_IN", "RECEIVES_SANCTION", "ISSUES", "LOGS",
              ("BLOCKS", {"off": (-330, -220)})],
    ),
    dict(
        key="vector", name="8 Vector Store (MongoDB)", cw=1000, rh=800,
        title="8 - Vector Store (MongoDB, outside the SQL database)",
        sub="Embeddings live in MongoDB and link back to SQL rows by id only. Payload fields allow filtered similarity search.",
        ents=[("USER", 0, 0, ["*user_id"]), ("PLAYER_EMBEDDING", 1, 0, None),
              ("LFG_SESSION", 0, 1, ["*session_id"]), ("SESSION_EMBEDDING", 1, 1, None)],
        rels=["HAS_PLAYER_EMBEDDING", "HAS_SESSION_EMBEDDING"],
    ),
    dict(
        key="relational", name="9 Relational Schema", kind="relational", legend=False,
        title="9 - Relational Schema (MySQL tables)",
        sub="44 tables, read straight from database/01_schema.sql. PK = primary key (underlined), FK = foreign key (-> referenced table).",
        note="Crow's-foot lines = foreign keys inside an area: the many end sits on the child table, the bar end on the parent "
             "(a circle means the FK column is optional). FKs that point to another area are shown only as '-> table' in the column list.",
    ),
]

# table -> area, for the relational page
TABLE_DOMAIN = {
    "language": "locale", "geo_region": "locale", "country": "locale",
    "users": "identity", "auth_account": "identity", "auth_token": "identity", "role": "identity",
    "permission": "identity", "role_permission": "identity", "user_role": "identity", "user_language": "identity",
    "game": "games", "genre": "games", "game_genre": "games", "platform": "games", "game_platform": "games",
    "game_mode": "games", "rank_tier": "games", "game_role": "games", "game_server": "games",
    "tag": "profile", "user_tag": "profile", "platform_account": "profile", "player_game_profile": "profile",
    "profile_mode": "profile", "profile_role": "profile", "availability": "profile",
    "lfg_session": "sessions", "session_language": "sessions", "session_tag": "sessions", "session_slot": "sessions",
    "session_participant": "sessions", "match_recommendation": "sessions",
    "team": "social", "team_member": "social", "friendship": "social", "message": "social", "review": "social",
    "badge": "social", "user_badge": "social",
    "user_block": "moderation", "report": "moderation", "sanction": "moderation", "audit_log": "moderation",
}

# ----------------------------------------------------------------- model


class Shape:
    def __init__(self, sid, kind, cx, cy, w, h, label, style, owner=None, z=1):
        self.id, self.kind, self.cx, self.cy, self.w, self.h = sid, kind, cx, cy, w, h
        self.label, self.style, self.owner, self.z = label, style, owner, z
        self.inner = None  # (w, h) for the double-border trick
        self.ghost_attrs = None


class Edge:
    def __init__(self, eid, a, b, label, style, points=(), lpos=-0.5):
        self.id, self.a, self.b, self.label, self.style = eid, a, b, label, style
        self.points, self.lpos = list(points), lpos
        self.children = []  # (html value, style, x along edge)


class Page:
    def __init__(self, spec, idx):
        self.spec, self.idx = spec, idx
        self.shapes, self.edges, self.n = [], [], 0

    def nid(self):
        self.n += 1
        return f"p{self.idx}_{self.n}"

    def add(self, *a, **k):
        s = Shape(self.nid(), *a, **k)
        self.shapes.append(s)
        return s

    def edge(self, a, b, label="", style="", points=(), lpos=-0.5):
        e = Edge(self.nid(), a, b, label, style, points, lpos)
        self.edges.append(e)
        return e


def ang_diff(a, b):
    d = abs((a - b) % (2 * math.pi))
    return min(d, 2 * math.pi - d)


def ring_slots(cx, cy, n, r0, blocked, sp, gap):
    """One ring only: grow the radius until n free slots exist, then pick n evenly."""
    if n == 0:
        return []
    r = r0
    while True:
        cap = max(6, int(2 * math.pi * r / sp))
        slots = [i * 2 * math.pi / cap for i in range(cap)]
        slots = [a for a in slots if all(ang_diff(a, b) > gap for b in blocked)]
        if len(slots) >= n:
            break
        r += 15
    chosen = [slots[int((i + 0.5) * len(slots) / n)] for i in range(n)]
    chosen.sort(key=lambda a: (a + math.pi / 2) % (2 * math.pi))
    return [(cx + r * math.cos(a), cy + r * math.sin(a), r) for a in chosen]


def attr_style(spec):
    flag = spec[0] if spec[0] in "*!~+" else ""
    fs = {"*": 4, "!": 6}.get(flag, 0)
    shape = "shape=doubleEllipse;" if flag == "+" else ""
    st = (f"ellipse;{shape}whiteSpace=wrap;html=1;fillColor={ATTR_FILL};strokeColor={ATTR_STROKE};"
          f"fontSize=11;fontStyle={fs};")
    if flag == "~":
        st += "dashed=1;"
    return spec.lstrip("*!~+"), st


def attr_size(label):
    return max(86, min(190, 7 * len(label) + 28)), 36


def ent_size(name):
    return max(150, min(270, 11 * len(name) + 40)), 58


def rel_size(name):
    return max(140, min(250, 10 * len(name) + 50)), 100


def add_entity(pg, name, cx, cy, ghost):
    e = ENTITIES[name]
    _, fill, stroke = DOMAINS[e["domain"]]
    w, h = ent_size(name)
    st = (f"rounded=0;whiteSpace=wrap;html=1;fillColor={fill};strokeColor={stroke};"
          "fontStyle=1;fontSize=14;")
    if e["ext"]:
        st += "dashed=1;strokeWidth=2;"
    if ghost:
        st = (f"rounded=0;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor={stroke};"
              "dashed=1;fontStyle=1;fontSize=14;fontColor=#777777;")
    s = pg.add("entity", cx, cy, w, h, name, st, z=3)
    if e["weak"] and not ghost:
        s.inner = (w - 12, h - 12)
    return s


def rel_centres(rel_items, ents, default_off):
    groups = {}
    for rname, _ in rel_items:
        groups.setdefault(frozenset(p[0] for p in RELS[rname]["parts"]), []).append(rname)
    ovs = dict(rel_items)
    centres = {}
    for names in groups.values():
        for i, rname in enumerate(names):
            ov = ovs[rname]
            uniq = list(dict.fromkeys(p[0] for p in RELS[rname]["parts"]))
            if len(uniq) == 1:
                e = ents[uniq[0]]
                dx, dy = ov.get("off", default_off)
                centres[rname] = (e.cx + dx, e.cy + dy)
                continue
            mx = sum(ents[u].cx for u in uniq) / len(uniq)
            my = sum(ents[u].cy for u in uniq) / len(uniq)
            if len(uniq) == 2:
                a, b = ents[uniq[0]], ents[uniq[1]]
                L = math.hypot(b.cx - a.cx, b.cy - a.cy) or 1
                px, py = -(b.cy - a.cy) / L, (b.cx - a.cx) / L
                wide = any(RELS[n]["attrs"] for n in names)
                sp = (i - (len(names) - 1) / 2) * ov.get("spread", 340 if wide else 220)
                mx, my = mx + px * sp, my + py * sp
            dx, dy = ov.get("off", (0, 0))
            centres[rname] = (mx + dx, my + dy)
    return centres


def rel_edges(pg, rname, s, ents, fs, lpos):
    r = RELS[rname]
    col = TYPE_COLOR[rel_type(r)]
    seen = {}
    for en, card, total, role in r["parts"]:
        e = ents[en]
        seen[en] = seen.get(en, 0) + 1
        label = f"<b>{card}</b>"
        if role:
            label += f'<br><i style="font-size:10px;color:#555555">({role})</i>'
        st = (f"endArrow=none;html=1;rounded=0;strokeColor={col};fontSize=17;fontColor={col};"
              "labelBackgroundColor=#ffffff;")
        if r["ext"]:
            st += "dashed=1;"
        st += "shape=link;width=5;" if total else "strokeWidth=2;"
        pts = []
        if sum(1 for p in r["parts"] if p[0] == en) > 1:  # two lines to same entity: bend apart
            mx, my = (e.cx + s.cx) / 2, (e.cy + s.cy) / 2
            L = math.hypot(s.cx - e.cx, s.cy - e.cy) or 1
            px, py = -(s.cy - e.cy) / L, (s.cx - e.cx) / L
            sign = 1 if seen[en] == 1 else -1
            pts = [(mx + px * 90 * sign, my + py * 90 * sign)]
            st += "curved=1;"
        pg.edge(e, s, label, st, pts, lpos=-0.6)


def rel_label(rname, size=11):
    t = rel_type(RELS[rname])
    return (f'{rname}<br><span style="font-size:{size}px;color:{TYPE_COLOR[t]}">'
            f'<b>{t.replace(":", " : ")}</b></span>')


def build_detail(spec, idx):
    pg = Page(spec, idx)
    cw, rh = spec["cw"], spec["rh"]
    ents = {}
    for name, col, row, ghost_attrs in spec["ents"]:
        s = add_entity(pg, name, col * cw + cw / 2, row * rh + rh / 2, ghost_attrs is not None)
        s.ghost_attrs = ghost_attrs
        ents[name] = s
    rel_items = [(r, {}) if isinstance(r, str) else r for r in spec["rels"]]
    centres = rel_centres(rel_items, ents, (0, -300))

    rel_shapes = {}
    for rname, _ in rel_items:
        r = RELS[rname]
        w, h = rel_size(rname)
        cx, cy = centres[rname]
        st = (f"rhombus;whiteSpace=wrap;html=1;fillColor={REL_FILL};strokeColor={REL_STROKE};"
              "fontSize=12;fontStyle=1;")
        if r["ext"]:
            st += "dashed=1;"
        s = pg.add("rel", cx, cy, w, h, rel_label(rname, 13), st, z=3)
        if r["ident"]:
            s.inner = (w - 18, h - 12)
        rel_shapes[rname] = s

    for name, e in ents.items():
        attrs = e.ghost_attrs if e.ghost_attrs is not None else ENTITIES[name]["attrs"]
        blocked = [math.atan2(rel_shapes[rn].cy - e.cy, rel_shapes[rn].cx - e.cx)
                   for rn, _ in rel_items if any(p[0] == name for p in RELS[rn]["parts"])]
        r0 = e.w / 2 + 95
        sp = max(125, sum(attr_size(a.lstrip("*!~+"))[0] for a in attrs) / max(1, len(attrs)) + 28)
        for a, (x, y, _) in zip(attrs, ring_slots(e.cx, e.cy, len(attrs), r0, blocked, sp, 0.27)):
            lab, st = attr_style(a)
            w, h = attr_size(lab)
            s = pg.add("attr", x, y, w, h, lab, st, owner=e, z=2)
            pg.edge(e, s, "", "endArrow=none;html=1;strokeColor=#999999;strokeWidth=1;", lpos=0)

    for rname, s in rel_shapes.items():
        attrs = RELS[rname]["attrs"]
        if not attrs:
            continue
        blocked = [math.atan2(ents[p[0]].cy - s.cy, ents[p[0]].cx - s.cx) for p in RELS[rname]["parts"]]
        for a, (x, y, _) in zip(attrs, ring_slots(s.cx, s.cy, len(attrs),
                                                 max(s.w, s.h) / 2 + 70, blocked, 120, 0.55)):
            lab, st = attr_style(a)
            w, h = attr_size(lab)
            at = pg.add("attr", x, y, w, h, lab, st, owner=s, z=2)
            pg.edge(s, at, "", "endArrow=none;html=1;strokeColor=#999999;strokeWidth=1;", lpos=0)

    for rname, _ in rel_items:
        rel_edges(pg, rname, rel_shapes[rname], ents, 12, -0.55)
    return pg


def build_overview(spec, idx):
    """Map view: entities in colour-coded areas, relationships as labelled lines (name + cardinality)."""
    pg = Page(spec, idx)
    LW, LH, GAP = spec.get("lane", (900, 700, 90))
    lane_origin, ents = {}, {}
    for dom, (c, r) in spec["lanes"].items():
        ox, oy = c * (LW + GAP), r * (LH + GAP)
        lane_origin[dom] = (ox, oy)
        title, fill, stroke = DOMAINS[dom]
        pg.add("lane", ox + LW / 2, oy + LH / 2, LW, LH, title,
               f"rounded=1;arcSize=3;whiteSpace=wrap;html=1;fillColor={fill};strokeColor={stroke};"
               f"fillOpacity=45;strokeWidth=2;verticalAlign=top;fontStyle=1;fontSize=20;"
               f"fontColor={stroke};", z=0)
    for name, (x, y) in spec["pos"].items():
        ox, oy = lane_origin[ENTITIES[name]["domain"]]
        ents[name] = add_entity(pg, name, ox + x, oy + y, False)
    for rn in spec["rels"]:
        rname, ov = (rn, {}) if isinstance(rn, str) else rn
        r = RELS[rname]
        a_name, b_name = r["parts"][0][0], r["parts"][1][0]
        t = rel_type(r)
        col = TYPE_COLOR[t]
        title = rname.lower().replace("_", " ")
        st = (f"endArrow=none;html=1;rounded=0;strokeColor={col};strokeWidth=2;fontSize=11;"
              "fontStyle=1;labelBackgroundColor=#ffffff;")
        if r["ext"]:
            st += "dashed=1;"
        pts, kids = [], []
        label = f'{title}<br><span style="color:{col}">{t.replace(":", " : ")}</span>'
        if a_name == b_name:
            e = ents[a_name]
            dx, dy = ov.get("off", (0, -170))
            pts = [(e.cx + dx - 80, e.cy + dy), (e.cx + dx + 80, e.cy + dy)]
            st += "curved=1;"
        else:
            a, b = ents[a_name], ents[b_name]
            L = math.hypot(a.cx - b.cx, a.cy - b.cy)
            x = max(0.45, min(0.88, 1 - 190 / max(L, 1)))
            ks = ("edgeLabel;html=1;align=center;verticalAlign=middle;resizable=0;points=[];"
                  f"fontSize=17;fontStyle=1;fontColor={col};labelBackgroundColor=#ffffff;")
            kids = [(f"<b>{r['parts'][0][1]}</b>", ks, -x), (f"<b>{r['parts'][1][1]}</b>", ks, x)]
        e2 = pg.edge(ents[a_name], ents[b_name], label, st, pts, lpos=0)
        e2.children = kids
    return pg


COL_RE = re.compile(r"^(\w+)\s+(BIGINT|INT|TINYINT|SMALLINT|CHAR|VARCHAR|TEXT|DATETIME|DECIMAL|BOOLEAN|ENUM|JSON|TIME|BINARY)\b")


def parse_schema(path=SCHEMA_SQL):
    """Tables -> columns, primary key, nullable columns and foreign keys, read from the DDL."""
    sql = open(path, encoding="utf-8").read()
    tables = {}
    for m in re.finditer(r"CREATE TABLE (\w+) \([^\n]*\n(.*?)\n\) ENGINE", sql, re.S):
        cols, pk, nullable, fks = [], [], set(), []
        for raw in m.group(2).split("\n"):
            line = raw.split("--")[0].strip().rstrip(",")
            if line.startswith("PRIMARY KEY"):
                pk += [c.strip() for c in re.search(r"\((.*?)\)", line).group(1).split(",")]
                continue
            fm = re.search(r"FOREIGN KEY \((.*?)\)\s+REFERENCES (\w+)", line)
            if fm:
                fks.append(([c.strip() for c in fm.group(1).split(",")], fm.group(2)))
                continue
            cm = COL_RE.match(line)
            if cm:
                cols.append(cm.group(1))
                if "PRIMARY KEY" in line:
                    pk.append(cm.group(1))
                if "NOT NULL" not in line and "PRIMARY KEY" not in line:
                    nullable.add(cm.group(1))
        tables[m.group(1)] = dict(cols=cols, pk=pk, nullable=nullable, fks=fks)
    return tables


def column_lines(tb):
    refs = {}
    for cols, ref in tb["fks"]:
        for c in cols:
            if ref not in refs.setdefault(c, []):
                refs[c].append(ref)
    lines = []
    for c in tb["cols"]:
        name = f"<u>{c}</u>" if c in tb["pk"] else c
        tag = ("<b>PK</b> " if c in tb["pk"] else "") + ('<i style="color:#1a5fb4">FK</i> ' if c in refs else "")
        target = f' <span style="color:#1a5fb4">-&gt; {", ".join(refs[c])}</span>' if c in refs else ""
        plain = (("PK " if c in tb["pk"] else "") + ("FK " if c in refs else "") + c
                 + (" -> " + ", ".join(refs[c]) if c in refs else ""))
        lines.append((plain, tag + name + target))
    return lines


def build_relational(spec, idx):
    pg = Page(spec, idx)
    tables = parse_schema()
    missing = set(tables) - set(TABLE_DOMAIN)
    assert not missing, f"tables without an area in TABLE_DOMAIN: {sorted(missing)}"
    order = ["locale", "identity", "games", "profile", "sessions", "social", "moderation"]
    top = 0
    for dom in order:
        names = [t for t in tables if TABLE_DOMAIN[t] == dom]
        title, fill, stroke = DOMAINS[dom]
        boxes, x, row_h = {}, 40, 0
        for t in names:
            lines = column_lines(tables[t])
            w = max(220, 6.6 * max(len(pl) for pl, _ in lines + [(t, "")]) + 36)
            h = 36 + 17 * len(lines) + 10
            label = (f'<div style="text-align:center;font-size:13px"><b>{t}</b></div>'
                     '<hr size="1">' + "<br>".join(html for _, html in lines))
            st = (f"rounded=0;whiteSpace=wrap;html=1;align=left;verticalAlign=top;spacingLeft=8;spacingTop=4;"
                  f"fillColor=#ffffff;strokeColor={stroke};strokeWidth=1.5;fontSize=11;")
            boxes[t] = pg.add("entity", x + w / 2, top + 60 + h / 2, w, h, label, st, z=3)
            x += w + 50
            row_h = max(row_h, h)
        links = [(t, cols, ref) for t in names for cols, ref in tables[t]["fks"]
                 if ref != t and TABLE_DOMAIN.get(ref) == dom]
        lane_w = x + 10
        lane_h = 60 + row_h + 40 + 16 * len(links) + 20
        pg.add("lane", lane_w / 2, top + lane_h / 2, lane_w, lane_h, title,
               f"rounded=1;arcSize=2;whiteSpace=wrap;html=1;fillColor={fill};strokeColor={stroke};"
               f"fillOpacity=40;strokeWidth=2;verticalAlign=top;align=left;spacingLeft=14;fontStyle=1;"
               f"fontSize=20;fontColor={stroke};", z=0)
        row_bottom = top + 60 + row_h
        for k, (t, cols, ref) in enumerate(links):
            a, b = boxes[t], boxes[ref]
            optional = all(c in tables[t]["nullable"] for c in cols)
            ex, en = 0.35 + 0.3 * ((k % 3) / 2), 0.2 + 0.6 * ((k % 5) / 4)
            level = row_bottom + 30 + 16 * k
            sx, tx = a.cx + (ex - 0.5) * a.w, b.cx + (en - 0.5) * b.w
            st = (f"html=1;rounded=1;strokeColor={stroke};strokeWidth=1.5;startArrow=ERmany;startFill=0;"
                  f"endArrow={'ERzeroToOne' if optional else 'ERmandOne'};endFill=0;"
                  f"exitX={ex:.2f};exitY=1;exitDx=0;exitDy=0;entryX={en:.2f};entryY=1;entryDx=0;entryDy=0;")
            pg.edge(a, b, "", st, [(sx, level), (tx, level)], lpos=0)
        top += lane_h + 60
    return pg


def add_legend(pg, x, y):
    """Legend block; x,y = top-left."""
    pg.add("legend", x + 350, y + 190, 700, 380, "", "rounded=1;arcSize=2;fillColor=#ffffff;"
           "strokeColor=#999999;whiteSpace=wrap;html=1;", z=0)
    pg.add("text", x + 110, y + 30, 200, 24, "LEGEND",
           "text;html=1;fontStyle=1;fontSize=14;align=left;", z=4)
    rows = [
        ("entity", 0, 0, "Entity (strong)"), ("weak", 0, 1, "Weak entity"),
        ("rel", 0, 2, "Relationship"), ("ident", 0, 3, "Identifying relationship"),
        ("ghost", 0, 4, "Entity defined on another page"),
        ("key", 1, 0, "Key attribute (underlined)"), ("pkey", 1, 1, "Partial key (weak entity)"),
        ("derived", 1, 2, "Derived (computed) attribute"), ("multi", 1, 3, "Multivalued attribute"),
        ("ext", 1, 4, "External store (MongoDB)"),
    ]
    for kind, c, r, text in rows:
        bx, by = x + 80 + c * 350, y + 90 + r * 52
        if kind in ("entity", "weak", "ghost", "ext"):
            st = "rounded=0;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;"
            if kind == "ghost":
                st = ("rounded=0;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#6c8ebf;"
                      "dashed=1;")
            if kind == "ext":
                st = ("rounded=0;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#2e8b57;"
                      "dashed=1;strokeWidth=2;")
            s = pg.add("legend", bx, by, 70, 30, "", st, z=4)
            if kind == "weak":
                s.inner = (58, 18)
        elif kind in ("rel", "ident"):
            s = pg.add("legend", bx, by, 70, 40, "",
                       f"rhombus;whiteSpace=wrap;html=1;fillColor={REL_FILL};strokeColor={REL_STROKE};", z=4)
            if kind == "ident":
                s.inner = (54, 28)
        else:
            sample = {"key": "*id", "pkey": "!part", "derived": "~calc", "multi": "+list"}[kind]
            lab, st = attr_style(sample)
            pg.add("legend", bx, by, 70, 30, lab, st, z=4)
        pg.add("text", bx + 190, by, 250, 30, text,
               "text;html=1;fontSize=12;align=left;verticalAlign=middle;", z=4)
    pg.add("text", x + 350, y + 345, 640, 40,
           "<b style=\"color:#2e8b57\">1 : 1</b> one-to-one &nbsp;&nbsp; <b style=\"color:#1a5fb4\">1 : N</b> one-to-many &nbsp;&nbsp; <b style=\"color:#c01c28\">M : N</b> many-to-many.<br>Number at a line end = how many of that entity per relationship.  "
           "Double line = every instance must take part (total participation).",
           "text;html=1;fontSize=11;align=left;whiteSpace=wrap;", z=4)


# ------------------------------------------------------------- emit XML


def bounds(pg):
    return (min(s.cx - s.w / 2 for s in pg.shapes), min(s.cy - s.h / 2 for s in pg.shapes),
            max(s.cx + s.w / 2 for s in pg.shapes), max(s.cy + s.h / 2 for s in pg.shapes))


def page_xml(pg):
    x0, y0, x1, y1 = bounds(pg)
    pg.add("text", x0 + 400, y0 - 90, 800, 40, pg.spec["title"],
           "text;html=1;fontStyle=1;fontSize=26;align=left;", z=4)
    pg.add("text", x0 + 600, y0 - 45, 1200, 30, pg.spec["sub"],
           "text;html=1;fontSize=14;align=left;fontColor=#555555;", z=4)
    if pg.spec.get("legend", True):
        add_legend(pg, x0, y1 + 60)
    else:
        pg.add("text", x0 + 850, y1 + 40, 1700, 30, pg.spec.get("note") or
               "<b style=\"color:#2e8b57\">1 : 1</b> one-to-one &nbsp;&nbsp; <b style=\"color:#1a5fb4\">1 : N</b> one-to-many &nbsp;&nbsp; <b style=\"color:#c01c28\">M : N</b> many-to-many.&nbsp;&nbsp; Numbers at each line end say how many of that entity take part.  "
               "Dashed = MongoDB.  Double border = weak entity.",
               "text;html=1;fontSize=13;align=left;fontColor=#555555;", z=4)
    x0, y0, x1, y1 = bounds(pg)
    dx, dy = 60 - x0, 60 - y0
    out = []
    for s in sorted(pg.shapes, key=lambda s: s.z):
        x, y = s.cx - s.w / 2 + dx, s.cy - s.h / 2 + dy
        out.append(f'<mxCell id="{s.id}" value="{esc(s.label)}" style="{s.style}" vertex="1" parent="1">'
                   f'<mxGeometry x="{x:.1f}" y="{y:.1f}" width="{s.w:.1f}" height="{s.h:.1f}" as="geometry"/></mxCell>')
        if s.inner:
            iw, ih = s.inner
            ix, iy = s.cx - iw / 2 + dx, s.cy - ih / 2 + dy
            base = s.style.split("fillColor")[0]
            stroke = s.style.split("strokeColor=")[1].split(";")[0]
            out.append(f'<mxCell id="{s.id}i" value="" style="{base}fillColor=none;strokeColor={stroke};'
                       f'connectable=0;" vertex="1" parent="1"><mxGeometry x="{ix:.1f}" y="{iy:.1f}" '
                       f'width="{iw:.1f}" height="{ih:.1f}" as="geometry"/></mxCell>')
    for e in pg.edges:
        pts = ""
        if e.points:
            pts = '<Array as="points">' + "".join(
                f'<mxPoint x="{px + dx:.1f}" y="{py + dy:.1f}"/>' for px, py in e.points) + "</Array>"
        out.append(f'<mxCell id="{e.id}" value="{esc(e.label)}" style="{e.style}" edge="1" parent="1" '
                   f'source="{e.a.id}" target="{e.b.id}"><mxGeometry x="{e.lpos}" relative="1" as="geometry">'
                   f'{pts}</mxGeometry></mxCell>')
        for i, (val, kst, kx) in enumerate(e.children):
            out.append(f'<mxCell id="{e.id}c{i}" value="{esc(val)}" style="{kst}" vertex="1" '
                       f'connectable="0" parent="{e.id}"><mxGeometry x="{kx:.2f}" relative="1" as="geometry">'
                       f'<mxPoint as="offset"/></mxGeometry></mxCell>')
    w, h = x1 - x0 + 120, y1 - y0 + 120
    return (f'<diagram name="{esc(pg.spec["name"])}" id="pairadice-{pg.idx}">'
            f'<mxGraphModel dx="1400" dy="900" grid="0" gridSize="10" guides="1" tooltips="1" connect="1" '
            f'arrows="1" fold="1" page="0" pageScale="1" pageWidth="{int(w)}" pageHeight="{int(h)}" '
            f'math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>'
            f'{"".join(out)}</root></mxGraphModel></diagram>')


# ---------------------------------------------------------------- checks


def rect(s, m=0):
    return (s.cx - s.w / 2 - m, s.cy - s.h / 2 - m, s.cx + s.w / 2 + m, s.cy + s.h / 2 + m)


def overlap(a, b):
    return not (a[2] <= b[0] or b[2] <= a[0] or a[3] <= b[1] or b[3] <= a[1])


def seg_hits_rect(p, q, r):  # Liang-Barsky
    x0, y0 = p
    dx, dy = q[0] - p[0], q[1] - p[1]
    t0, t1 = 0.0, 1.0
    for pp, qq in ((-dx, x0 - r[0]), (dx, r[2] - x0), (-dy, y0 - r[1]), (dy, r[3] - y0)):
        if pp == 0:
            if qq < 0:
                return False
        else:
            t = qq / pp
            if pp < 0:
                t0 = max(t0, t)
            else:
                t1 = min(t1, t)
            if t0 > t1:
                return False
    return True


def check(pg):
    probs = []
    real = [s for s in pg.shapes if s.kind in ("entity", "rel", "attr")]
    for i, a in enumerate(real):
        for b in real[i + 1:]:
            if overlap(rect(a, -2), rect(b, -2)):
                probs.append(f"overlap: {a.label} x {b.label}")
    for e in pg.edges:
        a, b = e.a, e.b
        pts = [(a.cx, a.cy)] + [tuple(p) for p in e.points] + [(b.cx, b.cy)]
        for s in real:
            if s is a or s is b:
                continue
            r = rect(s, -6)
            if any(seg_hits_rect(p, q, r) for p, q in zip(pts, pts[1:])):
                probs.append(f"line {a.label}->{b.label} crosses {s.label}")
    return probs


def validate():
    for name, r in RELS.items():
        for p in r["parts"]:
            assert p[0] in ENTITIES, f"{name}: unknown entity {p[0]}"
    for spec in PAGES:
        if spec.get("kind") in ("overview", "relational"):
            continue
        have = {e[0] for e in spec["ents"]}
        for ri in spec["rels"]:
            rn = ri if isinstance(ri, str) else ri[0]
            for p in RELS[rn]["parts"]:
                assert p[0] in have, f"page {spec['name']}: {rn} needs {p[0]}"


def main():
    validate()
    builders = {"overview": build_overview, "relational": build_relational}
    pages = [builders.get(s.get("kind"), build_detail)(s, i) for i, s in enumerate(PAGES)]
    total = 0
    for pg in pages:
        probs = check(pg) if pg.spec.get("kind") != "relational" else []
        total += len(probs)
        print(f"[{pg.spec['name']}] shapes={len(pg.shapes)} edges={len(pg.edges)} problems={len(probs)}")
        for p in probs[:30]:
            print("   -", p)
    if "--check" in sys.argv:
        return
    xml = ('<mxfile host="app.diagrams.net" agent="gen_erd.py">'
           + "".join(page_xml(pg) for pg in pages) + "</mxfile>")
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(xml)
    print("wrote", os.path.normpath(OUT), f"({len(xml) // 1024} KiB), total problems={total}")


if __name__ == "__main__":
    main()
