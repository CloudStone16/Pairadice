"use server";

// Profile editor server actions. Field names: src/lib/profile/types.ts. Each action authenticates, validates
// (src/lib/profile/validate.ts, defence only: the database procedures are the authority), calls one stored
// procedure through the viewer's own login, then revalidates the character pages. Never logs form values.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getViewer, type Viewer } from "@/lib/auth/viewer";
import * as db from "@/lib/mutations/profile";
import type { ActionResult } from "@/lib/mutations/run";
import { LIMITS, type ProfileFormState } from "@/lib/profile/types";
import {
  validateAbout,
  validateAccount,
  validateAvailability,
  validateGameProfile,
  validateLanguages,
  validateRemoveAccount,
  validateRemoveGameProfile,
  validateTags,
  type RawInput,
  type Validated,
} from "@/lib/profile/validate";

const SIGN_IN = "/sign-in?next=%2Fcharacter%2Fedit";
const REPEATED: Readonly<Record<string, number>> = { languages: LIMITS.languages, tags: LIMITS.tags, modes: LIMITS.modes };
const MAX_KEYS = 32;
const MAX_VALUE = 8192; // the schedule JSON is the longest legitimate value

// Allowed field names per action (contract: src/lib/profile/types.ts). Anything else is rejected.
const ABOUT = ["displayName", "bio", "timezone", "countryCode", "homeRegionId", "regionStrictness"];
const LANGUAGES = ["languages", "primary"];
const TAGS = ["tags"];
const ACCOUNT = ["accountId", "platformId", "handle", "discriminator", "isPublic"];
const REMOVE_ACCOUNT = ["accountId"];
const GAME = ["gameId", "platformAccountId", "rankId", "modes", "role1", "role2", "role3"];
const REMOVE_GAME = ["profileId"];
const AVAILABILITY = ["slots"];

type Raw = Record<string, string | string[]>;

/** Allow-listed, bounded copy of the form, or null when it is oversized or has unexpected fields. */
function collect(formData: FormData, allowed: readonly string[]): Raw | null {
  // A plain object (not Object.create(null)): it is echoed back to a Client Component, and React can only
  // serialise plain objects. Prototype keys cannot get in, because every key is checked against `allowed`.
  const out: Raw = {};
  const keys = new Set<string>();
  for (const key of formData.keys()) {
    if (key.startsWith("$ACTION")) continue; // React's own action plumbing
    keys.add(key);
    if (keys.size > MAX_KEYS) return null;
  }
  for (const key of keys) {
    if (!allowed.includes(key)) return null;
    const all = formData.getAll(key).filter((v): v is string => typeof v === "string");
    const cap = REPEATED[key];
    if (cap !== undefined) {
      if (all.length > cap * 2) return null;
    }
    if (all.some((v) => v.length > MAX_VALUE)) return null;
    out[key] = cap !== undefined ? all : (all[0] ?? "");
  }
  return out;
}

/** Shared flow for every section. `run` receives the validated value and calls the mutation. */
async function handle<T>(
  formData: FormData,
  allowed: readonly string[],
  validate: (input: RawInput) => Validated<T>,
  run: (viewer: Viewer, value: T) => Promise<ActionResult<unknown>>,
  saved: string,
): Promise<ProfileFormState> {
  const viewer = await getViewer();
  if (!viewer) redirect(SIGN_IN);
  const values = collect(formData, allowed);
  if (values === null) return { status: "error", message: "Some details need another look." };
  if (viewer.status !== "active") {
    return {
      status: "error",
      message: "Your account is suspended, so you cannot edit your profile right now.",
      values,
    };
  }
  const checked = validate(values);
  if (!checked.ok) {
    return { status: "error", message: "Some details need another look.", fieldErrors: checked.fieldErrors, values };
  }
  const result = await run(viewer, checked.value);
  if (!result.ok) return { status: "error", message: result.message, values };
  revalidatePath("/character");
  revalidatePath("/character/edit");
  return { status: "saved", message: saved };
}

export async function saveAbout(_prev: ProfileFormState, fd: FormData): Promise<ProfileFormState> {
  return handle(fd, ABOUT, validateAbout, db.updateProfile, "About saved.");
}
export async function saveLanguages(_prev: ProfileFormState, fd: FormData): Promise<ProfileFormState> {
  return handle(fd, LANGUAGES, validateLanguages, db.setUserLanguages, "Languages saved.");
}
export async function saveTags(_prev: ProfileFormState, fd: FormData): Promise<ProfileFormState> {
  return handle(fd, TAGS, validateTags, (v, x) => db.setUserTags(v, x.tagIds), "Tags saved.");
}
export async function saveAccount(_prev: ProfileFormState, fd: FormData): Promise<ProfileFormState> {
  return handle(fd, ACCOUNT, validateAccount, db.upsertPlatformAccount, "Account saved.");
}
export async function removeAccount(_prev: ProfileFormState, fd: FormData): Promise<ProfileFormState> {
  return handle(fd, REMOVE_ACCOUNT, validateRemoveAccount, (v, x) => db.removePlatformAccount(v, x.accountId), "Account removed.");
}
export async function saveGameProfile(_prev: ProfileFormState, fd: FormData): Promise<ProfileFormState> {
  return handle(fd, GAME, validateGameProfile, db.upsertGameProfile, "Game profile saved.");
}
export async function removeGameProfile(_prev: ProfileFormState, fd: FormData): Promise<ProfileFormState> {
  return handle(fd, REMOVE_GAME, validateRemoveGameProfile, (v, x) => db.removeGameProfile(v, x.profileId), "Game profile removed.");
}
export async function saveAvailability(_prev: ProfileFormState, fd: FormData): Promise<ProfileFormState> {
  return handle(fd, AVAILABILITY, validateAvailability, (v, x) => db.setAvailability(v, x.slots), "Availability saved.");
}
