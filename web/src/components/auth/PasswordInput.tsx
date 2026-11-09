"use client";

import { useState } from "react";
import { Sprite } from "@/components/ui";
import { inputClasses } from "./Field";

export function PasswordInput({
  id,
  name,
  autoComplete,
  minLength,
  maxLength,
  ...aria
}: {
  id: string;
  name: string;
  autoComplete: "current-password" | "new-password";
  minLength?: number;
  maxLength?: number;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={shown ? "text" : "password"}
        autoComplete={autoComplete}
        autoCapitalize="none"
        spellCheck={false}
        required
        minLength={minLength}
        maxLength={maxLength}
        className={`${inputClasses} pr-12`}
        {...aria}
      />
      <button
        type="button"
        aria-pressed={shown}
        aria-label="Show password"
        aria-controls={id}
        onClick={() => setShown((v) => !v)}
        className="absolute right-1 top-1/2 flex size-10 min-h-6 min-w-6 -translate-y-1/2 items-center justify-center rounded-chip bg-parchment-dark text-ink ring-1 ring-inset ring-wood/60 hover:bg-parchment"
      >
        <Sprite name={shown ? "icon-eye-off" : "icon-eye"} scale={2} />
      </button>
    </div>
  );
}
