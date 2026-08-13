"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

/**
 * One switch for all Framer Motion in the app.
 *
 * `reducedMotion="user"` reads the OS "reduce motion" setting and strips
 * transform/opacity animations for anyone who asked for less movement — so it
 * doesn't have to be handled component by component. Plain CSS transitions are
 * covered separately by the media query in globals.css.
 *
 * It's a client component because MotionConfig uses context; layout.tsx stays
 * a server component and just renders this around the app.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
