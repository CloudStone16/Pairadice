"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signInAction } from "@/app/(auth)/actions";
import { AUTH_NEXT_FIELD, INITIAL_AUTH_STATE, PASSWORD_MAX_LENGTH } from "@/lib/auth/form-state";
import { DiscordButton } from "./DiscordButton";
import { Field, inputClasses } from "./Field";
import { ErrorSummary, OrDivider, useFocusOnError } from "./FormParts";
import { PasswordInput } from "./PasswordInput";
import { SubmitButton } from "./SubmitButton";

export function SignInForm({ next, discordEnabled }: { next?: string; discordEnabled: boolean }) {
  const [state, action] = useActionState(signInAction, INITIAL_AUTH_STATE);
  const { formRef, summaryRef } = useFocusOnError(state);
  const fe = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const values = state.status === "error" ? (state.values ?? {}) : {};

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4">
      <ErrorSummary
        state={state}
        summaryRef={summaryRef}
        fieldIds={{ email: "signin-email", password: "signin-password" }}
      />
      {next ? <input type="hidden" name={AUTH_NEXT_FIELD} value={next} /> : null}
      <Field id="signin-email" label="Email" icon="icon-mail" error={fe.email}>
        {(aria) => (
          <input
            id="signin-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            defaultValue={values.email ?? ""}
            key={`e${values.email ?? ""}`}
            className={inputClasses}
            {...aria}
          />
        )}
      </Field>
      <Field id="signin-password" label="Password" icon="icon-key" error={fe.password}>
        {(aria) => <PasswordInput
            id="signin-password"
            name="password"
            autoComplete="current-password"
            maxLength={PASSWORD_MAX_LENGTH}
            {...aria}
          />}
      </Field>
      <SubmitButton>Start</SubmitButton>
      <OrDivider />
      <DiscordButton enabled={discordEnabled} />
      <p className="text-center text-base">
        New here?{" "}
        <Link href="/signup" className="font-bold underline underline-offset-4">
          Create a character
        </Link>
      </p>
    </form>
  );
}
