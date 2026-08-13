import Link from "next/link";

import { buildQuery, type QueryValue } from "@/lib/url";

/**
 * Pages are <Link>s, not buttons — so each page is a real URL you can share,
 * open in a new tab, or land on from a search engine. No "use client" needed:
 * this component ships zero JavaScript.
 */
export function Pagination({
  page,
  totalPages,
  params,
}: {
  page: number;
  totalPages: number;
  params: Record<string, QueryValue>;
}) {
  if (totalPages <= 1) return null;

  const pages = pageWindow(page, totalPages);

  return (
    <nav aria-label="Pagination" className="mt-20 flex items-center justify-center gap-2">
      <PageLink params={params} page={page - 1} disabled={page === 1} label="Previous">
        <Arrow direction="left" />
      </PageLink>

      {pages.map((entry, index) =>
        entry === "gap" ? (
          <span key={`gap-${index}`} aria-hidden className="px-2 text-slate">
            …
          </span>
        ) : (
          <PageLink key={entry} params={params} page={entry} current={entry === page}>
            {entry}
          </PageLink>
        ),
      )}

      <PageLink params={params} page={page + 1} disabled={page === totalPages} label="Next">
        <Arrow direction="right" />
      </PageLink>
    </nav>
  );
}

function PageLink({
  params,
  page,
  current = false,
  disabled = false,
  label,
  children,
}: {
  params: Record<string, QueryValue>;
  page: number;
  current?: boolean;
  disabled?: boolean;
  label?: string;
  children: React.ReactNode;
}) {
  const className = `grid h-11 min-w-11 place-items-center rounded-full border px-3 text-meta transition-colors duration-200 ${
    current
      ? "border-ink bg-ink font-semibold text-paper"
      : "border-line bg-paper hover:border-ink/30"
  }`;

  // A disabled control must not be a link — there's nowhere to go.
  if (disabled) {
    return (
      <span aria-hidden className={`${className} cursor-not-allowed opacity-40`}>
        {children}
      </span>
    );
  }

  return (
    <Link
      href={`/${buildQuery(params, { page: page === 1 ? undefined : page })}`}
      aria-label={label ?? `Page ${page}`}
      // aria-current tells a screen reader which page you're on.
      aria-current={current ? "page" : undefined}
      className={className}
    >
      {children}
    </Link>
  );
}

function Arrow({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden
      className={direction === "left" ? "rotate-180" : undefined}
    >
      <path d="M5 2l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 1 … 4 [5] 6 … 12 — always show first, last, and the neighbours of current. */
function pageWindow(page: number, totalPages: number): (number | "gap")[] {
  const shown = new Set([1, totalPages, page, page - 1, page + 1]);
  const sorted = [...shown].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);

  const result: (number | "gap")[] = [];
  sorted.forEach((p, index) => {
    // A jump of more than 1 between shown pages means hidden pages in between.
    if (index > 0 && p - sorted[index - 1] > 1) result.push("gap");
    result.push(p);
  });
  return result;
}
