"use client";
// ^ NEXT-SPECIFIC: every component is a SERVER component by default — rendered
// to HTML on the server, zero JS shipped. This one listens to scroll and holds
// state, so it must run in the browser. That's what "use client" declares.
// Rule of thumb from React: need useState/useEffect/onClick? -> "use client".

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useToast } from "@/components/Toast";
import { useUser } from "@/context/UserContext";

/** Airbnb's search pill, split into the three things people actually search by. */
const SEARCH_SEGMENTS = [
  { label: "Where", value: "Anywhere" },
  { label: "When", value: "Any week" },
  { label: "Who", value: "Add guests" },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const { user } = useUser();

  useEffect(() => {
    // The navbar is flat at the top of the page and gains a border + shadow
    // once content slides under it — so it reads as a layer, not a stripe.
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll(); // run once, in case the page loads already scrolled
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 bg-sand/85 backdrop-blur-md transition-shadow duration-300 ${
        scrolled ? "border-b border-line shadow-warm" : "border-b border-transparent"
      }`}
    >
      <nav className="mx-auto flex h-20 max-w-[1400px] items-center gap-8 px-6 lg:px-10">
        {/* Wordmark. The coral full stop is the only accent up here — it reads
            as a period at the end of a sentence, not as decoration. */}
        <Link href="/" className="shrink-0 font-display text-[26px] leading-none tracking-tight">
          Dwellio<span className="text-coral">.</span>
        </Link>

        {/* Search pill. Static for now — it becomes the real SearchBar next. */}
        <button
          type="button"
          className="group mx-auto hidden items-center rounded-full border border-line bg-paper py-2 pl-2 pr-2 shadow-warm transition-shadow duration-300 hover:shadow-lift md:flex"
        >
          {SEARCH_SEGMENTS.map((segment, index) => (
            <span key={segment.label} className="flex items-center">
              {index > 0 && <span aria-hidden className="h-7 w-px bg-line" />}
              <span className="px-5 text-left">
                <span className="block text-eyebrow uppercase text-slate">{segment.label}</span>
                <span className="mt-1 block text-meta font-medium">{segment.value}</span>
              </span>
            </span>
          ))}
          <span className="ml-2 grid h-10 w-10 place-items-center rounded-full bg-coral text-paper transition-colors duration-200 group-hover:bg-coral-deep">
            <SearchIcon />
          </span>
        </button>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <Link
            href={user?.role === "host" ? "/host" : "/register?role=host"}
            className="hidden rounded-full px-4 py-2.5 text-meta font-medium transition-colors duration-200 hover:bg-paper lg:block"
          >
            {user?.role === "host" ? "Your listings" : "Host your place"}
          </Link>

          <AccountMenu />
        </div>
      </nav>
    </header>
  );
}

/**
 * The account menu: signed out it's a link, signed in it's a dropdown.
 *
 * `status === "loading"` renders a neutral placeholder for the moment it takes
 * to verify the stored token — otherwise the navbar would show "Log in" and
 * then swap to your avatar on every refresh.
 */
function AccountMenu() {
  const { user, status, logout } = useUser();
  const showToast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Click outside and Escape both close the menu — a dropdown you can only
  // close by clicking the trigger again is a trap.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (status === "loading") {
    return <div aria-hidden className="h-11 w-28 animate-pulse rounded-full bg-line/60" />;
  }

  if (!user) {
    return (
      <Link
        href="/login"
        className="flex items-center gap-3 rounded-full border border-line bg-paper py-1.5 pl-4 pr-1.5 shadow-warm transition-shadow duration-300 hover:shadow-lift"
      >
        <span className="text-meta font-medium">Log in</span>
        <span className="grid h-8 w-8 place-items-center rounded-full bg-ink text-paper">
          <UserIcon />
        </span>
      </Link>
    );
  }

  const links =
    user.role === "host"
      ? [
          { href: "/host", label: "Your listings" },
          { href: "/host/new", label: "Add a listing" },
          { href: "/trips", label: "Your trips" },
          { href: "/wishlist", label: "Wishlist" },
        ]
      : [
          { href: "/trips", label: "Your trips" },
          { href: "/wishlist", label: "Wishlist" },
        ];

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-3 rounded-full border border-line bg-paper py-1.5 pl-4 pr-1.5 shadow-warm transition-shadow duration-300 hover:shadow-lift"
      >
        <span className="hidden text-meta font-medium sm:block">
          {user.full_name.split(" ")[0]}
        </span>
        {user.avatar_url ? (
          <Image
            src={user.avatar_url}
            alt=""
            width={32}
            height={32}
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : (
          <span className="grid h-8 w-8 place-items-center rounded-full bg-ink text-paper">
            <UserIcon />
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-56 overflow-hidden rounded-card border border-line bg-paper py-2 shadow-lift"
        >
          <p className="px-4 py-2 text-meta text-slate">
            Signed in as <span className="text-ink">{user.email}</span>
          </p>
          <div className="my-2 h-px bg-line" />
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-meta transition-colors hover:bg-sand"
            >
              {link.label}
            </Link>
          ))}
          <div className="my-2 h-px bg-line" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              logout();
              setOpen(false);
              showToast("Signed out.");
              router.push("/");
            }}
            className="block w-full px-4 py-2.5 text-left text-meta transition-colors hover:bg-sand"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

/* Inline SVGs instead of an icon library: two icons don't justify a dependency,
   and inline means they inherit currentColor for free. */
function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="2" />
      <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="5.5" r="2.75" stroke="currentColor" strokeWidth="1.6" />
      <path d="M2.75 14c0-2.9 2.35-4.5 5.25-4.5s5.25 1.6 5.25 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
