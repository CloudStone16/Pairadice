/** Insert `token` at the caret (or over the selection), padded with a space on each side where needed. */
export function insertAtCaret(
  text: string,
  start: number,
  end: number,
  token: string,
): { text: string; caret: number } {
  const s = Math.max(0, Math.min(start, text.length));
  const e = Math.max(s, Math.min(end, text.length));
  const before = text.slice(0, s);
  const after = text.slice(e);
  const lead = before.length > 0 && !/\s$/.test(before) ? " " : "";
  const insert = `${lead}${token} `;
  const tail = after.startsWith(" ") ? after.slice(1) : after;
  return { text: before + insert + tail, caret: before.length + insert.length };
}
