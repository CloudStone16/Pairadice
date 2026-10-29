/**
 * PairADice sprite builder.
 *
 *   bun scripts/build-sprites.ts
 *
 * Reads  sprites/src/<name>.json
 *   { "size": 16 | 32, "palette": { "<char>": "#rrggbb" }, "rows": ["..."], "notes"?: "..." }
 * Writes public/sprites/<name>.svg, public/sprites/_preview.html,
 *        src/lib/sprites.generated.ts and src/app/icon.svg.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SPRITE_NAMES } from "../src/lib/sprite-names";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = join(ROOT, "sprites", "src");
const OUT_DIR = join(ROOT, "public", "sprites");
const GENERATED_FILE = join(ROOT, "src", "lib", "sprites.generated.ts");
const ICON_FILE = join(ROOT, "src", "app", "icon.svg");
const HEX = /^#[0-9a-fA-F]{6}$/;
const MAX_COLOURS = 8;
const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

interface Sprite {
  name: string;
  size: 16 | 32;
  palette: Record<string, string>;
  rows: string[];
}

const errors: string[] = [];
const warnings: string[] = [];
const fail = (file: string, msg: string): void => {
  errors.push(`${file}: ${msg}`);
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Writes only when the content differs, so unchanged builds leave mtimes (and watchers) alone. */
function writeIfChanged(path: string, content: string): boolean {
  if (existsSync(path) && readFileSync(path, "utf8") === content) return false;
  writeFileSync(path, content);
  return true;
}

/** Plain code-unit comparison: deterministic regardless of locale. */
function compareNames(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function loadSprite(file: string): Sprite | null {
  const name = file.replace(/\.json$/, "");
  const label = `sprites/src/${file}`;
  if (!NAME_RE.test(name)) {
    fail(label, `sprite name "${name}" must match ${NAME_RE} (lowercase words joined by hyphens)`);
    return null;
  }
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(join(SRC_DIR, file), "utf8"));
  } catch (e) {
    fail(label, `invalid JSON (${e instanceof Error ? e.message : String(e)})`);
    return null;
  }
  if (!isRecord(data)) {
    fail(label, "top-level value must be an object");
    return null;
  }
  const before = errors.length;
  const size = data.size;
  if (size !== 16 && size !== 32) {
    fail(label, `"size" must be 16 or 32 (got ${JSON.stringify(size)})`);
    return null;
  }
  const paletteRaw = data.palette;
  const palette: Record<string, string> = {};
  if (!isRecord(paletteRaw)) {
    fail(label, `"palette" must be an object`);
    return null;
  }
  for (const [key, value] of Object.entries(paletteRaw)) {
    if ([...key].length !== 1) fail(label, `palette key "${key}" must be a single character`);
    if (key === ".") fail(label, `palette key "." is reserved for transparency`);
    if (typeof value !== "string" || !HEX.test(value)) {
      fail(label, `palette "${key}" has invalid hex colour ${JSON.stringify(value)} (want #rrggbb)`);
    } else {
      palette[key] = value.toLowerCase();
    }
  }
  const rowsRaw = data.rows;
  if (!Array.isArray(rowsRaw) || !rowsRaw.every((r): r is string => typeof r === "string")) {
    fail(label, `"rows" must be an array of strings`);
    return null;
  }
  if (rowsRaw.length !== size) fail(label, `expected ${size} rows, found ${rowsRaw.length}`);
  rowsRaw.forEach((row, y) => {
    const chars = [...row];
    if (chars.length !== size) {
      fail(label, `row ${y} has width ${chars.length}, expected ${size}`);
    }
    chars.forEach((ch, x) => {
      if (ch !== "." && !(ch in palette)) {
        fail(label, `row ${y} col ${x}: unknown palette char "${ch}"`);
      }
    });
  });
  const used = new Set(rowsRaw.join("").split("").filter((c) => c !== "."));
  if (used.size > MAX_COLOURS) {
    warnings.push(`${label}: uses ${used.size} colours (target is <= ${MAX_COLOURS})`);
  }
  if (errors.length > before) return null;
  return { name, size, palette, rows: rowsRaw };
}

/** One <rect> per horizontal run of same-colour pixels, row-major order. */
function toSvg(s: Sprite): string {
  const rects: string[] = [];
  s.rows.forEach((row, y) => {
    const chars = [...row];
    let x = 0;
    while (x < chars.length) {
      const ch = chars[x];
      if (ch === ".") {
        x++;
        continue;
      }
      let end = x + 1;
      while (end < chars.length && chars[end] === ch) end++;
      rects.push(`<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${s.palette[ch]}"/>`);
      x = end;
    }
  });
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s.size} ${s.size}" ` +
    `width="${s.size}" height="${s.size}" shape-rendering="crispEdges">\n` +
    rects.join("\n") +
    `\n</svg>\n`
  );
}

const GROUPS: { title: string; test: (n: string) => boolean }[] = [
  { title: "Mascot", test: (n) => n.startsWith("dice-") },
  { title: "Cartridges", test: (n) => n.startsWith("cart-") },
  { title: "Avatars", test: (n) => n.startsWith("avatar-") },
  { title: "Icons", test: (n) => n.startsWith("icon-") },
  { title: "Decorations", test: (n) => n.startsWith("deco-") },
];

function previewHtml(sprites: Sprite[]): string {
  const img = (n: string, px: number): string =>
    `<img src="${n}.svg" width="${px}" height="${px}" alt="${n}">`;
  const card = (s: Sprite): string =>
    `<figure><div class="row">${[1, 2, 4].map((k) => img(s.name, s.size * k)).join("")}</div>` +
    `<figcaption>${s.name} <span>${s.size}px</span></figcaption></figure>`;
  const byName = new Map(sprites.map((s) => [s.name, s]));
  const sections: string[] = [];
  for (const g of GROUPS) {
    const list = sprites.filter((s) => g.test(s.name));
    if (list.length) sections.push(`<h2>${g.title}</h2><div class="grid">${list.map(card).join("")}</div>`);
  }
  const frames = [1, 2, 3, 4].map((i) => byName.get(`campfire-${i}`)).filter((s): s is Sprite => !!s);
  if (frames.length === 4) {
    const stack = (k: number): string =>
      `<div class="fire" style="width:${32 * k}px;height:${32 * k}px">` +
      frames.map((f, i) => `<img src="${f.name}.svg" width="${32 * k}" height="${32 * k}" alt="" style="animation-delay:${(i * 0.15).toFixed(2)}s">`).join("") +
      `</div>`;
    sections.push(
      `<h2>Campfire</h2><div class="grid"><figure><div class="row">${stack(1)}${stack(2)}${stack(4)}</div><figcaption>animated (4 frames, 0.15s each)</figcaption></figure>` +
        frames.map(card).join("") +
        `</div>`,
    );
  }
  const tiles = sprites.filter((s) => s.name.startsWith("tile-"));
  if (tiles.length) {
    sections.push(
      `<h2>Tiles (4 x 4, shown at 4x)</h2><div class="grid">` +
        tiles
          .map(
            (t) =>
              `<figure><div class="tiled" style="width:${t.size * 16}px;height:${t.size * 16}px;background-image:url(${t.name}.svg);background-size:${t.size * 4}px ${t.size * 4}px"></div>` +
              `<figcaption>${t.name} <span>${t.size}px</span></figcaption></figure>`,
          )
          .join("") +
        `</div>`,
    );
  }
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>PairADice sprite sheet</title>
<style>
  body { margin: 0; padding: 24px; background: #2a2342; color: #f3ead3; font: 14px/1.4 ui-monospace, Menlo, monospace; }
  h1 { margin: 0 0 4px; } p { color: #a094d6; margin: 0 0 20px; }
  h2 { margin: 28px 0 10px; color: #f2c35b; font-size: 15px; border-bottom: 1px solid #43386a; padding-bottom: 4px; }
  .grid { display: flex; flex-wrap: wrap; gap: 14px; }
  figure { margin: 0; padding: 10px; background: #352c52; border: 1px solid #43386a; }
  .row { display: flex; align-items: flex-end; gap: 14px; }
  figcaption { margin-top: 8px; font-size: 12px; } figcaption span { color: #a094d6; }
  img, .tiled, .fire { image-rendering: pixelated; }
  .tiled { background-repeat: repeat; }
  .fire { position: relative; }
  .fire img { position: absolute; left: 0; top: 0; opacity: 0; animation: cf 0.6s steps(1, end) infinite; }
  @keyframes cf { 0% { opacity: 1; } 25% { opacity: 0; } 100% { opacity: 0; } }
</style></head><body>
<h1>PairADice sprites</h1><p>${sprites.length} sprites, generated by scripts/build-sprites.ts. Do not edit.</p>
${sections.join("\n")}
</body></html>
`;
}

function main(): void {
  const wanted: string[] = [...SPRITE_NAMES];
  for (const n of wanted) {
    if (!NAME_RE.test(n)) errors.push(`contract sprite name "${n}" must match ${NAME_RE}`);
  }
  if (!existsSync(SRC_DIR)) {
    console.error(`missing source directory ${SRC_DIR}`);
    process.exit(1);
  }
  const files = readdirSync(SRC_DIR).filter((f) => f.endsWith(".json")).sort(compareNames);
  const sprites: Sprite[] = [];
  for (const f of files) {
    const s = loadSprite(f);
    if (s) sprites.push(s);
  }
  const have = new Set(files.map((f) => f.replace(/\.json$/, "")));
  for (const n of wanted) {
    if (!have.has(n)) errors.push(`contract sprite "${n}" has no source file sprites/src/${n}.json`);
  }
  for (const n of have) {
    if (!wanted.includes(n)) warnings.push(`sprites/src/${n}.json is not in the contract (sprite-names.ts)`);
  }

  if (errors.length) {
    console.error(`\nSprite build FAILED with ${errors.length} error(s):`);
    for (const e of errors) console.error(`  x ${e}`);
    for (const w of warnings) console.warn(`  ! ${w}`);
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const order = new Map(wanted.map((n, i) => [n, i]));
  sprites.sort((a, b) => (order.get(a.name) ?? 1e6) - (order.get(b.name) ?? 1e6) || compareNames(a.name, b.name));
  for (const s of sprites) writeIfChanged(join(OUT_DIR, `${s.name}.svg`), toSvg(s));
  // drop SVGs whose source file no longer exists
  const keep = new Set(sprites.map((s) => `${s.name}.svg`));
  let removed = 0;
  for (const f of readdirSync(OUT_DIR)) {
    if (f.endsWith(".svg") && !keep.has(f)) {
      unlinkSync(join(OUT_DIR, f));
      removed++;
    }
  }

  const entries = sprites.map((s) => `  ${JSON.stringify(s.name)}: { size: ${s.size} },`).join("\n");
  writeIfChanged(
    GENERATED_FILE,
    `// AUTO-GENERATED by scripts/build-sprites.ts. Do not edit.\n` +
      `export const SPRITES = {\n${entries}\n} as const;\n\n` +
      `export type BuiltSpriteName = keyof typeof SPRITES;\n`,
  );
  writeIfChanged(join(OUT_DIR, "_preview.html"), previewHtml(sprites));

  const dice = sprites.find((s) => s.name === "dice-32");
  if (dice) writeIfChanged(ICON_FILE, toSvg(dice));

  for (const w of warnings) console.warn(`  ! ${w}`);
  const d16 = sprites.filter((s) => s.size === 16).length;
  console.log(
    `sprites: built ${sprites.length}/${wanted.length} contract sprites ` +
      `(${d16} at 16px, ${sprites.length - d16} at 32px), ${warnings.length} warning(s), 0 errors` +
      (removed > 0 ? `, ${removed} stale svg(s) removed` : ""),
  );
  console.log(`  svg -> public/sprites/   types -> src/lib/sprites.generated.ts   preview -> /sprites/_preview.html`);
}

main();
