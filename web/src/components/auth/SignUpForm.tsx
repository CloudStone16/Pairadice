"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUpAction } from "@/app/(auth)/actions";
import {
  AUTH_NEXT_FIELD, INITIAL_AUTH_STATE,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_PATTERN,
} from "@/lib/auth/form-state";
import { DiscordButton } from "./DiscordButton";
import { Field, inputClasses } from "./Field";
import { ErrorSummary, OrDivider, useFocusOnError } from "./FormParts";
import { PasswordInput } from "./PasswordInput";
import { SubmitButton } from "./SubmitButton";

// the pattern attribute is implicitly anchored, so drop ^ and $
const USERNAME_ATTR = USERNAME_PATTERN.source.replace(/^\^|\$$/g, "");

export function SignUpForm({ next, discordEnabled }: { next?: string; discordEnabled: boolean }) {
  const [state, action] = useActionState(signUpAction, INITIAL_AUTH_STATE);
  const { formRef, summaryRef } = useFocusOnError(state);
  const fe = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const values = state.status === "error" ? (state.values ?? {}) : {};

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4">
      <ErrorSummary
        state={state}
        summaryRef={summaryRef}
        fieldIds={{
          email: "signup-email",
          username: "signup-username",
          displayName: "signup-display",
          password: "signup-password",
          confirm: "signup-confirm",
        }}
      />
      {next ? <input type="hidden" name={AUTH_NEXT_FIELD} value={next} /> : null}
      <Field id="signup-email" label="Email" icon="icon-mail" error={fe.email}>
        {(aria) => (
          <input
            key={`e${values.email ?? ""}`}
            id="signup-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            defaultValue={values.email ?? ""}
            className={inputClasses}
            {...aria}
          />
        )}
      </Field>
      <Field
        id="signup-username"
        label="Username"
        hint="3–32 letters, numbers or underscores."
        error={fe.username}
      >
        {(aria) => (
          <input
            key={`u${values.username ?? ""}`}
            id="signup-username"
            name="username"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            minLength={3}
            maxLength={32}
            pattern={USERNAME_ATTR}
            defaultValue={values.username ?? ""}
            className={inputClasses}
            {...aria}
          />
        )}
      </Field>
      <Field id="signup-display" label="Display name" hint="What your party sees." error={fe.displayName}>
        {(aria) => (
          <input
            key={`d${values.displayName ?? ""}`}
            id="signup-display"
            name="displayName"
            type="text"
            autoComplete="nickname"
            required
            maxLength={64}
            defaultValue={values.displayName ?? ""}
            className={inputClasses}
            {...aria}
          />
        )}
      </Field>
      <Field id="signup-password" label="Password" icon="icon-key" hint={`${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters.`} error={fe.password}>
        {(aria) => <PasswordInput id="signup-password" name="password" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} {...aria} />}
      </Field>
      <Field id="signup-confirm" label="Confirm password" error={fe.confirm}>
        {(aria) => <PasswordInput id="signup-confirm" name="confirm" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} {...aria} />}
      </Field>
      <SubmitButton pendingLabel="Creating…">Create character</SubmitButton>
      <OrDivider />
      <DiscordButton enabled={discordEnabled} />
      <p className="text-center text-base">
        Already have a character?{" "}
        <Link href="/signin" className="font-bold underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </form>
  );
}
