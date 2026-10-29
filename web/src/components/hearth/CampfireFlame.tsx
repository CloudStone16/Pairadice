"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Sprite } from "@/components/ui";
import type { SpriteName } from "@/lib/sprite-names";

const FRAMES: SpriteName[] = ["campfire-1", "campfire-2", "campfire-3", "campfire-4"];
const FRAME_MS = 240;

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReduced(onChange: () => void): () => void {
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function subscribeVisibility(onChange: () => void): () => void {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

/**
 * Animated campfire. All four frames are rendered stacked and only the active
 * one is visible (no src swapping, so there is no blank first cycle). The fire
 * can be paused (WCAG 2.2.2); it also pauses while the tab is hidden. Under
 * prefers-reduced-motion it starts paused and the visitor can opt in to motion.
 * The button's label alone says what a press will do ("Pause fire" / "Light the fire").
 */
export function CampfireFlame({ scale = 4 }: { scale?: number }) {
  const [frame, setFrame] = useState(0);
  // null = no choice yet: follow prefers-reduced-motion
  const [choice, setChoice] = useState<boolean | null>(null);
  const reduced = useSyncExternalStore(subscribeReduced, () => window.matchMedia(REDUCED_QUERY).matches, () => false);
  const hidden = useSyncExternalStore(subscribeVisibility, () => document.visibilityState === "hidden", () => false);

  const wantsMotion = choice ?? !reduced;
  const running = wantsMotion && !hidden;

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setFrame((f) => (f + 1) % FRAMES.length), FRAME_MS);
    return () => clearInterval(timer);
  }, [running]);

  const px = 32 * Math.max(1, Math.round(scale));

  return (
    <div className="relative flex flex-col items-center gap-2">
      <div className="relative flex justify-center">
        <div
          aria-hidden="true"
          className={`absolute inset-x-0 bottom-0 mx-auto h-40 w-64 rounded-full bg-[radial-gradient(closest-side,rgb(242_166_90/0.38),transparent)] ${
            running ? "motion-safe:animate-flicker" : ""
          }`}
        />
        <div className="relative" style={{ width: px, height: px }} aria-hidden="true">
          {FRAMES.map((name, i) => (
            <Sprite
              key={name}
              name={name}
              scale={scale}
              className={`absolute left-0 top-0 ${i === frame ? "" : "invisible"}`}
            />
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setChoice(!wantsMotion)}
        className={`relative rounded-pill px-3 py-1 font-display text-sm font-semibold ring-1 transition-colors forced-colors:border forced-colors:border-[ButtonText] ${
          wantsMotion
            ? "bg-ink/60 text-cream ring-lavender/50 hover:bg-ink"
            : "bg-ember text-ink ring-ink hover:brightness-105 forced-colors:border-2 forced-colors:border-dashed"
        }`}
      >
        {wantsMotion ? "Pause fire" : "Light the fire"}
      </button>
    </div>
  );
}
