// CONTRACT for Phase 3 profile editing, shared by the server actions
// (src/app/(hearth)/character/edit/actions.ts), the data loader (src/lib/queries-profile.ts)
// and the editor UI (src/components/character/**). Types and constants only: client-safe.

/** One editor section = one form = one server action. */
export type ProfileSection = "about" | "languages" | "tags" | "accounts" | "games" | "availability";

/** Returned by every profile action. "saved" means the write succeeded (the page is revalidated). */
export interface ProfileFormState {
  status: "idle" | "saved" | "error";
  /** One user-facing sentence (DB 45000 messages are passed through verbatim). */
  message?: string;
  /** Per-field messages keyed by the FormData field name. */
  fieldErrors?: Record<string, string>;
  /** Echo of submitted values so a failed form can be refilled. */
  values?: Record<string, string | string[]>;
}

export const INITIAL_PROFILE_STATE: ProfileFormState = { status: "idle" };

/** Weekly availability slot in the user's LOCAL time. day: 0 = Monday ... 6 = Sunday. */
export interface AvailabilitySlot {
  day: number;
  start: string; // "HH:MM"
  end: string; // "HH:MM", after start
}

export const LIMITS = {
  displayName: 64,
  bio: 500,
  languages: 8,
  tags: 10,
  accounts: 8,
  handle: 64,
  discriminator: 16,
  modes: 6,
  roles: 3,
  availabilitySlots: 28,
} as const;

export const REGION_STRICTNESS = ["strict", "nearby", "any"] as const;
export type RegionStrictness = (typeof REGION_STRICTNESS)[number];

export interface Option<T extends string | number = number> {
  value: T;
  label: string;
}

export interface EditableGame {
  gameId: number;
  name: string;
  slug: string;
  /** platform_ids this game is played on (game_platform). */
  platformIds: number[];
  modes: Option[];
  /** Ordered low -> high. */
  ranks: Option[];
  roles: Option[];
}

export interface EditableAccount {
  accountId: number;
  platformId: number;
  platformName: string;
  handle: string;
  discriminator: string | null;
  isPublic: boolean;
  /** true if a game profile uses it (its platform cannot change). */
  inUse: boolean;
}

export interface EditableGameProfile {
  profileId: number;
  gameId: number;
  platformAccountId: number | null;
  rankId: number | null;
  modeIds: number[];
  /** role ids in preference order (index 0 = first choice), max 3. */
  roleIds: number[];
}

/** Everything the editor page needs, loaded for the signed-in viewer only. */
export interface ProfileEditData {
  about: {
    username: string;
    displayName: string;
    bio: string;
    timezone: string;
    countryCode: string | null;
    homeRegionId: number | null;
    regionStrictness: RegionStrictness;
  };
  countries: Option<string>[];
  regions: Option[];
  languages: { all: Option<string>[]; selected: string[]; primary: string | null };
  tags: { all: Option[]; selected: number[] };
  platforms: Option[];
  accounts: EditableAccount[];
  games: EditableGame[];
  gameProfiles: EditableGameProfile[];
  availability: AvailabilitySlot[];
}

/*
 * FormData field names per action (all ids are decimal strings):
 *   saveAbout:          displayName, bio, timezone, countryCode ("" = none), homeRegionId ("" = none), regionStrictness
 *   saveLanguages:      languages (repeated), primary
 *   saveTags:           tags (repeated tag ids)
 *   saveAccount:        accountId ("" = new), platformId, handle, discriminator, isPublic ("on" when checked)
 *   removeAccount:      accountId
 *   saveGameProfile:    gameId, platformAccountId ("" = none), rankId ("" = none), modes (repeated), role1, role2, role3 ("" = none)
 *   removeGameProfile:  profileId
 *   saveAvailability:   slots (one JSON string: AvailabilitySlot[])
 */
