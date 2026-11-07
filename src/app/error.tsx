"use client";

import { useEffect } from "react";

// Shown when a page fails unexpectedly, instead of a blank error screen.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted">This page didn&apos;t load. Anything you already saved is safe. Please try again, and contact the school office if it keeps happening.</p>
      <div className="flex gap-2">
        <button type="button" className="btn-primary" onClick={reset}>
          Try again
        </button>
        {/* A full page load, in case the failure was in the page's own navigation. */}
        <a href="/dashboard" className="btn-secondary">
          Go to my dashboard
        </a>
      </div>
    </main>
  );
}
