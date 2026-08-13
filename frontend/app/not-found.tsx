import Link from "next/link";

/**
 * NEXT-SPECIFIC: app/not-found.tsx renders whenever notFound() is called, or a
 * URL matches no route. It's served with a real 404 status, not a 200 with sad
 * text on it.
 */
export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-[70vh] max-w-xl place-items-center px-6 text-center">
      <div>
        <p className="text-eyebrow uppercase text-slate">404</p>
        <h1 className="mt-5 font-display text-h1">This page checked out.</h1>
        <p className="mt-5 text-body text-slate">
          The listing may have been removed by its host, or the link was mistyped.
        </p>
        <Link
          href="/"
          className="mt-8 inline-block rounded-full bg-coral px-6 py-3 text-meta font-semibold text-paper transition-colors duration-200 hover:bg-coral-deep"
        >
          Browse all homes
        </Link>
      </div>
    </main>
  );
}
