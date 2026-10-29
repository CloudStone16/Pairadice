// Plain data shapes returned by src/lib/queries*.ts (no server-only imports,
// so client components may import these types).

export type Presence = "online" | "away" | "suspended";
export type SessionStatus = "open" | "full" | "in_progress" | "completed" | "cancelled";
export type ParticipantStatus = "requested" | "accepted" | "declined" | "left" | "kicked";

export interface UserLite {
  user_id: number;
  username: string;
  display_name: string;
  timezone: string;
  trust_score: number;
  presence: Presence;
}

export type FriendEntry = UserLite;

export interface FriendLists {
  accepted: FriendEntry[];
  incoming: FriendEntry[];
  outgoing: FriendEntry[];
}

export interface GameInfo {
  game_id: number;
  name: string;
  slug: string;
  open_count: number;
}

export interface ModeInfo {
  mode_id: number;
  game_id: number;
  name: string;
  /** Unique within the game, never empty. */
  slug: string;
  description: string | null;
}

export interface QuestFit {
  rank_fit: number;
  avail_fit: number;
  tag_fit: number;
  rating_fit: number;
  social_fit: number;
  region_fit: number;
}

export interface Quest {
  session_id: number;
  title: string;
  game: string;
  game_slug: string;
  game_mode: string;
  platform: string;
  host: string;
  host_id: number;
  region: string | null;
  current_players: number;
  max_players: number;
  open_slots: number;
  min_rank: string | null;
  max_rank: string | null;
  languages: string[];
  tags: string[];
  looking_for: string[];
  scheduled_start: string | null;
  voice_required: boolean;
  /** Present only for recommendations. */
  fit?: QuestFit;
}

export interface DmThread {
  message_id: number;
  other_id: number;
  other_username: string;
  other_display_name: string;
  other_presence: Presence;
  sent_by_me: boolean;
  /** null when the message was removed. */
  content: string | null;
  is_deleted: boolean;
  sent_at: string;
}

export interface Camp {
  session_id: number;
  title: string;
  description: string | null;
  status: SessionStatus;
  max_players: number;
  current_players: number;
  scheduled_start: string | null;
  region_locked: boolean;
  voice_required: boolean;
  visibility: string;
  join_policy: string;
  min_avg_rating: number | null;
  discord_invite_url: string | null;
  host_id: number;
  host_username: string;
  /** users.status of the host: suspended / banned hosts pause their camps. */
  host_status: string;
  game: string;
  game_slug: string;
  game_mode: string;
  region_code: string | null;
  region_name: string | null;
  min_rank: string | null;
  max_rank: string | null;
}

export interface RosterEntry {
  user_id: number;
  username: string;
  display_name: string;
  status: ParticipantStatus;
  game_role: string | null;
  /** Only ever populated for accepted participants viewed by the host or another accepted participant. */
  gamertag: string | null;
  identity_label: string | null;
  left_at: string | null;
}

export interface SlotNeed {
  slots_needed: number;
  role: string;
}

export interface ChatMessage {
  message_id: number;
  sender_id: number;
  username: string;
  display_name: string;
  /** null when removed by moderation. */
  content: string | null;
  is_deleted: boolean;
  sent_at: string;
  edited_at: string | null;
}

export type PartyRole = "hosting" | "party" | "knocking";

export interface PartyEntry {
  session_id: number;
  role: PartyRole;
  title: string;
  status: SessionStatus;
  game: string;
  game_slug: string;
  game_mode: string;
  scheduled_start: string | null;
  current_players: number;
  max_players: number;
}

export interface PlayerCard {
  user_id: number;
  username: string;
  display_name: string;
  home_region: string | null;
  status: string;
  avg_rating: number | null;
  review_count: number;
  sessions_completed: number;
  trust_score: number;
}

export interface PlayerGame {
  profile_id: number;
  game_slug: string;
  game_name: string;
  rank_name: string | null;
  rank_ordinal: number | null;
}

export interface PlayerBadge {
  badge_id: number;
  name: string;
  description: string | null;
}

export interface PlayerLanguage {
  language_code: string;
  name: string;
  proficiency: string;
  is_preferred: boolean;
}
