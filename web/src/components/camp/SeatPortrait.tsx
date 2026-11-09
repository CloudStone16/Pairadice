"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar, Sprite } from "@/components/ui";
import type { SpriteName } from "@/lib/sprite-names";

// Players this browser has seen knocking. When one of them shows up accepted, their seat plays a short
// pop animation. Module scope on purpose: the knock seat and the accepted seat are different elements.
const seenKnocking = new Set<string>();

const FRAMES: SpriteName[] = ["seat-pop-1", "seat-pop-2", "seat-pop-3", "seat-filled"];
const STEP_MS = 150; // 4 frames, 600 ms in total

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The avatar of a seat. For a knocking player it remembers them; for an accepted one it may play the seat-pop. */
export function SeatPortrait({
  sessionId,
  userId,
  state,
  size = 64,
}: {
  sessionId: number;
  userId: number;
  state: "knocking" | "accepted";
  size?: 32 | 64;
}) {
  const key = `${sessionId}:${userId}`;
  // decided once, when the accepted seat first renders in this browser after the knock was seen
  const [popping, setPopping] = useState(
    () => state === "accepted" && seenKnocking.has(key) && !prefersReducedMotion(),
  );
  const layers = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    if (state === "knocking") seenKnocking.add(key);
    else seenKnocking.delete(key);
  }, [state, key]);

  // runs once the frame layers are mounted: each frame shows for STEP_MS, transform and opacity only
  useEffect(() => {
    if (!popping) return;
    const anims = layers.current.flatMap((el, i) =>
      el
        ? [
            el.animate(
              [
                { opacity: 0, transform: "scale(0.9)" },
                { opacity: 1, transform: "scale(1.05)", offset: 0.3 },
                { opacity: 1, transform: "scale(1)", offset: 0.85 },
                { opacity: 0, transform: "scale(1)" },
              ],
              { duration: STEP_MS, delay: STEP_MS * i, fill: "both" },
            ),
          ]
        : [],
    );
    const done = window.setTimeout(() => setPopping(false), STEP_MS * FRAMES.length + 50);
    return () => {
      window.clearTimeout(done);
      for (const a of anims) a.cancel();
    };
  }, [popping]);

  return (
    <span className="relative inline-block shrink-0">
      <Avatar userId={userId} size={size} />
      {popping ? (
        <span aria-hidden="true" className="pointer-events-none absolute inset-0">
          {FRAMES.map((f, i) => (
            <span
              key={f}
              ref={(el) => {
                layers.current[i] = el;
              }}
              className="absolute inset-0 flex items-center justify-center opacity-0"
            >
              <Sprite name={f} scale={size === 64 ? 4 : 2} />
            </span>
          ))}
        </span>
      ) : null}
    </span>
  );
}
