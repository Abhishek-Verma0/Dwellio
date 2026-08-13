import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";

import { MotionProvider } from "@/components/MotionProvider";
import { Navbar } from "@/components/Navbar";
import { ToastProvider } from "@/components/Toast";
import { UserProvider } from "@/context/UserContext";
import { WishlistProvider } from "@/context/WishlistContext";
import "./globals.css";

/**
 * NEXT-SPECIFIC: next/font downloads these at BUILD time and self-hosts them.
 * No network request to Google at runtime, no layout shift, no <link> tag.
 * Each call returns a class exposing a CSS variable, which globals.css then
 * consumes as --font-display / --font-sans.
 */
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  // Fraunces is a VARIABLE font with extra axes beyond weight. Requesting them
  // is what lets globals.css dial in the personality:
  //   opsz — optical size: sharper serifs and tighter spacing at display sizes
  //   SOFT — how rounded the terminals are (0 = crisp)
  //   WONK — swaps in the quirky alternate letterforms, which is the whole
  //          reason to pick Fraunces over another serif
  axes: ["opsz", "SOFT", "WONK"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// NEXT-SPECIFIC: exporting `metadata` from a layout or page sets the document
// head. No react-helmet, no useEffect writing document.title.
export const metadata: Metadata = {
  title: "Dwellio — Stay somewhere with a point of view",
  description:
    "Book handpicked homes across India: beachfront villas, mountain cabins, heritage havelis and backwater houseboats.",
};

/**
 * app/layout.tsx wraps every route. It's the one place that renders <html> and
 * <body> — closest React equivalent is App.jsx, except this one runs on the
 * server and persists across navigations (the Navbar never remounts).
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
      <body>
        {/* Provider order matters: Toast is innermost so anything inside the
            app can fire one, and UserProvider sits above the Navbar because
            the Navbar renders the signed-in user. */}
        <MotionProvider>
          <UserProvider>
            <ToastProvider>
              {/* Wishlist sits inside Toast (it fires toasts) and inside User
                  (it needs the token). */}
              <WishlistProvider>
                <Navbar />
                {children}
              </WishlistProvider>
            </ToastProvider>
          </UserProvider>
        </MotionProvider>
      </body>
    </html>
  );
}
