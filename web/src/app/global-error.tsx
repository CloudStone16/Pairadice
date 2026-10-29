"use client";

import { useEffect } from "react";
import "./globals.css";

/**
 * Last-resort boundary that replaces the root layout. It brings its own
 * <html>/<body>, so it uses only plain markup and the global stylesheet.
 */
export default function GlobalError({
  error,
  retry,
  reset,
}: {
  error: Error & { digest?: string };
  retry?: () => void;
  reset?: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center px-4">
        <main role="alert" className="w-full max-w-xl rounded-window bg-plum p-6 text-cream shadow-window ring-2 ring-ink">
          <h1 className="font-display text-2xl font-bold">The whole cabin went dark</h1>
          <p className="mt-2">
            Something broke before the page could load. Your data is safe; this is only the screen.
          </p>
          {error.digest ? <p className="mt-2 text-sm text-lavender">Reference: {error.digest}</p> : null}
          <button
            type="button"
            onClick={() => (retry ? retry() : reset?.())}
            className="mt-4 min-h-11 rounded-pill bg-sfc-yellow px-6 font-display font-semibold text-ink shadow-key [--key-shadow:#9a7424]"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
