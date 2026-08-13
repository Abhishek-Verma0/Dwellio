"use client";

import { useState } from "react";

import {
  addDays,
  firstOccupiedAfter,
  formatMonth,
  isRangeFree,
  monthGrid,
  todayISO,
} from "@/lib/dates";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * Two-month calendar with booked nights greyed out.
 *
 * Selection is a two-click cycle: first click sets check-in, second sets
 * checkout. Clicking a date earlier than the current check-in restarts from
 * there rather than erroring — that's what people expect from a date picker.
 *
 * All the date arithmetic lives in lib/dates.ts (and is covered by
 * lib/dates.test.ts). This component only decides what a cell LOOKS like.
 */
export function AvailabilityCalendar({
  occupied,
  checkIn,
  checkOut,
  onSelect,
}: {
  occupied: Set<string>;
  checkIn: string | null;
  checkOut: string | null;
  onSelect: (checkIn: string | null, checkOut: string | null) => void;
}) {
  const today = todayISO();
  const [cursor, setCursor] = useState(() => {
    const start = checkIn ? new Date(`${checkIn}T00:00:00Z`) : new Date();
    return { year: start.getUTCFullYear(), month: start.getUTCMonth() };
  });

  // Once a check-in is picked, you can't select past the next booked night —
  // the stay would swallow someone else's reservation.
  const ceiling = checkIn && !checkOut ? firstOccupiedAfter(occupied, checkIn) : null;

  function handleClick(date: string) {
    // Starting fresh, or restarting because the click is on/before the current
    // check-in, or because a range is already complete.
    if (!checkIn || checkOut || date <= checkIn) {
      onSelect(date, null);
      return;
    }
    // Second click: only accept it if every night in between is free.
    if (isRangeFree(occupied, checkIn, date)) onSelect(checkIn, date);
    else onSelect(date, null);
  }

  const shift = (delta: number) =>
    setCursor(({ year, month }) => {
      const next = new Date(Date.UTC(year, month + delta, 1));
      return { year: next.getUTCFullYear(), month: next.getUTCMonth() };
    });

  const secondMonth = new Date(Date.UTC(cursor.year, cursor.month + 1, 1));
  // Derived from the same local "today" the cells use, so the back arrow can't
  // disagree with which month is actually browsable.
  const atStart =
    cursor.year <= Number(today.slice(0, 4)) && cursor.month <= Number(today.slice(5, 7)) - 1;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => shift(-1)}
          disabled={atStart}
          aria-label="Previous month"
          className="grid h-9 w-9 place-items-center rounded-full transition-colors hover:bg-sand disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Chevron direction="left" />
        </button>
        <p className="text-meta font-medium">
          {formatMonth(cursor.year, cursor.month)}
          <span className="hidden sm:inline">
            {" — "}
            {formatMonth(secondMonth.getUTCFullYear(), secondMonth.getUTCMonth())}
          </span>
        </p>
        <button
          type="button"
          onClick={() => shift(1)}
          aria-label="Next month"
          className="grid h-9 w-9 place-items-center rounded-full transition-colors hover:bg-sand"
        >
          <Chevron direction="right" />
        </button>
      </div>

      <div className="grid gap-8 sm:grid-cols-2">
        <Month
          year={cursor.year}
          month={cursor.month}
          today={today}
          occupied={occupied}
          checkIn={checkIn}
          checkOut={checkOut}
          ceiling={ceiling}
          onPick={handleClick}
        />
        <div className="hidden sm:block">
          <Month
            year={secondMonth.getUTCFullYear()}
            month={secondMonth.getUTCMonth()}
            today={today}
            occupied={occupied}
            checkIn={checkIn}
            checkOut={checkOut}
            ceiling={ceiling}
            onPick={handleClick}
          />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-meta text-slate">
        <span className="flex items-center gap-2">
          <span aria-hidden className="h-3 w-3 rounded-full bg-ink" /> Your stay
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden className="h-3 w-3 rounded-full bg-line" /> Booked
        </span>
      </div>
    </div>
  );
}

function Month({
  year,
  month,
  today,
  occupied,
  checkIn,
  checkOut,
  ceiling,
  onPick,
}: {
  year: number;
  month: number;
  today: string;
  occupied: Set<string>;
  checkIn: string | null;
  checkOut: string | null;
  ceiling: string | null;
  onPick: (date: string) => void;
}) {
  return (
    <div>
      <p className="mb-3 text-center text-meta font-medium sm:text-left">{formatMonth(year, month)}</p>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((day, index) => (
          <span key={index} className="grid h-8 place-items-center text-[11px] text-slate">
            {day}
          </span>
        ))}

        {monthGrid(year, month).map((date, index) => {
          if (!date) return <span key={index} />;

          const isPast = date < today;
          const isBooked = occupied.has(date);
          // Past the next booking, or beyond it — not selectable as a checkout.
          const beyondCeiling = ceiling !== null && date > ceiling;
          const disabled = isPast || isBooked || beyondCeiling;

          const isCheckIn = date === checkIn;
          const isCheckOut = date === checkOut;
          const inRange = Boolean(checkIn && checkOut && date > checkIn && date < checkOut);

          return (
            <button
              key={date}
              type="button"
              disabled={disabled}
              onClick={() => onPick(date)}
              aria-label={date}
              aria-pressed={isCheckIn || isCheckOut}
              className={cellClass({ disabled, isBooked, isCheckIn, isCheckOut, inRange })}
            >
              {Number(date.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function cellClass({
  disabled,
  isBooked,
  isCheckIn,
  isCheckOut,
  inRange,
}: {
  disabled: boolean;
  isBooked: boolean;
  isCheckIn: boolean;
  isCheckOut: boolean;
  inRange: boolean;
}) {
  const base = "grid h-10 place-items-center rounded-full text-meta transition-colors duration-150";

  if (isCheckIn || isCheckOut) return `${base} bg-ink font-semibold text-paper`;
  if (inRange) return `${base} bg-ink/10`;
  // Booked nights get a strikethrough as well as the grey, so the state doesn't
  // rely on colour alone.
  if (isBooked) return `${base} cursor-not-allowed text-slate/50 line-through`;
  if (disabled) return `${base} cursor-not-allowed text-slate/30`;
  return `${base} hover:bg-sand`;
}

function Chevron({ direction }: { direction: "left" | "right" }) {
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

/** Exported for the panel's "next free date" hint. */
export const nextFreeDate = (occupied: Set<string>, from: string): string => {
  let day = from;
  while (occupied.has(day)) day = addDays(day, 1);
  return day;
};
