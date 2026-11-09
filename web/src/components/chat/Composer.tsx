"use client";

import { useActionState, useId, useRef, useState, useSyncExternalStore, startTransition, type KeyboardEvent, type FormEvent } from "react";
import { PendingButton, Sprite } from "@/components/ui";
import { insertAtCaret } from "@/lib/chat/caret";
import { CHAT_LIMITS, EMOTES, INITIAL_CHAT_STATE, type EmoteToken, type ChatFormState } from "@/lib/chat/types";
import { charCount } from "@/lib/chat/validate";

const noop = () => () => {};
/** false on the server and during hydration, true afterwards: the picker needs JavaScript. */
function useHydrated(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}

export type ComposerAction = (prev: ChatFormState, formData: FormData) => Promise<ChatFormState>;

const field =
  "w-full resize-y rounded-chip border-2 border-ink bg-[#fbf5e6] px-3 py-2 text-base text-ink shadow-[inset_0_2px_0_rgb(18_14_31/0.12)] placeholder:text-wood-dark aria-invalid:border-[#8a2621] aria-invalid:bg-[#fff1ec] [--focus-ring:var(--color-ink)]";

/**
 * Message composer. A plain <form action>, so it posts without JavaScript. With JavaScript the submit is
 * taken over so the text stays on failure and clears on success; Enter sends, Shift+Enter breaks a line.
 */
export function Composer({
  action,
  idField,
  idValue,
  label,
  onSent,
}: {
  action: ComposerAction;
  idField: "sessionId" | "receiverId";
  idValue: number;
  label: string;
  /** Called after a successful send (the room polls at once). */
  onSent?: () => void;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const hydrated = useHydrated();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (prev: ChatFormState, formData: FormData): Promise<ChatFormState> => {
      const result = await action(prev, formData);
      if (result.status === "sent") {
        setText("");
        onSent?.();
      }
      return result;
    },
    INITIAL_CHAT_STATE,
  );
  const n = charCount(text);
  const over = n > CHAT_LIMITS.messageMax;
  const error = state.status === "error" ? (state.fieldErrors?.content ?? state.message) : undefined;
  // no-JS fallback: the server re-renders with the failed text
  const [initialised, setInitialised] = useState(false);
  if (!initialised) {
    setInitialised(true);
    const saved = state.values?.content;
    if (saved) setText(saved);
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const data = new FormData(e.currentTarget);
    startTransition(() => formAction(data));
  }

  function insertEmote(token: EmoteToken) {
    const el = areaRef.current;
    const r = insertAtCaret(text, el?.selectionStart ?? text.length, el?.selectionEnd ?? text.length, token);
    setText(r.text);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(r.caret, r.caret);
    });
  }

  function onPickerKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.key === "Escape" && pickerOpen) {
      e.preventDefault();
      e.stopPropagation();
      setPickerOpen(false);
      toggleRef.current?.focus();
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  return (
    <form ref={formRef} action={formAction} onSubmit={submit} className="mt-4 border-t border-lavender/20 pt-4" noValidate>
      <input type="hidden" name={idField} value={idValue} />
      <label htmlFor={`${id}-content`} className="mb-1 block font-display text-base font-semibold">
        {label}
      </label>
      <textarea
        id={`${id}-content`}
        ref={areaRef}
        name="content"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-help${error ? ` ${id}-err` : ""}`}
        autoComplete="off"
        className={field}
      />
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <p id={`${id}-help`} className="text-[15px] text-lavender">
          <span className={over || n > CHAT_LIMITS.messageMax - 100 ? "font-semibold text-cream" : ""}>
            {n} / {CHAT_LIMITS.messageMax} characters
          </span>
          <span className="hidden sm:inline"> &middot; Enter sends, Shift+Enter adds a line</span>
        </p>
        {hydrated ? (
          <div onKeyDown={onPickerKeyDown}>
            <button
              ref={toggleRef}
              type="button"
              aria-expanded={pickerOpen}
              aria-controls={`${id}-emotes`}
              onClick={() => setPickerOpen((v) => !v)}
              className="inline-flex min-h-11 items-center gap-2 rounded-pill px-3 font-semibold text-lavender underline underline-offset-2 hover:bg-plum-2 hover:text-cream"
            >
              <Sprite name="icon-emoji" />
              Emotes
            </button>
          </div>
        ) : null}
        <PendingButton type="submit" variant="yellow" pending={pending} pendingLabel="Sending your message" className="ml-auto">
          <Sprite name="icon-send" />
          {pending ? "Sending..." : "Send"}
        </PendingButton>
      </div>
      {hydrated && pickerOpen ? (
        <ul
          id={`${id}-emotes`}
          aria-label="Emotes"
          onKeyDown={onPickerKeyDown}
          className="mt-2 flex flex-wrap gap-2"
        >
          {(Object.keys(EMOTES) as EmoteToken[]).map((token) => (
            <li key={token}>
              <button
                type="button"
                aria-label={token}
                title={token}
                onClick={() => insertEmote(token)}
                className="inline-flex size-11 items-center justify-center rounded-chip bg-ink/60 ring-2 ring-inset ring-lavender/40 hover:bg-plum-2"
              >
                <Sprite name={EMOTES[token]} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p id={`${id}-err`} role="alert" className="mt-2 flex items-start gap-2 font-semibold">
        {error ? (
          <>
            <Sprite name="icon-warning" className="mt-0.5" />
            {error}
          </>
        ) : null}
      </p>
    </form>
  );
}
