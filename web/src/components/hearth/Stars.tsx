import { Sprite } from "@/components/ui";

/** A single star: empty, half or full. The earned part is the sprite clipped to the left edge. */
function Star({ fill }: { fill: 0 | 0.5 | 1 }) {
  return (
    <span className="relative inline-flex h-8 w-8 shrink-0">
      <Sprite name="icon-star" scale={2} className="absolute inset-0 opacity-25 grayscale" />
      {fill > 0 ? (
        <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
          <Sprite name="icon-star" scale={2} className="block max-w-none" />
        </span>
      ) : null}
    </span>
  );
}

/** 1-5 star rating in half-star steps (4.5 reads as four and a half), with the number beside it. */
export function Stars({ value }: { value: number | null }) {
  const clamped = value === null ? 0 : Math.max(0, Math.min(5, value));
  const halves = Math.round(clamped * 2) / 2;
  const label = value === null ? "No ratings yet" : `Rated ${value.toFixed(1)} out of 5`;
  return (
    <span role="img" aria-label={label} className="inline-flex items-center gap-2">
      <span className="inline-flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} fill={halves >= i ? 1 : halves >= i - 0.5 ? 0.5 : 0} />
        ))}
      </span>
      {value !== null ? (
        <span aria-hidden="true" className="font-display text-xl font-semibold tabular-nums">
          {value.toFixed(1)}
        </span>
      ) : null}
    </span>
  );
}
