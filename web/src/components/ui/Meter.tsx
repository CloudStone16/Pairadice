export interface MeterProps {
  /** 0-100 */
  value: number;
  label: string;
  /** Show the numeric value next to the label. Default true. */
  showValue?: boolean;
  className?: string;
}

export function meterColor(value: number): string {
  if (value < 35) return "bg-sfc-red";
  if (value < 65) return "bg-sfc-yellow";
  return "bg-sfc-green";
}

export function Meter({ value, label, showValue = true, className = "" }: MeterProps) {
  const v = Math.min(100, Math.max(0, Math.round(Number.isFinite(value) ? value : 0)));
  return (
    <div className={`w-full ${className}`}>
      <div className="mb-1 flex items-baseline justify-between font-display text-sm font-medium">
        <span>{label}</span>{" "}
        {showValue ? <span className="tabular-nums text-lavender">{v}</span> : null}
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuenow={v}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${v} out of 100`}
        className="h-3.5 overflow-hidden rounded-pill bg-ink p-[2px] ring-1 ring-lavender/40 forced-colors:border forced-colors:border-[CanvasText]"
      >
        <div
          className={`h-full rounded-pill transition-[width] duration-500 ease-out shadow-[inset_0_2px_0_rgb(255_255_255/0.4)] forced-colors:bg-[Highlight] ${meterColor(v)}`}
          style={{ width: `${v}%` }}
        />
      </div>
    </div>
  );
}
