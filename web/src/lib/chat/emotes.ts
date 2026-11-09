// Pure emote tokenizer. Messages store plain text such as ":gg:"; sprites are a display-time concern.
import { EMOTES, type EmoteToken } from "./types";

export type TextPart = { kind: "text"; text: string };
export type EmotePart = { kind: "emote"; token: EmoteToken; sprite: string };
export type MessagePart = TextPart | EmotePart;

const TOKENS = Object.keys(EMOTES) as EmoteToken[];

export function isEmoteToken(s: string): s is EmoteToken {
  return Object.prototype.hasOwnProperty.call(EMOTES, s);
}

/** Split text into text and emote parts. Unknown ":words:" stay as text; adjacent text is merged. */
export function tokenizeEmotes(text: string): MessagePart[] {
  const parts: MessagePart[] = [];
  let buf = "";
  let i = 0;
  const flush = () => {
    if (buf !== "") parts.push({ kind: "text", text: buf });
    buf = "";
  };
  while (i < text.length) {
    if (text[i] === ":") {
      const token = TOKENS.find((t) => text.startsWith(t, i));
      if (token) {
        flush();
        parts.push({ kind: "emote", token, sprite: EMOTES[token] });
        i += token.length;
        continue;
      }
    }
    buf += text[i];
    i += 1;
  }
  flush();
  return parts;
}
