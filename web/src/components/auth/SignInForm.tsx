"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn } from "@/app/(auth)/actions";
import { Button, Sprite } from "@/components/ui";
import { initialAuthState } from "@/lib/auth/form-state";
import { FormAlert } from "./FormAlert";
import { PasswordField } from "./PasswordField";
import { TextField } from "./TextField";

export function SignInForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signIn, initialAuthState);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate={false}>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <FormAlert message={state.message} />
      <TextField
        id="email"
        name="email"
        label="Email"
        type="email"
        icon="icon-mail"
        autoComplete="email"
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
        maxLength={254}
      />
      <PasswordField autoComplete="current-password" error={state.fieldErrors?.password} />
      <Button type="submit" variant="yellow" disabled={pending} aria-disabled={pending} className="w-full">
        <Sprite name="icon-door" />
        {pending ? "Opening the door..." : "Sign in"}
      </Button>

      <div className="flex flex-col gap-1.5 border-t-2 border-dashed border-wood/40 pt-4">
        <Button type="button" variant="ghost" disabled aria-describedby="discord-note" className="w-full">
          <Sprite name="icon-discord" />
          Continue with Discord
        </Button>
        <p id="discord-note" className="text-center text-[15px] text-wood-dark">
          Discord sign-in is coming soon.
        </p>
      </div>

      <p className="text-center text-base text-ink">
        New to the cabin?{" "}
        <Link href="/sign-up" className="font-bold underline underline-offset-4 hover:text-wood-dark">
          Create an account
        </Link>
      </p>
    </form>
  );
}
