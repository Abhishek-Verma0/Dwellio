import Link from "next/link";

/**
 * The frame both auth pages sit in: a narrow column on sand, one Fraunces
 * line, and the demo logins.
 *
 * The demo credentials are on the page ON PURPOSE — this is a seeded portfolio
 * build, and anyone opening it should be able to see a host dashboard and a
 * guest's trips within ten seconds. It would be the first thing to delete for
 * a real deployment.
 */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto grid max-w-[1100px] gap-16 px-6 py-16 lg:grid-cols-[1fr_420px] lg:px-10 lg:py-24">
      <div className="max-w-md lg:pt-8">
        <h1 className="font-display text-h1 lg:text-display">{title}</h1>
        <p className="mt-6 text-lead text-slate">{subtitle}</p>

        <div className="mt-12 rounded-card border border-line bg-paper p-6 shadow-warm">
          <p className="text-eyebrow uppercase text-slate">Demo logins</p>
          <p className="mt-3 text-meta text-slate">
            Seeded accounts. Password for all of them:{" "}
            <code className="rounded bg-sand px-1.5 py-0.5 text-ink">password123</code>
          </p>
          <dl className="mt-5 space-y-3 text-meta">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-slate">Host, 3 listings</dt>
              <dd className="font-medium">priya@dwellio.com</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-slate">Guest, 6 trips</dt>
              <dd className="font-medium">aditya@dwellio.com</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="rounded-card border border-line bg-paper p-8 shadow-warm">
        {children}

        <p className="mt-8 border-t border-line pt-6 text-center text-meta text-slate">
          <Link href="/" className="underline underline-offset-4 transition-colors hover:text-coral">
            Keep browsing without an account
          </Link>
        </p>
      </div>
    </main>
  );
}
