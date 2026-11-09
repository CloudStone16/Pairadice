"use client";

import { useActionState, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { FormAlert, type FormAlertItem } from "@/components/auth/FormAlert";
import { PendingButton } from "@/components/ui/PendingButton";
import { Sprite } from "@/components/ui";
import { saveAvailability } from "@/app/(hearth)/character/edit/actions";
import { INITIAL_PROFILE_STATE, type AvailabilitySlot } from "@/lib/profile/types";
import {
  BANDS,
  DAY_NAMES,
  addWeekdayEvenings,
  cellLabel,
  cellsToSlots,
  clearAll,
  copyDayToWeekdays,
  countSelected,
  slotsToCells,
  toggleCell,
  type Cells,
} from "./availability/slots";

const COLS = BANDS.length;
const ROWS = DAY_NAMES.length;

/*
 * Semantics: one role="grid" (aria-label) with a column-header row (visible from sm up) and seven
 * role="row"s, each with a role="rowheader" (the day) and six role="gridcell"s. Each gridcell wraps one
 * <button>; its accessible name (day, band, hours) is stable and the state is aria-pressed; the visible
 * check glyph shows the state too. Roving tabindex: only one button is in the tab order.
 * Keys: arrows move (no wrap), Home/End = row start/end, Ctrl+Home/End = first/last cell, Space/Enter toggle.
 */
export function AvailabilityGrid({ initial, timezone }: { initial: AvailabilitySlot[]; timezone: string }) {
  const [state, formAction, pending] = useActionState(saveAvailability, INITIAL_PROFILE_STATE);
  const initialKey = JSON.stringify(initial);
  const { cells: initialCells, customCount } = useMemo(() => slotsToCells(initial), [initial]);
  const [cells, setCells] = useState<Cells>(initialCells);
  const [edits, setEdits] = useState(0);
  const [submittedEdits, setSubmittedEdits] = useState(-1);
  const [seenKey, setSeenKey] = useState(initialKey);
  // The saved data changed (revalidation after a save): start from it, and keep "saved" showing.
  if (seenKey !== initialKey) {
    setSeenKey(initialKey);
    setCells(initialCells);
    setEdits(0);
    setSubmittedEdits(state.status === "saved" ? 0 : -1);
  }
  const [focus, setFocus] = useState({ r: 0, c: 0 });
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  // Until the user changes something, Save sends the original slots untouched (custom ranges survive).
  const payload = JSON.stringify(edits === 0 ? initial : cellsToSlots(cells));
  const total = countSelected(cells);

  const change = (next: Cells) => {
    setCells(next);
    setEdits((n) => n + 1);
  };

  const moveTo = (r: number, c: number) => {
    const row = Math.max(0, Math.min(ROWS - 1, r));
    const col = Math.max(0, Math.min(COLS - 1, c));
    setFocus({ r: row, c: col });
    refs.current[row * COLS + col]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, r: number, c: number) => {
    switch (e.key) {
      case "ArrowRight": moveTo(r, c + 1); break;
      case "ArrowLeft": moveTo(r, c - 1); break;
      case "ArrowDown": moveTo(r + 1, c); break;
      case "ArrowUp": moveTo(r - 1, c); break;
      case "Home": if (e.ctrlKey) moveTo(0, 0); else moveTo(r, 0); break;
      case "End": if (e.ctrlKey) moveTo(ROWS - 1, COLS - 1); else moveTo(r, COLS - 1); break;
      default: return;
    }
    e.preventDefault();
  };

  const showSaved = state.status === "saved" && submittedEdits === edits;
  const errorItems: FormAlertItem[] = state.fieldErrors?.slots ? [{ id: "availability-grid", text: state.fieldErrors.slots }] : [];
  const quick = "min-h-11 rounded-pill bg-plum-2 px-4 py-1 text-[15px] font-semibold text-cream ring-1 ring-inset ring-lavender hover:bg-plum";

  return (
    <form
      action={formAction}
      onSubmit={() => setSubmittedEdits(edits)}
      className="space-y-4 rounded-frame bg-dusk p-3 text-cream [--focus-ring:var(--color-cream)] sm:p-4"
      aria-labelledby="availability-title"
    >
      <div>
        <h3 id="availability-title" className="font-display text-xl font-bold text-cream">
          When are you usually around the campfire?
        </h3>
        <p className="mt-1 text-[15px] text-lilac">
          Tap the parts of the day you tend to be free. Times are in {timezone}.
        </p>
      </div>

      {customCount > 0 ? (
        <p className="rounded-frame border-2 border-ember bg-plum p-3 text-[15px] text-cream">
          You have {customCount} custom time {customCount === 1 ? "range" : "ranges"} that
          don&apos;t fit the grid; saving will replace {customCount === 1 ? "it" : "them"} with the grid.
          {edits === 0 ? " Until you change something, saving keeps them as they are." : ""}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2" role="group" aria-label="Quick actions">
        <button type="button" className={quick} onClick={() => change(clearAll())}>
          Clear all
        </button>
        <button type="button" className={quick} onClick={() => change(copyDayToWeekdays(cells))}>
          Copy Monday to weekdays
        </button>
        <button type="button" className={quick} onClick={() => change(addWeekdayEvenings(cells))}>
          Weekday evenings
        </button>
      </div>

      <div
        id="availability-grid"
        role="grid"
        aria-label="Weekly availability"
        aria-describedby="availability-help"
        tabIndex={-1}
        className="space-y-3 sm:space-y-2"
      >
        <div role="row" className="hidden gap-2 sm:grid sm:grid-cols-[7rem_repeat(6,minmax(0,1fr))]">
          <span role="columnheader" className="sr-only">
            Day
          </span>
          {BANDS.map((b) => (
            <span key={b.id} role="columnheader" className="px-1 text-center text-[15px] leading-tight text-cream">
              <span className="block font-semibold">{b.label}</span>
              <span className="block text-lilac">
                {b.start}-{b.end}
              </span>
            </span>
          ))}
        </div>

        {DAY_NAMES.map((day, r) => (
          <div
            key={day}
            role="row"
            className="grid grid-cols-2 items-stretch gap-2 min-[480px]:grid-cols-3 sm:grid-cols-[7rem_repeat(6,minmax(0,1fr))]"
          >
            <span role="rowheader" className="col-span-2 min-[480px]:col-span-3 self-center font-display text-base font-bold text-cream sm:col-span-1">
              {day}
            </span>
            {BANDS.map((b, c) => {
              const selected = cells[r][c];
              return (
                <div key={b.id} role="gridcell" className="min-w-0">
                  <button
                    type="button"
                    ref={(el) => {
                      refs.current[r * COLS + c] = el;
                    }}
                    tabIndex={focus.r === r && focus.c === c ? 0 : -1}
                    aria-label={cellLabel(r, c)}
                    aria-pressed={selected}
                    onClick={() => change(toggleCell(cells, r, c))}
                    onFocus={() => setFocus({ r, c })}
                    onKeyDown={(e) => onKeyDown(e, r, c)}
                    className={[
                      "flex h-full min-h-12 w-full flex-col items-center justify-center gap-0.5 rounded-chip px-1 py-1 text-[15px] leading-tight [overflow-wrap:anywhere]",
                      "transition-colors duration-100 motion-reduce:transition-none",
                      selected
                        ? "bg-sfc-green font-bold text-ink ring-2 ring-inset ring-ink"
                        : "bg-plum text-cream ring-2 ring-inset ring-lavender hover:bg-plum-2",
                    ].join(" ")}
                  >
                    <span aria-hidden="true" className="flex items-center gap-1 sm:min-h-4">
                      {selected ? <Sprite name="icon-check" /> : null}
                      <span className="sm:hidden">{b.label}</span>
                    </span>
                    <span aria-hidden="true" className="text-sm sm:hidden">
                      {b.start}-{b.end}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <p id="availability-help" className="text-[15px] text-lilac">
        Arrow keys move around the grid, Space or Enter toggles a time. Home and End jump to the ends of a day.{" "}
        {total === 0 ? "Nothing picked yet." : `${total} time ${total === 1 ? "band" : "bands"} picked.`}
      </p>

      <input type="hidden" name="slots" value={payload} />

      <FormAlert
        message={state.status === "error" ? state.message : undefined}
        items={errorItems}
        focusKey={state}
        headingLevel={4}
      />

      <div className="flex flex-wrap items-center gap-3">
        <PendingButton type="submit" variant="green" pending={pending} pendingLabel="Saving availability">
          <Sprite name="icon-save" />
          Save availability
        </PendingButton>
        <p role="status" className="text-[15px] font-semibold text-cream">
          {showSaved ? (
            <span className="inline-flex items-center gap-2">
              <Sprite name="icon-check" />
              Availability saved.
            </span>
          ) : null}
        </p>
      </div>
    </form>
  );
}
