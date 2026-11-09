import type { Key, ReactNode } from "react";

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
}

/**
 * A data table that becomes a stack of cards under 640 px: each cell then shows its column header as a
 * label. Table roles are set explicitly because display:block drops native table semantics in some browsers.
 */
export function ResponsiveTable<T>({
  caption,
  columns,
  rows,
  rowKey,
}: {
  caption: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => Key;
}) {
  return (
    <table role="table" className="w-full border-collapse text-left text-[15px] max-sm:block">
      <caption className="sr-only">{caption}</caption>
      <thead role="rowgroup" className="max-sm:sr-only">
        <tr role="row">
          {columns.map((c) => (
            <th
              key={c.header}
              role="columnheader"
              scope="col"
              className="px-3 pb-2 font-display text-base font-semibold text-lavender"
            >
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody role="rowgroup" className="max-sm:block">
        {rows.map((row) => (
          <tr
            key={rowKey(row)}
            role="row"
            className="border-t border-lavender/25 max-sm:mb-3 max-sm:block max-sm:rounded-frame max-sm:border max-sm:border-lavender/30 max-sm:bg-dusk/60 max-sm:p-3"
          >
            {columns.map((c) => (
              <td
                key={c.header}
                role="cell"
                data-label={c.header}
                className={`px-3 py-2.5 align-top max-sm:flex max-sm:gap-3 max-sm:px-0 max-sm:py-1 max-sm:before:w-24 max-sm:before:shrink-0 max-sm:before:font-display max-sm:before:font-semibold max-sm:before:text-lavender max-sm:before:content-[attr(data-label)] ${c.className ?? ""}`}
              >
                <div className="min-w-0 [overflow-wrap:anywhere]">{c.cell(row)}</div>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
