/** Row of little seat markers: filled = taken. */
export function SeatPips({ filled, max, dark = false }: { filled: number; max: number; dark?: boolean }) {
  const total = Math.max(1, Math.min(max, 16));
  const taken = Math.max(0, Math.min(filled, total));
  return (
    <span
      role="img"
      aria-label={`${filled} of ${max} seats filled`}
      className="inline-flex items-center gap-1"
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`h-3 w-3 rounded-[4px] ring-1 forced-colors:border forced-colors:border-[CanvasText] ${
            i < taken
              ? dark
                ? "bg-ember ring-ink"
                : "bg-wood-dark ring-ink"
              : dark
                ? "bg-ink/40 ring-lavender/50"
                : "bg-parchment-dark ring-wood/70"
          } ${i < taken ? "forced-colors:bg-[Highlight]" : ""}`}
        />
      ))}
    </span>
  );
}
