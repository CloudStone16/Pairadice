"use client";

import { useState } from "react";
import { Sprite } from "@/components/ui";
import { TextField } from "./TextField";

export function PasswordField({
  id = "password",
  autoComplete,
  hint,
  error,
}: {
  id?: string;
  autoComplete: "current-password" | "new-password";
  hint?: string;
  error?: string;
}) {
  const [shown, setShown] = useState(false);
  return (
    <TextField
      id={id}
      name="password"
      label="Password"
      icon="icon-key"
      inputType={shown ? "text" : "password"}
      autoComplete={autoComplete}
      hint={hint}
      error={error}
      maxLength={1024}
      trailing={
        <button
          type="button"
          aria-pressed={shown}
          aria-controls={id}
          aria-label="Show password"
          onClick={() => setShown((s) => !s)}
          className="flex h-9 w-9 items-center justify-center rounded-chip bg-parchment-dark ring-1 ring-inset ring-wood/60 hover:bg-parchment-dark/70"
        >
          <Sprite name={shown ? "icon-eye-off" : "icon-eye"} />
        </button>
      }
    />
  );
}
