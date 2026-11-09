import { describe, expect, test } from "bun:test";
import { LIMITS, type AvailabilitySlot } from "@/lib/profile/types";
import {
  BANDS,
  addWeekdayEvenings,
  cellName,
  cellsToSlots,
  copyDayToWeekdays,
  emptyCells,
  slotsToCells,
  toMinutes,
  toggleCell,
} from "./slots";

const s = (day: number, start: string, end: string): AvailabilitySlot => ({ day, start, end });

describe("toMinutes", () => {
  test("parses and clamps 24:00", () => {
    expect(toMinutes("06:30")).toBe(390);
    expect(toMinutes("24:00")).toBe(23 * 60 + 59);
    expect(toMinutes("09:00:00")).toBe(540);
    expect(toMinutes("25:00")).toBeNull();
    expect(toMinutes("9:00")).toBeNull();
  });
});

describe("cellsToSlots", () => {
  test("empty grid gives no slots", () => {
    expect(cellsToSlots(emptyCells())).toEqual([]);
  });
  test("merges adjacent bands on a day", () => {
    let c = toggleCell(emptyCells(), 0, 1);
    c = toggleCell(c, 0, 2);
    expect(cellsToSlots(c)).toEqual([s(0, "09:00", "17:00")]);
  });
  test("does not merge separated bands", () => {
    let c = toggleCell(emptyCells(), 2, 0);
    c = toggleCell(c, 2, 3);
    expect(cellsToSlots(c)).toEqual([s(2, "06:00", "09:00"), s(2, "17:00", "21:00")]);
  });
  test("Late ends at 23:59 and merges with Evening", () => {
    let c = toggleCell(emptyCells(), 4, 3);
    c = toggleCell(c, 4, 4);
    expect(cellsToSlots(c)).toEqual([s(4, "17:00", "23:59")]);
  });
  test("Night stays its own slot, even beside Early morning", () => {
    let c = toggleCell(emptyCells(), 6, 5);
    c = toggleCell(c, 6, 0);
    expect(cellsToSlots(c)).toEqual([s(6, "06:00", "09:00"), s(6, "00:00", "06:00")]);
  });
  test("full grid stays within the limit with no overlaps", () => {
    const all = emptyCells().map((r) => r.map(() => true));
    const out = cellsToSlots(all);
    expect(out.length).toBeLessThanOrEqual(LIMITS.availabilitySlots);
    expect(out).toHaveLength(14);
    for (const a of out) for (const b of out) {
      if (a === b || a.day !== b.day) continue;
      expect(a.end <= b.start || b.end <= a.start).toBe(true);
    }
  });
  test("worst case alternating bands fits exactly in 28", () => {
    const alt = emptyCells().map((r) => r.map((_, i) => i % 2 === 0 || i === 5));
    expect(cellsToSlots(alt).length).toBeLessThanOrEqual(LIMITS.availabilitySlots);
  });
});

describe("slotsToCells", () => {
  test("round trips grid-made slots", () => {
    let c = toggleCell(emptyCells(), 1, 3);
    c = toggleCell(c, 1, 4);
    c = toggleCell(c, 3, 5);
    c = toggleCell(c, 5, 1);
    const slots = cellsToSlots(c);
    const back = slotsToCells(slots);
    expect(back.customCount).toBe(0);
    expect(back.cells).toEqual(c);
    expect(cellsToSlots(back.cells)).toEqual(slots);
  });
  test("a slot covering several bands selects them all", () => {
    const { cells, customCount } = slotsToCells([s(0, "06:00", "23:59")]);
    expect(customCount).toBe(0);
    expect(cells[0]).toEqual([true, true, true, true, true, false]);
  });
  test("accepts 24:00 as the end of Late", () => {
    const { cells, customCount } = slotsToCells([s(0, "21:00", "24:00")]);
    expect(cells[0][4]).toBe(true);
    expect(customCount).toBe(0);
  });
  test("partial slots select nothing and are counted as custom", () => {
    const { cells, customCount } = slotsToCells([s(0, "10:00", "11:00"), s(1, "08:00", "13:00")]);
    expect(cells[0].some(Boolean)).toBe(false);
    expect(cells[1]).toEqual([false, true, false, false, false, false]);
    expect(customCount).toBe(2);
  });
  test("slot with extra partial tail is custom but still selects whole bands", () => {
    const { cells, customCount } = slotsToCells([s(2, "09:00", "18:00")]);
    expect(cells[2]).toEqual([false, true, true, false, false, false]);
    expect(customCount).toBe(1);
  });
  test("malformed slots are custom and ignored", () => {
    const { cells, customCount } = slotsToCells([s(9, "09:00", "12:00"), s(0, "12:00", "09:00"), s(0, "xx", "yy")]);
    expect(cells.flat().some(Boolean)).toBe(false);
    expect(customCount).toBe(3);
  });
  test("Night 00:00-06:00 is aligned", () => {
    const { cells, customCount } = slotsToCells([s(3, "00:00", "06:00")]);
    expect(cells[3][5]).toBe(true);
    expect(customCount).toBe(0);
  });
});

describe("quick actions and names", () => {
  test("copy Monday to weekdays leaves the weekend", () => {
    let c = toggleCell(emptyCells(), 0, 2);
    c = toggleCell(c, 6, 1);
    const out = copyDayToWeekdays(c);
    for (let d = 0; d < 5; d++) expect(out[d][2]).toBe(true);
    expect(out[5].some(Boolean)).toBe(false);
    expect(out[6][1]).toBe(true);
  });
  test("weekday evenings preset", () => {
    const out = addWeekdayEvenings(emptyCells());
    expect(cellsToSlots(out)).toHaveLength(5);
    expect(out[5][3]).toBe(false);
  });
  test("cell names", () => {
    expect(cellName(0, 3, true)).toBe("Monday evening, 17:00 to 21:00, available");
    expect(cellName(6, 0, false)).toBe("Sunday early morning, 06:00 to 09:00, not available");
    expect(BANDS).toHaveLength(6);
  });
});
