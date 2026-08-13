"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { ApiError, api } from "@/lib/api";
import type { User, UserRole } from "@/types";

const TOKEN_KEY = "dwellio_token";

interface UserContextValue {
  user: User | null;
  token: string | null;
  /** "loading" until the stored token has been checked — see the note below. */
  status: "loading" | "authenticated" | "anonymous";
  login: (email: string, password: string) => Promise<User>;
  register: (input: {
    email: string;
    password: string;
    full_name: string;
    role: UserRole;
  }) => Promise<User>;
  logout: () => void;
}

const UserContext = createContext<UserContextValue | null>(null);

/**
 * Auth state for the whole app — the JWT plus the user it belongs to.
 *
 * The token lives in localStorage, which means only the BROWSER can read it.
 * That's why every page that needs the current user is a client component:
 * a server component renders before localStorage exists.
 *
 * The `status` field matters more than it looks. Without it, every guarded
 * page would flash "Please log in" for a moment on refresh while the stored
 * token is being verified. "loading" is what lets those pages wait.
 */
export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<UserContextValue["status"]>("loading");

  // On first mount, trade any stored token for the user it represents. This
  // also silently discards tokens that expired or were signed by an old key —
  // the backend answers 401 and we clear it.
  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored) {
      setStatus("anonymous");
      return;
    }

    api
      .me(stored)
      .then((me) => {
        setUser(me);
        setToken(stored);
        setStatus("authenticated");
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setStatus("anonymous");
      });
  }, []);

  const persist = useCallback((accessToken: string, nextUser: User) => {
    localStorage.setItem(TOKEN_KEY, accessToken);
    setToken(accessToken);
    setUser(nextUser);
    setStatus("authenticated");
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await api.login({ email, password });
      persist(result.access_token, result.user);
      return result.user;
    },
    [persist],
  );

  const register = useCallback(
    async (input: { email: string; password: string; full_name: string; role: UserRole }) => {
      // The backend returns a token on register too, so signing up logs you in.
      const result = await api.register(input);
      persist(result.access_token, result.user);
      return result.user;
    },
    [persist],
  );

  const logout = useCallback(() => {
    // A JWT is stateless — there's nothing to invalidate server-side. Logging
    // out IS forgetting the token.
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    setStatus("anonymous");
  }, []);

  // useMemo so consumers don't re-render on every provider render.
  const value = useMemo(
    () => ({ user, token, status, login, register, logout }),
    [user, token, status, login, register, logout],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

/** Throws outside the provider, so a missing wrapper fails loudly, not silently. */
export function useUser() {
  const context = useContext(UserContext);
  if (!context) throw new Error("useUser must be used inside <UserProvider>");
  return context;
}

/** Turns an unknown thrown value into something worth showing a person. */
export function errorMessage(caught: unknown): string {
  if (caught instanceof ApiError) return caught.message;
  if (caught instanceof Error) return caught.message;
  return "Something went wrong. Try again.";
}
