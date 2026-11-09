"use client";

import { useRef, useState } from "react";
import { Button, Sprite, buttonClasses } from "@/components/ui";

/** Discord invite for party members: copy (with a polite "Copied" note) and open. Rendered for members only. */
export function InviteBox({ url }: { url: string }) {
  const field = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setNote("Copied");
    } catch {
      // clipboard blocked: select the text so Ctrl+C works
      field.current?.focus();
      field.current?.select();
      setNote("Press Ctrl+C to copy the selected link");
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-frame bg-ink/30 p-4 ring-1 ring-inset ring-lavender/30">
      <label htmlFor="discord-invite" className="font-display text-sm font-semibold">
        Discord invite
      </label>
      <input
        id="discord-invite"
        ref={field}
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="min-h-11 w-full rounded-chip border-2 border-ink bg-[#fbf5e6] px-3 py-2 text-base text-ink"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={copy}>
          <Sprite name="icon-copy" />
          Copy invite
        </Button>
        <a href={url} target="_blank" rel="noopener noreferrer" className={buttonClasses("blue", "sm")}>
          <Sprite name="icon-link" />
          Open invite
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
        <p role="status" aria-live="polite" className="text-sm text-lavender">
          {note}
        </p>
      </div>
    </div>
  );
}
