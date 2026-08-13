/**
 * Date helpers for the availability calendar.
 *
 * Everything here works on "YYYY-MM-DD" STRINGS, not Date objects, and does its
 * arithmetic in UTC. That's deliberate: `new Date("2026-08-20")` is parsed as
 * UTC midnight, so in any timezone behind UTC it prints as the 19th. Calendars
 * built on local Date objects go off-by-one for half the planet.
 *
 * Pure functions, no React — which is what makes lib/dates.test.ts possible.
 */

export interface DateRange {
  check_in: string;
  check_out: string;
}

/** "2026-08-20" -> a UTC Date at midnight. */
export const parseISO = (iso: string): Date => new Date(`${iso}T00:00:00Z`);

/** A UTC Date -> "2026-08-20". */
export const toISO = (date: Date): string => date.toISOString().slice(0, 10);

export const addDays = (iso: string, days: number): string => {
  const date = parseISO(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toISO(date);
};

/**
 * "Today" from the user's LOCAL calendar, not from UTC.
 *
 * Everything else in this file is UTC on purpose, but `today` is the one value
 * that has to mean what a person means by it. `toISO(new Date())` would return
 * the UTC date — so between 00:00 and 05:30 IST it says yesterday, the
 * calendar would offer a date the backend then rejects as "check_in cannot be
 * in the past", and the guest sees a 422 for picking the date on their wall.
 */
export const todayISO = (): string => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

/** Whole nights between two dates. 20th -> 23rd is 3 nights. */
export const nightsBetween = (checkIn: string, checkOut: string): number =>
  Math.round((parseISO(checkOut).getTime() - parseISO(checkIn).getTime()) / 86_400_000);

/**
 * Every night that is already taken.
 *
 * A booking of [20th, 25th) occupies the NIGHTS of the 20th–24th. The guest
 * leaves on the morning of the 25th, so the 25th is free to check into — this
 * is the same half-open range the backend's overlap rule uses, and getting it
 * wrong here would grey out every turnover day in the calendar.
 */
export function occupiedNights(booked: DateRange[]): Set<string> {
  const nights = new Set<string>();
  for (const range of booked) {
    for (let day = range.check_in; day < range.check_out; day = addDays(day, 1)) {
      nights.add(day);
    }
  }
  return nights;
}

/** Can someone stay [checkIn, checkOut)? Only if no night in it is taken. */
export function isRangeFree(occupied: Set<string>, checkIn: string, checkOut: string): boolean {
  if (nightsBetween(checkIn, checkOut) < 1) return false;
  for (let day = checkIn; day < checkOut; day = addDays(day, 1)) {
    if (occupied.has(day)) return false;
  }
  return true;
}

/**
 * The first taken night on or after `from`. Used to cap the checkout date:
 * once you've picked a check-in, you can't select past the next booking.
 */
export function firstOccupiedAfter(occupied: Set<string>, from: string, lookaheadDays = 365): string | null {
  for (let day = from, i = 0; i < lookaheadDays; day = addDays(day, 1), i++) {
    if (occupied.has(day)) return day;
  }
  return null;
}

/**
 * A month as calendar rows: 6 weeks of 7 cells, Sunday first, with `null` for
 * the leading/trailing blanks. Returning a fixed shape keeps every month the
 * same height, so switching months doesn't make the page jump.
 */
export function monthGrid(year: number, month: number): (string | null)[] {
  const firstOfMonth = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const leadingBlanks = firstOfMonth.getUTCDay(); // 0 = Sunday

  const cells: (string | null)[] = Array(leadingBlanks).fill(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(toISO(new Date(Date.UTC(year, month, day))));
  }
  while (cells.length < 42) cells.push(null);
  return cells;
}

const monthFormatter = new Intl.DateTimeFormat("en-IN", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const dayFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

export const formatMonth = (year: number, month: number): string =>
  monthFormatter.format(new Date(Date.UTC(year, month, 1)));

/** "2026-08-20" -> "20 Aug" */
export const formatDayShort = (iso: string): string => dayFormatter.format(parseISO(iso));
