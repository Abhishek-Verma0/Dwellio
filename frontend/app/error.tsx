"use client";
// NEXT-SPECIFIC: error.tsx must be a client component — it's a React error
// boundary, and boundaries need client-side JS to catch and re-render.

/**
 * Renders whenever a route below it throws. `reset` re-runs the failed render,
 * which is exactly what's needed when the cause was a backend that was
 * briefly down.
 *
 * Errors explain what happened and how to fix it. They don't apologise, and
 * they're never vague.
 */
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto grid min-h-[70vh] max-w-xl place-items-center px-6 text-center">
      <div>
        <p className="text-eyebrow uppercase text-slate">Something broke</p>
        <h1 className="mt-5 font-display text-h1">We couldn&apos;t load this.</h1>
        <p className="mt-5 text-body text-slate">{error.message}</p>
        <p className="mt-3 text-meta text-slate">
          If the API isn&apos;t running, start it with{" "}
          <code className="rounded-input bg-paper px-2 py-1">uvicorn app.main:app --reload</code>
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-8 rounded-full bg-coral px-6 py-3 text-meta font-semibold text-paper transition-colors duration-200 hover:bg-coral-deep"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
