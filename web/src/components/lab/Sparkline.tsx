/** A tiny bar strip of the first numbers of an embedding. The bars are relative to the largest of them. */
export function Sparkline({ values, total }: { values: number[]; total: number }) {
  const max = Math.max(...values.map((v) => Math.abs(v)), 1e-9);
  const w = 14;
  const h = 40;
  const label = `First ${values.length} of ${total} numbers: ${values.map((v) => v.toFixed(3)).join(", ")}`;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <svg role="img" aria-label={label} width={values.length * w} height={h} viewBox={`0 0 ${values.length * w} ${h}`}>
        <line x1="0" x2={values.length * w} y1={h / 2} y2={h / 2} stroke="currentColor" strokeOpacity="0.4" />
        {values.map((v, i) => {
          const bar = (Math.abs(v) / max) * (h / 2 - 2);
          return (
            <rect
              key={i}
              x={i * w + 2}
              width={w - 4}
              y={v >= 0 ? h / 2 - bar : h / 2}
              height={Math.max(bar, 1)}
              fill={v >= 0 ? "var(--color-ember)" : "var(--color-lavender)"}
            />
          );
        })}
      </svg>
      <span className="font-mono text-xs">
        {values.map((v) => v.toFixed(3)).join("  ")} <span className="font-body">+{Math.max(0, total - values.length)} more</span>
      </span>
    </div>
  );
}
