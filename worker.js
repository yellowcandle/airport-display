// Kai Tak Departure Board — Cloudflare Worker
//
// Serves the static board (via the [assets] binding) and proxies live
// Hong Kong International Airport departures at GET /api/departures.
//
// Why a proxy: the HKIA flight-info API returns 403 to any request that
// carries an `Origin` header, so a browser can never call it directly.
// The Worker fetches server-side (no Origin), trims the payload, caches
// it at the edge for 60s, and falls back to the last cached copy
// (marked `stale: true`) when the upstream is unreachable.

const HKIA_BASE = "https://www.hongkongairport.com/flightinfo-rest/rest/flights/past";
const CACHE_TTL_SECONDS = 60;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/departures") {
      return handleDepartures(request, ctx);
    }

    // Anything else is a static asset (index.html, board.js, destinations.json…).
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response("Not found", { status: 404 });
  },
};

// Compute today's date (YYYY-MM-DD) in the Asia/Hong_Kong timezone,
// regardless of where the Worker's server clock lives.
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

function upstreamUrl(date) {
  return `${HKIA_BASE}?date=${date}&lang=en&cargo=false&arrival=false`;
}

// Trim one upstream list item down to the fields the board renders.
function trimRow(item) {
  return {
    flights: Array.isArray(item.flight) ? item.flight : [],
    destIata: Array.isArray(item.destination) ? item.destination[0] : undefined,
    scheduled: item.time,
    terminal: item.terminal,
    aisle: item.aisle,
    gate: item.gate,
    status: item.status,
  };
}

// Given the upstream response (an array of {date, arrival, cargo, list}
// objects spanning a couple of days), pick the entry matching today's HKT
// date and return its trimmed rows.
function extractRows(payload, date) {
  const days = Array.isArray(payload) ? payload : [];
  // Prefer the entry whose date matches today (HKT); fall back to the last
  // passenger-departure entry the API returned.
  let day =
    days.find((d) => d.date === date && d.arrival === false && d.cargo === false) ||
    days.find((d) => d.arrival === false && d.cargo === false) ||
    days[days.length - 1];
  const list = day && Array.isArray(day.list) ? day.list : [];
  return list.map(trimRow);
}

async function handleDepartures(request, ctx) {
  const date = hktDate();
  const target = upstreamUrl(date);
  const cache = caches.default;
  // Cache key is the upstream URL (stable per date+lang), independent of the
  // incoming request URL so all board tabs share one cached copy.
  const cacheKey = new Request(target, { method: "GET" });

  // 1) Fresh cache hit → serve immediately.
  const cached = await cache.match(cacheKey);
  if (cached) {
    return withCors(cached.clone());
  }

  // 2) No fresh copy → fetch upstream.
  try {
    const upstream = await fetch(target, {
      headers: { Accept: "application/json" },
      // Note: we deliberately do NOT forward the browser's Origin header.
    });
    if (!upstream.ok) {
      throw new Error(`Upstream ${upstream.status}`);
    }
    const payload = await upstream.json();
    const rows = extractRows(payload, date);
    const body = JSON.stringify({ rows, stale: false });

    const response = jsonResponse(body, {
      "Cache-Control": `max-age=${CACHE_TTL_SECONDS}`,
    });

    // Store a cacheable copy under the upstream key. Keep this fresh copy for
    // the TTL; also stash a long-lived stale copy for failure fallback.
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    ctx.waitUntil(cache.put(staleKey(target), staleCopy(body)));

    return withCors(response);
  } catch (err) {
    // 3) Upstream failed → serve the last stale copy if we have one.
    const stale = await cache.match(staleKey(target));
    if (stale) {
      const text = await stale.text();
      const data = JSON.parse(text);
      data.stale = true;
      return withCors(jsonResponse(JSON.stringify(data), { "Cache-Control": "no-store" }));
    }
    // Nothing cached at all — surface an error the client can show.
    return withCors(
      jsonResponse(JSON.stringify({ rows: [], stale: true, error: String(err) }), {
        "Cache-Control": "no-store",
      }, 502)
    );
  }
}

// A separate, long-lived cache key holding the last good payload for
// stale-on-failure fallback (never expires via TTL; overwritten on success).
function staleKey(target) {
  return new Request(target + "&__stale=1", { method: "GET" });
}

function staleCopy(body) {
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // Long TTL so the fallback survives well past the fresh window.
      "Cache-Control": "max-age=86400",
    },
  });
}

function jsonResponse(body, extraHeaders = {}, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

function withCors(response) {
  const r = new Response(response.body, response);
  r.headers.set("Access-Control-Allow-Origin", "*");
  return r;
}
