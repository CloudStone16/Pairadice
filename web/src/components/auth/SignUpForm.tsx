"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { signUp } from "@/app/(auth)/actions";
import { PendingButton, Sprite } from "@/components/ui";
import { initialAuthState } from "@/lib/auth/form-state";
import { FormAlert, authErrorItems } from "./FormAlert";
import { PasswordField } from "./PasswordField";
import { TextField } from "./TextField";

export function SignUpForm() {
  const [state, action, pending] = useActionState(signUp, initialAuthState);
  const fe = state.fieldErrors;
  const [timezone, setTimezone] = useState("");
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only value, unavailable during SSR
      setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "");
    } catch {
      setTimezone("");
    }
  }, []);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="timezone" value={timezone} />
      <FormAlert message={state.message} items={authErrorItems(fe)} focusKey={state} />
      <TextField
        id="username"
        name="username"
        label="Username"
        icon="icon-character"
        autoComplete="username"
        hint="3 to 32 letters, digits or underscores."
        defaultValue={state.values?.username}
        error={fe?.username}
        maxLength={32}
      />
      <TextField
        id="displayName"
        name="displayName"
        label="Display name"
        icon="icon-star"
        autoComplete="nickname"
        defaultValue={state.values?.displayName}
        error={fe?.displayName}
        maxLength={64}
      />
      <TextField
        id="email"
        name="email"
        label="Email"
        type="email"
        icon="icon-mail"
        autoComplete="email"
        defaultValue={state.values?.email}
        error={fe?.email}
        maxLength={254}
      />
      <PasswordField autoComplete="new-password" hint="At least 10 characters." error={fe?.password} />
      <PendingButton type="submit" variant="green" pending={pending} pendingLabel="Packing your bags" className="w-full">
        <Sprite name="icon-door" />
        {pending ? "Packing your bags..." : "Create account"}
      </PendingButton>
      <p className="text-center text-base text-ink">
        Already have a character?{" "}
        <Link href="/sign-in" className="font-bold underline underline-offset-4 hover:text-wood-dark">
          Sign in
        </Link>
      </p>
    </form>
  );
}
