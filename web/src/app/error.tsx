"use client";

import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { Button, Sprite, Window } from "@/components/ui";

/** Catches data-layer failures (e.g. the database is unreachable) with a friendly, useful message. */
export default function RootError({
  error,
  retry,
  reset,
}: {
  error: Error & { digest?: string };
  /** Re-fetches and re-renders the segment (stable since Next 16.3). */
  retry?: () => void;
  reset?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    console.error(error);
  }, [error]);

  const tryAgain = () => {
    startTransition(() => {
      if (retry) {
        retry();
      } else {
        router.refresh();
        reset?.();
      }
    });
  };

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 items-center px-4 py-16">
      <Window title="Something went wrong" titleAs="p" className="w-full">
        <div role="alert" className="flex items-start gap-4">
          <Sprite name="campfire-1" scale={2} />
          <div>
            <h1 className="font-display text-2xl font-bold leading-tight [text-shadow:0_2px_0_var(--color-ink)]">
              The campfire sputtered
            </h1>
            <p className="mt-2">We could not reach the camp&apos;s records just now.</p>
            <p className="mt-2 text-sm text-lavender">
              Give it a moment and try again.
              {process.env.NODE_ENV === "development" ? (
                <span className="mt-1 block">
                  Running locally? Check that MySQL is up and <code>MYSQL_PWD</code> is set.
                </span>
              ) : null}
              {error.digest ? <span className="mt-1 block">Reference: {error.digest}</span> : null}
            </p>
            <Button variant="yellow" size="sm" className="mt-4" onClick={tryAgain} disabled={pending}>
              {pending ? "Trying again…" : "Try again"}
            </Button>
          </div>
        </div>
      </Window>
    </main>
  );
}
