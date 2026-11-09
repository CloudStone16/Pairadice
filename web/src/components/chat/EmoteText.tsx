import { Sprite } from "@/components/ui";
import { tokenizeEmotes } from "@/lib/chat/emotes";
import { isSpriteName } from "@/lib/sprite-names";

/**
 * Message text as text. Emote tokens become sprites (labelled with the token) when the sprite exists,
 * otherwise the token stays visible text. No HTML, markdown or links: React escapes everything.
 */
export function EmoteText({ text }: { text: string }) {
  return (
    <>
      {tokenizeEmotes(text).map((p, i) =>
        p.kind === "text" ? (
          <span key={i}>{p.text}</span>
        ) : isSpriteName(p.sprite) ? (
          <Sprite key={i} name={p.sprite} scale={2} alt={p.token} className="mx-0.5 -my-1" />
        ) : (
          <span key={i}>{p.token}</span>
        ),
      )}
    </>
  );
}
