/**
 * The one frontend test, guarding the one piece of logic with real edge cases:
 * which nights the calendar greys out.
 *
 * Run it:  npm run test        (node runs .ts directly — no jest, no config)
 */

import assert from "node:assert/strict";

import {
  addDays,
  firstOccupiedAfter,
  isRangeFree,
  monthGrid,
  nightsBetween,
  occupiedNights,
  todayISO,
} from "./dates.ts";

// "Today" must be the LOCAL calendar date. Deriving it from toISOString()
// would return the UTC date, which is a day behind for anyone east of UTC
// during their early hours — and the backend would then reject that date as
// being in the past.
const now = new Date();
const pad = (n: number) => String(n).padStart(2, "0");
assert.equal(todayISO(), `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);

// A booking of the 20th -> 25th.
const booked = [{ check_in: "2026-08-20", check_out: "2026-08-25" }];
const occupied = occupiedNights(booked);

// It takes the NIGHTS of the 20th to the 24th — five nights, not six.
assert.equal(occupied.size, 5);
assert.ok(occupied.has("2026-08-20"), "first night is taken");
assert.ok(occupied.has("2026-08-24"), "last night is taken");
assert.ok(!occupied.has("2026-08-25"), "checkout day is free — the guest leaves that morning");
assert.ok(!occupied.has("2026-08-19"), "the night before is free");

// Overlapping stays must be refused...
assert.ok(!isRangeFree(occupied, "2026-08-20", "2026-08-25"), "identical dates");
assert.ok(!isRangeFree(occupied, "2026-08-21", "2026-08-23"), "fully inside");
assert.ok(!isRangeFree(occupied, "2026-08-18", "2026-08-22"), "overlaps the start");
assert.ok(!isRangeFree(occupied, "2026-08-23", "2026-08-28"), "overlaps the end");

// ...and turnovers must be allowed. These two are why the range is half-open;
// if they failed, no guest could ever book back-to-back with another.
assert.ok(isRangeFree(occupied, "2026-08-25", "2026-08-28"), "checking in the day they leave");
assert.ok(isRangeFree(occupied, "2026-08-17", "2026-08-20"), "checking out the day they arrive");

// A zero-night or reversed range is never valid.
assert.ok(!isRangeFree(occupied, "2026-08-10", "2026-08-10"), "same day");
assert.ok(!isRangeFree(occupied, "2026-08-12", "2026-08-10"), "reversed");

// Capping the checkout date: from the 17th, the next taken night is the 20th.
assert.equal(firstOccupiedAfter(occupied, "2026-08-17"), "2026-08-20");
assert.equal(firstOccupiedAfter(occupied, "2026-08-26"), null, "nothing booked after");

// Night counting.
assert.equal(nightsBetween("2026-08-20", "2026-08-23"), 3);
assert.equal(nightsBetween("2026-08-20", "2026-08-21"), 1);

// Date arithmetic must survive a month boundary.
assert.equal(addDays("2026-08-31", 1), "2026-09-01");
assert.equal(addDays("2026-03-01", -1), "2026-02-28");

// August 2026 starts on a Saturday, so there are 6 leading blanks.
const august = monthGrid(2026, 7);
assert.equal(august.length, 42, "fixed height so months don't jump");
assert.equal(august[6], "2026-08-01");
assert.equal(august.filter(Boolean).length, 31);

console.log("dates: all checks passed");
