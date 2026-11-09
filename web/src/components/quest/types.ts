// Shapes shared by the quest creator's server and client code (no server-only imports).

export interface CatalogGame { game_id: number; name: string; slug: string }
export interface CatalogMode {
  mode_id: number;
  game_id: number;
  name: string;
  min_team_size: number;
  max_team_size: number;
  is_ranked: boolean;
}
export interface CatalogRole { game_role_id: number; game_id: number; name: string }
export interface CatalogRank { rank_id: number; game_id: number; name: string; ordinal: number }
export interface CatalogPlatform { platform_id: number; name: string; identity_label: string }
export interface CatalogRegion { region_id: number; name: string }
export interface CatalogLanguage { language_code: string; name: string }
export interface CatalogTag { tag_id: number; name: string; category: string | null }

export interface QuestCatalog {
  games: CatalogGame[];
  modes: CatalogMode[];
  roles: CatalogRole[];
  ranks: CatalogRank[];
  /** Platforms a game is available on, per the game_platform table. */
  platforms: Array<CatalogPlatform & { game_id: number }>;
  regions: CatalogRegion[];
  languages: CatalogLanguage[];
  tags: CatalogTag[];
}

/** One of the viewer's own platform accounts. The handle is only ever sent to its owner. */
export interface HostAccount { account_id: number; platform_id: number; label: string }

export interface QuestInput {
  gameId: number;
  modeId: number;
  platformId: number;
  regionId: number | null;
  title: string;
  description: string | null;
  maxPlayers: number;
  /** UTC "YYYY-MM-DD HH:MM:SS" or null for "as soon as people join". */
  scheduledStartUtc: string | null;
  regionLocked: boolean;
  voiceRequired: boolean;
  visibility: "public" | "friends" | "invite";
  joinPolicy: "approval" | "auto";
  minRankId: number | null;
  maxRankId: number | null;
  minAvgRating: number | null;
  hostRoleId: number | null;
  hostAccountId: number | null;
  slots: Array<{ role_id: number; needed: number }>;
  languageCodes: string[];
  tagIds: number[];
}

export type QuestField =
  | "title"
  | "description"
  | "game"
  | "mode"
  | "platform"
  | "region"
  | "maxPlayers"
  | "roles"
  | "hostRole"
  | "hostAccount"
  | "languages"
  | "tags"
  | "visibility"
  | "joinPolicy"
  | "rankRange"
  | "minRating"
  | "scheduledStart";

export type QuestValues = Record<string, string | string[]>;

export interface QuestFormState {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Partial<Record<QuestField, string>>;
  /** Echoed back so a failed submit does not clear the form. */
  values?: QuestValues;
}

export const initialQuestState: QuestFormState = { status: "idle" };

/** Role names to the role-* sprite family. */
export function roleSpriteName(
  role: string,
): "role-damage" | "role-support" | "role-tank" | "role-scout" | "role-builder" | "role-leader" | "role-flex" {
  switch (role.trim().toLowerCase()) {
    case "duelist":
    case "fragger":
    case "rusher":
      return "role-damage";
    case "controller":
    case "support":
      return "role-support";
    case "sentinel":
    case "bed defender":
      return "role-tank";
    case "initiator":
    case "scout":
      return "role-scout";
    case "builder":
      return "role-builder";
    case "igl":
    case "in-game leader":
      return "role-leader";
    default:
      return "role-flex";
  }
}
