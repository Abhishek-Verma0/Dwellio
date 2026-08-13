"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useUser } from "@/context/UserContext";

/**
 * The three states every signed-in page has: still checking the stored token,
 * signed out, signed in. /trips and /wishlist both need all three, so it lives
 * here once.
 *
 * The "checking" state is a skeleton rather than nothing — flashing a sign-in
 * prompt at someone who IS signed in, every time they refresh, is worse than
 * a beat of grey.
 */
export function AuthGate({
  title,
  body,
  skeleton,
  children,
}: {
  title: string;
  body: string;
  skeleton: React.ReactNode;
  children: React.ReactNode;
}) {
  const { user, status } = useUser();
  // NEXT-SPECIFIC: usePathname gives the current URL path, so ?next= sends the
  // person back to the page they actually wanted.
  const pathname = usePathname();

  if (status === "loading") return <>{skeleton}</>;

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <h2 className="font-display text-h2">{title}</h2>
        <p className="mt-4 text-body text-slate">{body}</p>
        <Link
          href={`/login?next=${encodeURIComponent(pathname)}`}
          className="mt-8 inline-block rounded-full bg-coral px-6 py-3 text-meta font-semibold text-paper transition-colors duration-200 hover:bg-coral-deep"
        >
          Log in
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
