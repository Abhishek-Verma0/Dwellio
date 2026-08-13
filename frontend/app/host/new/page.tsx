"use client";

import { AuthGate } from "@/components/AuthGate";
import { ListingForm } from "@/components/ListingForm";
import { useUser } from "@/context/UserContext";
import Link from "next/link";

export default function NewListingPage() {
  return (
    <main className="mx-auto max-w-[1100px] px-6 pb-32 lg:px-10">
      <header className="py-12 lg:py-16">
        <p className="text-eyebrow uppercase text-slate">New listing</p>
        <h1 className="mt-5 font-display text-h1">Put your place up.</h1>
        <p className="mt-5 max-w-lg text-lead text-slate">
          It goes live as soon as you publish — guests can book it the same minute.
        </p>
      </header>

      <AuthGate
        title="Log in to add a listing"
        body="Listings belong to a host account."
        skeleton={<FormSkeleton />}
      >
        <HostOnly>
          <ListingForm />
        </HostOnly>
      </AuthGate>
    </main>
  );
}

/**
 * The backend answers 403 to a guest posting a listing. Catching it here means
 * they find out before filling in a long form, not after.
 */
function HostOnly({ children }: { children: React.ReactNode }) {
  const { user } = useUser();

  if (user && user.role !== "host") {
    return (
      <div className="rounded-card border border-line bg-paper px-8 py-16 text-center shadow-warm">
        <p className="font-display text-h2">Guest accounts can&apos;t host</p>
        <p className="mx-auto mt-4 max-w-sm text-body text-slate">
          Your account is set up for booking stays. Register a host account to list a place.
        </p>
        <Link
          href="/register?role=host"
          className="mt-8 inline-block rounded-full bg-coral px-6 py-3 text-meta font-semibold text-paper transition-colors duration-200 hover:bg-coral-deep"
        >
          Create a host account
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}

function FormSkeleton() {
  return (
    <div className="grid gap-16 lg:grid-cols-[1fr_380px]" aria-hidden>
      <div className="space-y-6">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-card bg-line/60" />
        ))}
      </div>
      <div className="h-96 animate-pulse rounded-card bg-line/60" />
    </div>
  );
}
