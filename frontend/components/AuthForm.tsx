"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useToast } from "@/components/Toast";
import { errorMessage, useUser } from "@/context/UserContext";
import type { UserRole } from "@/types";

/**
 * Login and register share this form — the fields differ, the layout, error
 * handling and redirect don't.
 *
 * `next` is where to go after signing in. The booking flow sends people here
 * with ?next=/book/3?check_in=... so they land back on the checkout they were
 * halfway through, not on the home page.
 */
export function AuthForm({
  mode,
  next,
  defaultRole = "guest",
}: {
  mode: "login" | "register";
  next: string;
  defaultRole?: UserRole;
}) {
  const router = useRouter();
  const showToast = useToast();
  const { login, register } = useUser();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<UserRole>(defaultRole);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isRegister = mode === "register";

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const user = isRegister
        ? await register({ email, password, full_name: fullName, role })
        : await login(email, password);

      showToast(isRegister ? `Welcome, ${user.full_name.split(" ")[0]}.` : "Signed in.");
      // replace, not push: the back button shouldn't return to a login form
      // you've already completed.
      router.replace(next);
    } catch (caught) {
      // The backend's messages are already written for people ("Incorrect email
      // or password"), so show them rather than inventing our own.
      setError(errorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {isRegister && (
        <Field label="Full name">
          <input
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Priya Sharma"
            autoComplete="name"
            className="w-full bg-transparent text-body outline-none placeholder:text-slate/60"
          />
        </Field>
      )}

      <Field label="Email">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          className="w-full bg-transparent text-body outline-none placeholder:text-slate/60"
        />
      </Field>

      <Field label="Password" hint={isRegister ? "At least 8 characters" : undefined}>
        <input
          type="password"
          required
          minLength={isRegister ? 8 : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete={isRegister ? "new-password" : "current-password"}
          className="w-full bg-transparent text-body outline-none placeholder:text-slate/60"
        />
      </Field>

      {isRegister && (
        <fieldset>
          <legend className="text-eyebrow uppercase text-slate">I&apos;m here to</legend>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <RoleCard
              selected={role === "guest"}
              onSelect={() => setRole("guest")}
              title="Book stays"
              description="Search homes and reserve them"
            />
            <RoleCard
              selected={role === "host"}
              onSelect={() => setRole("host")}
              title="Host a place"
              description="List your home and take bookings"
            />
          </div>
          {/* Says what the choice COSTS, since the backend enforces it. */}
          <p className="mt-3 text-meta text-slate">
            Only hosts can create listings. You can still book stays as a host.
          </p>
        </fieldset>
      )}

      {error && (
        <p role="alert" className="rounded-input border border-coral/30 bg-coral/5 px-4 py-3 text-meta text-coral">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-full bg-coral px-6 py-4 text-body font-semibold text-paper transition-colors duration-200 hover:bg-coral-deep disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "One moment…" : isRegister ? "Create account" : "Log in"}
      </button>

      <p className="text-center text-meta text-slate">
        {isRegister ? "Already have an account?" : "New here?"}{" "}
        <Link
          href={`${isRegister ? "/login" : "/register"}?next=${encodeURIComponent(next)}`}
          className="font-medium text-ink underline underline-offset-4 transition-colors hover:text-coral"
        >
          {isRegister ? "Log in" : "Create an account"}
        </Link>
      </p>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between">
        <span className="text-eyebrow uppercase text-slate">{label}</span>
        {hint && <span className="text-meta text-slate">{hint}</span>}
      </span>
      <span className="mt-2 block rounded-input border border-line bg-paper px-4 py-3 transition-colors focus-within:border-ink/40">
        {children}
      </span>
    </label>
  );
}

function RoleCard({
  selected,
  onSelect,
  title,
  description,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`rounded-input border p-4 text-left transition-colors duration-200 ${
        selected ? "border-coral bg-coral/5" : "border-line bg-paper hover:border-ink/25"
      }`}
    >
      <span className="block text-meta font-semibold">{title}</span>
      <span className="mt-1 block text-meta text-slate">{description}</span>
    </button>
  );
}
