/*
 * arrivals-data.js — Kai Tak ARRIVALS board live data layer.
 *
 * Parallel to data.js (the departures data layer). Polls GET /api/arrivals
 * every ~60s (with jitter), transforms raw worker rows into the display
 * view-model arrivals-board.js's renderRow() expects, selects the next
 * KaiTakArr.ROW_COUNT flights, and feeds them into the row elements
 * arrivals-board.js already built. Flight *identity* (by primary flight
 * number) is tracked independently of row *position* so that when a flight
 * leaves the list, the remaining flights' content cascades upward with a
 * stagger instead of the whole board re-rendering at once.
 *
 * Reuses destinations.json (IATA -> {en, zh}; a port of origin is looked up
 * the same way as a destination) and airlines.json (ICAO -> {name, iata}) —
 * both direction-agnostic. Touches none of the departures files; talks only
 * to the public seam window.KaiTakArr documented in arrivals-board.js.
 */
(function (global) {
  'use strict';

  var KaiTak = global.KaiTakArr;
  if (!KaiTak) {
    console.error('[KaiTak] arrivals-data.js loaded before arrivals-board.js — aborting.');
    return;
  }

  var ROW_COUNT = KaiTak.ROW_COUNT;

  // ---- Tunables -----------------------------------------------------------
  // Upstream status/times barely change minute-to-minute (HKIA's feed lags
  // 40-60 min), so fetching every 4 min is plenty fresh and eases upstream
  // load. Board advancement (evicting stale rows, bumping in the next batch)
  // is driven separately by RESELECT_INTERVAL_MS below, which re-runs the
  // wall-clock selection against the last fetch without hitting the network.
  var POLL_INTERVAL_MS = 4 * 60 * 1000; // 4 min
  var POLL_JITTER_MS = 15000; // +/- 15s, so multiple tabs don't sync on the edge cache boundary
  var RESELECT_INTERVAL_MS = 60000; // re-evict/advance against the clock every 60s (no fetch)
  var TERMINAL_TTL_MS = 2 * 60 * 1000; // keep an AT GATE/LANDED flight visible ~2 min
  // Statuses HKIA's feed can leave "stuck" on for a long time without ever
  // flipping to the next state (mirrors departures' GATE CLOSED finding) —
  // without a TTL these rows never leave the board.
  var TERMINAL_STATUSES = { 'AT GATE': true, LANDED: true };
  // Evict any row whose own (possibly revised) time is this far in the past
  // regardless of status text — mirrors departures' BOARDING/FINAL CALL
  // finding; the same feed staleness affects arrivals statuses too.
  var STALE_THRESHOLD_MIN = 40;
  var CASCADE_STAGGER_MS = 150; // per-row stagger below the divergence point
  var BLANK_HOLD_MS = 350; // blank a row before flipping in its bumped-up content
  var ROTATION_INTERVAL_MS = 10000; // codeshare rotation cadence

  // ---- Module state ---------------------------------------------------------
  var rowEls = []; // the 12 .krow elements built by arrivals-board.js's buildBoard()
  var boardEl = null; // .board.arrivals root — toggles the .is-stale class
  var origins = {}; // IATA -> {en, zh}, loaded once from destinations.json
  var airlines = {}; // ICAO -> {name, iata}, loaded once from airlines.json

  var previousKeys = []; // flight-identity keys currently shown, aligned to rowEls
  var currentItems = []; // transformed items currently shown, aligned to rowEls (or null)
  var lastItems = []; // last full fetched+mapped item list, for clock-only re-selection
  var isFirstLoad = true;

  var terminalFirstSeen = new Map(); // flightKey -> ms timestamp first seen in a terminal status
  var rotationIndex = new Map(); // flightKey -> which codeshare index is currently shown

  // ---- Status vocabulary mapping ------------------------------------------
  // Raw HKIA arrivals vocabulary (lang=en), sampled live: empty (scheduled,
  // not yet arrived), "Est at HH:MM", "Landed HH:MM", "At gate HH:MM"
  // (sometimes with a trailing "(DD/MM/YYYY)" for a previous-day arrival).
  // Cancelled/Delayed/Diverted are handled defensively (not seen in the
  // sample but plausible and cheap to cover). AT GATE is the terminal state,
  // the arrivals analogue of departures' "Dep HH:MM".
  // Returns a bilingual status label plus an optional red-column time string:
  // { en, zh, time } where `time` is a "H.MM" actual/estimated arrival time (for
  // the red arrival-time drums) or '' when the status carries no time.
  function mapStatus(raw) {
    var s = raw == null ? '' : String(raw).trim();
    if (s === '') return { en: '', zh: '', time: '', rawTime: '' };
    var lower = s.toLowerCase();
    var m = s.match(/(\d{1,2}:\d{2})/);
    var rawTime = m ? m[1] : '';
    var time = m ? KaiTak.formatTime(m[1]) : '';

    if (lower.indexOf('cancel') === 0) return { en: 'CANCELLED', zh: '取消', time: '', rawTime: '' };
    if (lower.indexOf('divert') === 0) return { en: 'DIVERTED', zh: '轉飛', time: '', rawTime: '' };
    // "At gate 11:53" / "At gate 23:38 (05/07/2026)" — revised time supersedes
    // the original schedule for sort purposes.
    if (lower.indexOf('at gate') === 0) return { en: 'AT GATE', zh: '已到閘', time: time, rawTime: rawTime };
    // "Landed 07:32"
    if (lower.indexOf('landed') === 0) return { en: 'LANDED', zh: '已降落', time: time, rawTime: rawTime };
    // "Est at 08:37"
    if (lower.indexOf('est') === 0) return { en: 'DELAYED', zh: '延遲', time: time, rawTime: rawTime };
    if (lower.indexOf('delay') === 0) return { en: 'DELAYED', zh: '延遲', time: '', rawTime: '' };

    // Unrecognized status text: surface it uppercased rather than dropping it.
    return { en: s.toUpperCase(), zh: '', time: '', rawTime: '' };
  }

  // ---- Origin lookup (reuses destinations.json) ---------------------------
  function lookupOrigin(iata) {
    var entry = iata ? origins[iata] : null;
    if (!entry) {
      console.warn('[KaiTak] missing origin for IATA code:', iata);
      return { en: iata || '', zh: '' };
    }
    return entry;
  }

  // ---- Airline lookup -------------------------------------------------------
  // The API's `airline` field is the flight's ICAO code (e.g. "CPA", "HKE").
  // airlines.json maps that to a short display IATA code plus the full name for
  // a native tooltip. Falls back to the raw ICAO code (and no tooltip) when the
  // code isn't in the table.
  function lookupAirline(icao) {
    var entry = icao ? airlines[icao] : null;
    if (!entry) {
      if (icao) console.warn('[KaiTak] missing airline for ICAO code:', icao);
      return { code: icao || '', name: '' };
    }
    return { code: entry.iata || icao || '', name: entry.name || '' };
  }

  // ---- Raw row -> identity + display model ----------------------------------

  // A flight's identity is its primary (first-listed) flight number; that's
  // what stays stable across codeshare rotation and row-position cascades.
  function flightKey(raw) {
    var flights = raw.flights || [];
    if (flights[0] && flights[0].no) return String(flights[0].no);
    // Fallback for malformed rows without a flight number: best-effort key.
    return (raw.originIata || '?') + '|' + (raw.scheduled || '?');
  }

  function toMinutes(hhmm) {
    var m = String(hhmm == null ? '' : hhmm).match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return Infinity;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  }

  // Current wall-clock time in Hong Kong, as minutes since midnight —
  // computed explicitly (not from the device's own clock/timezone) so a
  // misconfigured display still compares against real HKT.
  function nowMinutesHKT() {
    var parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Hong_Kong', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date());
    var h = 0, m = 0;
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].type === 'hour') h = parseInt(parts[i].value, 10);
      if (parts[i].type === 'minute') m = parseInt(parts[i].value, 10);
    }
    return h * 60 + m;
  }

  function transformRow(raw) {
    return {
      key: flightKey(raw),
      raw: raw,
      mappedStatus: mapStatus(raw.status),
    };
  }

  // Build the display view-model renderRow() expects. `flightIndex` selects
  // which codeshare entry is shown in the airline/flight cells (rotation).
  function displayModelFor(item, flightIndex) {
    var raw = item.raw;
    var flights = raw.flights || [];
    var chosen = flights[flightIndex] || flights[0] || {};
    var origin = lookupOrigin(raw.originIata);
    var air = lookupAirline(chosen.airline);
    var status = item.mappedStatus;

    return {
      // Display the resolved short IATA code (e.g. ICAO "CPA" -> "CX"); the raw
      // ICAO code is the graceful fallback for carriers not in airlines.json.
      airline: air.code,
      airlineName: air.name,
      flightNo: chosen.no || '',
      originEN: origin.en,
      originZH: origin.zh,
      scheduled: KaiTak.formatTime(raw.scheduled),
      // Reclaim belt (e.g. "14"); blank until assigned.
      baggage: raw.baggage == null ? '' : String(raw.baggage),
      statusEN: status.en,
      statusZH: status.zh,
      // Actual/estimated arrival time for the red drums; '' when none.
      arrtime: status.time,
      lamp: KaiTak.isLampLit(status.en),
    };
  }

  // ---- Row selection ---------------------------------------------------------
  // Next ROW_COUNT flights ordered by scheduled time, excluding CANCELLED,
  // and excluding flights that have been AT GATE (fully arrived) for more than
  // ~2 minutes — so upcoming/landing flights lead and just-arrived ones linger
  // briefly before cascading off.
  function effectiveMinutes(item) {
    var revised = item.mappedStatus.rawTime;
    return toMinutes(revised || item.raw.scheduled);
  }

  function selectRows(items, now) {
    var presentKeys = Object.create(null);
    var candidates = [];
    var nowMin = nowMinutesHKT();

    items.forEach(function (item) {
      presentKeys[item.key] = true;

      if (item.mappedStatus.en === 'CANCELLED') return;

      // Safety net independent of status text: HKIA's feed can stall on any
      // status for 90+ min without ever updating, not just the tracked
      // terminal statuses below. Anything this far past its own (possibly
      // revised) time is stuck data, not a real upcoming arrival.
      if (nowMin - effectiveMinutes(item) > STALE_THRESHOLD_MIN) return;

      var statusEn = item.mappedStatus.en;
      if (TERMINAL_STATUSES[statusEn]) {
        var firstSeen = terminalFirstSeen.get(item.key);
        if (firstSeen == null) {
          // A flight already terminal (AT GATE or LANDED) the first time we
          // ever see it arrived before we started watching — e.g. a cold load
          // landing on a bank of just-landed flights — so it must not fill the
          // board. Only keep a terminal flight we witnessed live (its key was
          // on the previous frame); then hold it up to TERMINAL_TTL_MS, since
          // HKIA can park a flight on LANDED for minutes without ever flipping
          // to At gate HH:MM.
          if (previousKeys.indexOf(item.key) === -1) return;
          terminalFirstSeen.set(item.key, now);
        } else if (now - firstSeen > TERMINAL_TTL_MS) {
          return; // lingered too long in this terminal status
        }
      }

      candidates.push(item);
    });

    // Housekeeping: drop tracking for flights no longer present at all so the
    // maps don't grow unbounded.
    terminalFirstSeen.forEach(function (_, key) {
      if (!presentKeys[key]) terminalFirstSeen.delete(key);
    });
    rotationIndex.forEach(function (_, key) {
      if (!presentKeys[key]) rotationIndex.delete(key);
    });

    candidates.sort(function (a, b) {
      return effectiveMinutes(a) - effectiveMinutes(b);
    });

    return candidates.slice(0, ROW_COUNT);
  }

  // ---- Roll-up cascade -------------------------------------------------------
  // Lowest index where the old and new flight-identity lists diverge.
  function findDivergeIndex(oldKeys, newKeys) {
    var len = Math.max(oldKeys.length, newKeys.length);
    for (var i = 0; i < len; i++) {
      if (oldKeys[i] !== newKeys[i]) return i;
    }
    return len;
  }

  function applySelection(selected) {
    var newItems = selected.slice(0, ROW_COUNT);
    while (newItems.length < ROW_COUNT) newItems.push(null);
    var newKeys = newItems.map(function (item) {
      return item ? item.key : null;
    });

    // First load: populate all 12 rows at once, no cascade — rows start blank,
    // so this already reads as a "flap in from blank" rather than a staggered
    // reveal.
    var divergeIndex = isFirstLoad ? ROW_COUNT : findDivergeIndex(previousKeys, newKeys);
    isFirstLoad = false;

    for (var i = 0; i < ROW_COUNT; i++) {
      var item = newItems[i];
      var flightIdx = item ? rotationIndex.get(item.key) || 0 : 0;
      var model = item ? displayModelFor(item, flightIdx) : {};

      if (i < divergeIndex) {
        // Above (or at, when nothing diverged) the removal point: update
        // together/immediately. renderRow() no-ops on unchanged cell values,
        // so identical content simply doesn't animate.
        KaiTak.renderRow(rowEls[i], model);
      } else {
        // Below the removal point: blank the row first, then flip in the
        // bumped-up content — matches a real board clearing a row before
        // setting it, rather than flipping straight from the old flight's
        // chars to the new one's.
        var blankDelay = CASCADE_STAGGER_MS * (i - divergeIndex);
        var fillDelay = blankDelay + BLANK_HOLD_MS;
        (function (rowEl, rowModel) {
          setTimeout(function () { KaiTak.renderRow(rowEl, {}); }, blankDelay);
          setTimeout(function () { KaiTak.renderRow(rowEl, rowModel); }, fillDelay);
        })(rowEls[i], model);
      }
    }

    currentItems = newItems;
    previousKeys = newKeys;
  }

  // ---- Codeshare rotation ----------------------------------------------------
  function rotationTick() {
    for (var i = 0; i < ROW_COUNT; i++) {
      var item = currentItems[i];
      if (!item) continue;
      var flights = item.raw.flights || [];
      if (flights.length < 2) continue;

      var idx = ((rotationIndex.get(item.key) || 0) + 1) % flights.length;
      rotationIndex.set(item.key, idx);

      // Other fields recompute identically from the same raw row, so
      // renderRow() flips only the airline/flight cells that actually change.
      KaiTak.renderRow(rowEls[i], displayModelFor(item, idx));
    }
  }

  // ---- Stale indicator -------------------------------------------------------
  function setStale(isStale) {
    if (!boardEl) return;
    boardEl.classList.toggle('is-stale', !!isStale);
  }

  // ---- Polling ---------------------------------------------------------------
  function poll() {
    return fetch('/api/arrivals')
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        var rawRows = Array.isArray(data && data.rows) ? data.rows : [];
        lastItems = rawRows.map(transformRow);
        applySelection(selectRows(lastItems, Date.now()));
        setStale(data && data.stale);
      })
      .catch(function (err) {
        // Leave the board showing its last-known state; just log and retry.
        console.error('[KaiTak] arrivals poll failed:', err);
      });
  }

  function scheduleNextPoll() {
    var jitter = (Math.random() * 2 - 1) * POLL_JITTER_MS;
    setTimeout(function () {
      poll().then(scheduleNextPoll, scheduleNextPoll);
    }, POLL_INTERVAL_MS + jitter);
  }

  // Re-run the wall-clock selection against the last fetch (no network), so
  // rows that cross the staleness cutoff evict and the next batch bumps in
  // promptly between the slower fetches.
  function reselect() {
    if (lastItems.length) applySelection(selectRows(lastItems, Date.now()));
  }

  // ---- Boot -------------------------------------------------------------------
  function loadOrigins() {
    return fetch('destinations.json')
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (json) {
        origins = json || {};
      })
      .catch(function (err) {
        console.error('[KaiTak] failed to load destinations.json:', err);
        origins = {};
      });
  }

  function loadAirlines() {
    return fetch('airlines.json')
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (json) {
        airlines = json || {};
      })
      .catch(function (err) {
        console.error('[KaiTak] failed to load airlines.json:', err);
        airlines = {};
      });
  }

  function init() {
    var rowsContainer = document.getElementById('rows');
    rowEls = rowsContainer ? Array.prototype.slice.call(rowsContainer.children) : [];
    boardEl = document.querySelector('.board.arrivals');
    currentItems = new Array(ROW_COUNT).fill(null);

    Promise.all([loadOrigins(), loadAirlines()]).then(function () {
      poll().then(scheduleNextPoll, scheduleNextPoll);
      setInterval(rotationTick, ROTATION_INTERVAL_MS);
      setInterval(reselect, RESELECT_INTERVAL_MS);
    });

    // A board left in a background tab gets throttled timers; poll as soon as
    // it's visible again rather than waiting out the remainder of the cycle.
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) poll();
    });
  }

  // arrivals-board.js's own DOMContentLoaded listener (registered first, since
  // its <script> tag precedes this one) builds the row elements; ours runs after.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : this);
