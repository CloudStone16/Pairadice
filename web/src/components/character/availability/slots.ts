// Pure, client-safe helpers for the weekly availability grid (no React, no I/O).
import { LIMITS, type AvailabilitySlot } from "@/lib/profile/types";

export interface Band {
  id: string;
  label: string;
  /** "HH:MM" */
  start: string;
  end: string;
  startMin: number;
  endMin: number;
}

/** Last representable minute of a day; the Late band ends here ("23:59"). */
export const END_OF_DAY = 23 * 60 + 59;

function band(id: string, label: string, start: string, end: string): Band {
  return { id, label, start, end, startMin: toMinutes(start) ?? 0, endMin: toMinutes(end) ?? 0 };
}

/** Parse "HH:MM" (or "HH:MM:SS") to minutes; "24:00" becomes 23:59. Null when malformed. */
export function toMinutes(value: string): number | null {
  const m = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (min > 59 || h > 24 || (h === 24 && min > 0)) return null;
  return Math.min(h * 60 + min, END_OF_DAY);
}

export function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Display order. Indexes 0-4 run back to back through the day; Night (5) is 00:00-06:00 and never merges. */
export const BANDS: readonly Band[] = [
  band("early", "Early morning", "06:00", "09:00"),
  band("morning", "Morning", "09:00", "12:00"),
  band("afternoon", "Afternoon", "12:00", "17:00"),
  band("evening", "Evening", "17:00", "21:00"),
  band("late", "Late", "21:00", "23:59"),
  band("night", "Night", "00:00", "06:00"),
];

export const NIGHT_INDEX = 5;
export const EVENING_INDEX = 3;
export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

/** cells[day][band] */
export type Cells = readonly (readonly boolean[])[];

export function emptyCells(): boolean[][] {
  return DAY_NAMES.map(() => BANDS.map(() => false));
}

function clone(cells: Cells): boolean[][] {
  return cells.map((row) => [...row]);
}

interface Range {
  start: number;
  end: number;
}

function normalise(slot: AvailabilitySlot): { day: number; range: Range } | null {
  if (!Number.isInteger(slot.day) || slot.day < 0 || slot.day > 6) return null;
  const start = toMinutes(slot.start);
  const end = toMinutes(slot.end);
  if (start === null || end === null || end <= start) return null;
  return { day: slot.day, range: { start, end } };
}

function bandsFullyCovered(range: Range): number[] {
  const out: number[] = [];
  BANDS.forEach((b, i) => {
    if (range.start <= b.startMin && range.end >= b.endMin) out.push(i);
  });
  return out;
}

/** True when the slot is exactly a union of whole bands (so the grid shows it without loss). */
function isGridAligned(slot: AvailabilitySlot): boolean {
  const n = normalise(slot);
  if (!n) return false;
  const covered = bandsFullyCovered(n.range)
    .map((i) => BANDS[i])
    .sort((a, b) => a.startMin - b.startMin);
  if (covered.length === 0) return false;
  let cursor = covered[0].startMin;
  if (cursor !== n.range.start) return false;
  for (const b of covered) {
    // Night ends at 06:00 and Early starts at 06:00; the other bands also touch exactly.
    if (b.startMin !== cursor) return false;
    cursor = b.endMin;
  }
  return cursor === n.range.end;
}

export interface Conversion {
  cells: boolean[][];
  /** Slots that are not a union of whole bands (partial or off-grid) and so cannot be shown. */
  customCount: number;
}

export function slotsToCells(slots: readonly AvailabilitySlot[]): Conversion {
  const cells = emptyCells();
  let customCount = 0;
  for (const slot of slots) {
    const n = normalise(slot);
    if (n) for (const i of bandsFullyCovered(n.range)) cells[n.day][i] = true;
    if (!isGridAligned(slot)) customCount += 1;
  }
  return { cells, customCount };
}

/** Selected bands -> slots. Adjacent bands on a day merge; Night stays on its own. Never overlaps. */
export function cellsToSlots(cells: Cells): AvailabilitySlot[] {
  const out: AvailabilitySlot[] = [];
  for (let day = 0; day < DAY_NAMES.length; day++) {
    const row = cells[day] ?? [];
    let i = 0;
    while (i < NIGHT_INDEX) {
      if (!row[i]) {
        i += 1;
        continue;
      }
      let j = i;
      while (j + 1 < NIGHT_INDEX && row[j + 1]) j += 1;
      out.push({ day, start: BANDS[i].start, end: BANDS[j].end });
      i = j + 1;
    }
    if (row[NIGHT_INDEX]) out.push({ day, start: BANDS[NIGHT_INDEX].start, end: BANDS[NIGHT_INDEX].end });
  }
  return out.slice(0, LIMITS.availabilitySlots);
}

export function toggleCell(cells: Cells, day: number, bandIndex: number): boolean[][] {
  const next = clone(cells);
  next[day][bandIndex] = !next[day][bandIndex];
  return next;
}

export function clearAll(): boolean[][] {
  return emptyCells();
}

/** Copy one day's bands onto Monday-Friday (default source: Monday). */
export function copyDayToWeekdays(cells: Cells, from = 0): boolean[][] {
  const next = clone(cells);
  for (let d = 0; d < 5; d++) next[d] = [...cells[from]];
  return next;
}

/** Adds the Evening band on Monday-Friday; keeps everything else. */
export function addWeekdayEvenings(cells: Cells): boolean[][] {
  const next = clone(cells);
  for (let d = 0; d < 5; d++) next[d][EVENING_INDEX] = true;
  return next;
}

export function cellName(day: number, bandIndex: number, selected: boolean): string {
  const b = BANDS[bandIndex];
  return `${DAY_NAMES[day]} ${b.label.toLowerCase()}, ${b.start} to ${b.end}, ${selected ? "available" : "not available"}`;
}

/** Stable accessible name for a grid cell (state is exposed separately, with aria-pressed). */
export function cellLabel(day: number, bandIndex: number): string {
  const b = BANDS[bandIndex];
  return `${DAY_NAMES[day]}, ${b.label}, ${b.start} to ${b.end}`;
}

export function countSelected(cells: Cells): number {
  return cells.reduce((n, row) => n + row.filter(Boolean).length, 0);
}
