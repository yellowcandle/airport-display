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
  var POLL_INTERVAL_MS = 60000; // 60s
  var POLL_JITTER_MS = 5000; // +/- 5s, so multiple tabs don't sync on the edge cache boundary
  var ARRIVED_TTL_MS = 2 * 60 * 1000; // keep an AT GATE (arrived) flight visible ~2 min
  var CASCADE_STAGGER_MS = 150; // per-row stagger below the divergence point
  var ROTATION_INTERVAL_MS = 10000; // codeshare rotation cadence

  // ---- Module state ---------------------------------------------------------
  var rowEls = []; // the 12 .krow elements built by arrivals-board.js's buildBoard()
  var boardEl = null; // .board.arrivals root — toggles the .is-stale class
  var origins = {}; // IATA -> {en, zh}, loaded once from destinations.json
  var airlines = {}; // ICAO -> {name, iata}, loaded once from airlines.json

  var previousKeys = []; // flight-identity keys currently shown, aligned to rowEls
  var currentItems = []; // transformed items currently shown, aligned to rowEls (or null)
  var isFirstLoad = true;

  var arrivedFirstSeen = new Map(); // flightKey -> ms timestamp first seen AT GATE
  var rotationIndex = new Map(); // flightKey -> which codeshare index is currently shown

  // ---- Status vocabulary mapping ------------------------------------------
  // Raw HKIA arrivals vocabulary (lang=en), sampled live: empty (scheduled,
  // not yet arrived), "Est at HH:MM", "Landed HH:MM", "At gate HH:MM"
  // (sometimes with a trailing "(DD/MM/YYYY)" for a previous-day arrival).
  // Cancelled/Delayed/Diverted are handled defensively (not seen in the
  // sample but plausible and cheap to cover). AT GATE is the terminal state,
  // the arrivals analogue of departures' "Dep HH:MM".
  function mapStatus(raw) {
    var s = raw == null ? '' : String(raw).trim();
    if (s === '') return '';
    var lower = s.toLowerCase();

    if (lower.indexOf('cancel') === 0) return 'CANCELLED';
    if (lower.indexOf('divert') === 0) return 'DIVERTED';
    if (lower.indexOf('delay') === 0) return 'DELAYED';

    // "At gate 11:53" / "At gate 23:38 (05/07/2026)" -> "AT GATE 11.53"
    if (lower.indexOf('at gate') === 0) {
      var mg = s.match(/(\d{1,2}:\d{2})/);
      return 'AT GATE' + (mg ? ' ' + KaiTak.formatTime(mg[1]) : '');
    }
    // "Landed 07:32" -> "LANDED 7.32"
    if (lower.indexOf('landed') === 0) {
      var ml = s.match(/(\d{1,2}:\d{2})/);
      return 'LANDED' + (ml ? ' ' + KaiTak.formatTime(ml[1]) : '');
    }
    // "Est at 08:37" -> "EST 8.37"
    if (lower.indexOf('est') === 0) {
      var me = s.match(/(\d{1,2}:\d{2})/);
      return 'EST ' + (me ? KaiTak.formatTime(me[1]) : '');
    }

    // Unrecognized status text: surface it uppercased rather than dropping it.
    return s.toUpperCase();
  }

  // Terminal (fully-arrived) state — the row is done and starts its grace
  // countdown, mirroring how departures treats "DEPARTED".
  function isArrived(mappedStatus) {
    return mappedStatus.indexOf('AT GATE') === 0;
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
      status: item.mappedStatus,
      lamp: KaiTak.isLampLit(item.mappedStatus),
    };
  }

  // ---- Row selection ---------------------------------------------------------
  // Next ROW_COUNT flights ordered by scheduled time, excluding CANCELLED,
  // and excluding flights that have been AT GATE (fully arrived) for more than
  // ~2 minutes — so upcoming/landing flights lead and just-arrived ones linger
  // briefly before cascading off.
  function selectRows(items, now) {
    var presentKeys = Object.create(null);
    var candidates = [];

    items.forEach(function (item) {
      presentKeys[item.key] = true;

      if (item.mappedStatus === 'CANCELLED') return;

      if (isArrived(item.mappedStatus)) {
        var firstSeen = arrivedFirstSeen.get(item.key);
        if (firstSeen == null) {
          firstSeen = now;
          arrivedFirstSeen.set(item.key, firstSeen);
        }
        if (now - firstSeen > ARRIVED_TTL_MS) return; // expired off the board
      }

      candidates.push(item);
    });

    // Housekeeping: drop tracking for flights no longer present at all so the
    // maps don't grow unbounded.
    arrivedFirstSeen.forEach(function (_, key) {
      if (!presentKeys[key]) arrivedFirstSeen.delete(key);
    });
    rotationIndex.forEach(function (_, key) {
      if (!presentKeys[key]) rotationIndex.delete(key);
    });

    candidates.sort(function (a, b) {
      return toMinutes(a.raw.scheduled) - toMinutes(b.raw.scheduled);
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
        var delay = CASCADE_STAGGER_MS * (i - divergeIndex);
        if (delay <= 0) {
          KaiTak.renderRow(rowEls[i], model);
        } else {
          (function (rowEl, rowModel) {
            setTimeout(function () {
              KaiTak.renderRow(rowEl, rowModel);
            }, delay);
          })(rowEls[i], model);
        }
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
        var items = rawRows.map(transformRow);
        applySelection(selectRows(items, Date.now()));
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
