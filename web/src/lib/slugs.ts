import { slugify } from "@/lib/format";
import type { GameInfo, ModeInfo } from "@/lib/types";

// Pure helpers (no server-only imports) so client components can use them too.

export type ModeRow = Omit<ModeInfo, "slug">;

/**
 * Unique, non-empty URL slugs for game modes. Within a game the first mode
 * (by mode_id) keeps its plain slug; an empty or colliding slug falls back to
 * `${mode_id}-${slug}` (or just `${mode_id}`), which `resolveMode` finds by id prefix.
 */
export function assignModeSlugs(rows: readonly ModeRow[]): ModeInfo[] {
  const ordered = [...rows].sort((a, b) => a.game_id - b.game_id || a.mode_id - b.mode_id);
  const used = new Map<number, Set<string>>();
  const slugs = new Map<number, string>();
  for (const r of ordered) {
    let taken = used.get(r.game_id);
    if (!taken) {
      taken = new Set<string>();
      used.set(r.game_id, taken);
    }
    const base = slugify(r.name);
    let slug = base;
    if (slug === "" || taken.has(slug)) slug = base === "" ? String(r.mode_id) : `${r.mode_id}-${base}`;
    for (let n = 2; taken.has(slug); n++) slug = `${r.mode_id}-${base || "mode"}-${n}`;
    taken.add(slug);
    slugs.set(r.mode_id, slug);
  }
  return rows.map((r) => ({ ...r, slug: slugs.get(r.mode_id) ?? String(r.mode_id) }));
}

/** Lowercased, percent-decoded path segment; "" when it cannot be decoded. */
export function normaliseSegment(segment: string | undefined): string {
  if (!segment) return "";
  try {
    return decodeURIComponent(segment).toLowerCase();
  } catch {
    return "";
  }
}

export function resolveGame<T extends Pick<GameInfo, "slug">>(games: readonly T[], segment: string | undefined): T | undefined {
  const seg = normaliseSegment(segment);
  if (seg === "") return undefined;
  return games.find((g) => g.slug.toLowerCase() === seg);
}

/** Exact slug first, then the `${mode_id}` / `${mode_id}-...` id-prefix form. */
export function resolveMode<T extends Pick<ModeInfo, "slug" | "mode_id">>(modes: readonly T[], segment: string | undefined): T | undefined {
  const seg = normaliseSegment(segment);
  if (seg === "") return undefined;
  const exact = modes.find((m) => m.slug === seg);
  if (exact) return exact;
  const m = /^(\d+)(?:-|$)/.exec(seg);
  if (!m) return undefined;
  const id = Number(m[1]);
  // only id-form slugs are tolerant of a renamed mode; plain slugs must match exactly
  return modes.find((x) => x.mode_id === id && /^\d+(?:-|$)/.test(x.slug));
}
