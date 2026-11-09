import { describe, expect, test } from "bun:test";
import { localToUtcMs, validateQuest } from "./validate";
import type { QuestCatalog } from "./types";

const catalog: QuestCatalog = {
  games: [{ game_id: 1, name: "Minecraft", slug: "minecraft" }],
  modes: [{ mode_id: 1, game_id: 1, name: "Bedwars", min_team_size: 1, max_team_size: 4, is_ranked: false }],
  roles: [{ game_role_id: 3, game_id: 1, name: "Builder" }],
  ranks: [
    { rank_id: 1, game_id: 1, name: "Low", ordinal: 1 },
    { rank_id: 2, game_id: 1, name: "High", ordinal: 2 },
  ],
  platforms: [{ game_id: 1, platform_id: 1, name: "PC", identity_label: "x" }],
  regions: [{ region_id: 9, name: "AP" }],
  languages: [{ language_code: "en", name: "English" }],
  tags: [{ tag_id: 1, name: "chill", category: null }],
};
const now = new Date("2026-11-09T12:00:00Z");
const base = { title: "Bed run", game: "1", mode: "1", platform: "1", maxPlayers: "4", languages: ["en"] };

describe("validateQuest", () => {
  test("accepts a minimal quest", () => {
    const r = validateQuest(base, catalog, null, now, "UTC");
    expect(r.ok).toBe(true);
  });
  test("per-field errors", () => {
    const r = validateQuest({ ...base, title: "x", maxPlayers: "9", languages: [], minRank: "2", maxRank: "1" }, catalog, null, now, "UTC");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["languages", "maxPlayers", "rankRange", "title"]);
  });
  test("slots plus host must fit", () => {
    const r = validateQuest({ ...base, need_3: "4" }, catalog, null, now, "UTC");
    expect(!r.ok && r.errors.roles).toBeTruthy();
  });
  test("past start rejected, future converted with offset", () => {
    const past = validateQuest({ ...base, scheduledStart: "2026-11-09T10:00", tzOffset: "0" }, catalog, null, now, "UTC");
    expect(!past.ok && past.errors.scheduledStart).toBeTruthy();
    const ok = validateQuest({ ...base, scheduledStart: "2026-11-10T20:00", tzOffset: "-330" }, catalog, null, now, "UTC");
    expect(ok.ok && ok.input.scheduledStartUtc).toBe("2026-11-10 14:30:00");
  });
  test("fallback zone", () => {
    expect(new Date(localToUtcMs("2026-11-10T20:00", null, "Asia/Kolkata")!).toISOString()).toBe("2026-11-10T14:30:00.000Z");
  });
});
