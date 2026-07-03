#!/usr/bin/env node
/*
 * check-hkt-date.mjs — self-check for the Asia/Hong_Kong "today" computation
 * used by worker.js (handleDepartures picks the upstream day by HKT date).
 *
 * No test framework: this is a plain Node script. Run with `node
 * scripts/check-hkt-date.mjs`; it prints each case and exits non-zero if any
 * assertion fails.
 *
 * `hktDate` below is a byte-for-byte mirror of worker.js's hktDate(): the same
 * Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong", ... }) formatting.
 * Keep the two in sync — if worker.js's date logic changes, update this copy
 * and re-run the checks.
 */

// --- Mirror of worker.js hktDate() ----------------------------------------
function hktDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// --- Tiny assert helper ----------------------------------------------------
let failures = 0;
function expect(utcIso, expected, note) {
  const got = hktDate(new Date(utcIso));
  const ok = got === expected;
  if (!ok) failures++;
  const mark = ok ? "PASS" : "FAIL";
  console.log(`[${mark}] ${utcIso}  ->  HKT date ${got}` +
    (ok ? "" : `  (expected ${expected})`) +
    (note ? `   # ${note}` : ""));
}

// --- Cases -----------------------------------------------------------------
// HKT is a fixed UTC+8 (Hong Kong has no daylight saving), so the HKT calendar
// date rolls over at 16:00 UTC.

console.log("HKT date-boundary self-check (Asia/Hong_Kong = UTC+8)\n");

// The headline case from the task: 16:30 UTC is 00:30 the NEXT day in HKT.
expect("2026-07-03T16:30:00Z", "2026-07-04",
  "16:30Z is 00:30 HKT next day -> use next date");

// HKT midnight boundary: 15:59:59Z is still 23:59 HKT (same day)...
expect("2026-07-03T15:59:59Z", "2026-07-03",
  "23:59:59 HKT -> still current date");
// ...and 16:00:00Z is exactly 00:00 HKT the next day.
expect("2026-07-03T16:00:00Z", "2026-07-04",
  "00:00:00 HKT -> next date");

// UTC midnight boundary: crossing UTC midnight must NOT roll the HKT date,
// because at UTC midnight it is already 08:00 HKT the same HKT day.
expect("2026-07-03T23:30:00Z", "2026-07-04",
  "07:30 HKT (after UTC midnight) -> HKT already on the 4th");
expect("2026-07-04T00:30:00Z", "2026-07-04",
  "08:30 HKT -> same HKT day as 23:30Z case");
expect("2026-07-03T00:30:00Z", "2026-07-03",
  "08:30 HKT on the 3rd -> current date, not previous");

// Month/year rollover sanity: 2025-12-31T16:00:00Z is 2026-01-01 00:00 HKT.
expect("2025-12-31T16:00:00Z", "2026-01-01",
  "year rollover across the HKT boundary");
// Just before it, still 2025-12-31 in HKT.
expect("2025-12-31T15:59:00Z", "2025-12-31",
  "23:59 HKT on New Year's Eve -> still previous year");

// --- Result ----------------------------------------------------------------
console.log("");
if (failures === 0) {
  console.log("All HKT date-boundary checks passed.");
  process.exit(0);
} else {
  console.error(`${failures} check(s) FAILED.`);
  process.exit(1);
}
