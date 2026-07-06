/*
 * data.js — Kai Tak departure board live data layer (task 4.1–4.5).
 *
 * Polls GET /api/departures every ~60s (with jitter), transforms raw worker
 * rows into the display view-model board.js's renderRow() expects, selects
 * the next KaiTak.ROW_COUNT flights, and feeds them into the row elements
 * board.js already built. Flight *identity* (by primary flight number) is
 * tracked independently of row *position* so that when a flight leaves the
 * list, the remaining flights' content cascades upward with a stagger
 * instead of the whole board re-rendering at once (see applySelection()).
 *
 * Does not touch worker.js, flap.js, destinations.json, or board.js's
 * renderRow/flap-cell internals — this file only calls the public seam
 * (window.KaiTak) documented at the top of board.js.
 */
(function (global) {
  'use strict';

  var KaiTak = global.KaiTak;
  if (!KaiTak) {
    console.error('[KaiTak] data.js loaded before board.js — aborting.');
    return;
  }

  var ROW_COUNT = KaiTak.ROW_COUNT;

  // ---- Tunables -----------------------------------------------------------
  var POLL_INTERVAL_MS = 60000; // 60s
  var POLL_JITTER_MS = 5000; // +/- 5s, so multiple tabs don't sync on the edge cache boundary
  var DEPARTED_TTL_MS = 2 * 60 * 1000; // keep a DEPARTED flight visible ~2 min
  var CASCADE_STAGGER_MS = 150; // per-row stagger below the divergence point
  var ROTATION_INTERVAL_MS = 10000; // codeshare rotation cadence

  // ---- Module state ---------------------------------------------------------
  var rowEls = []; // the 12 .krow elements built by board.js's buildBoard()
  var boardEl = null; // .board.kaitak root — toggles the .is-stale class
  var destinations = {}; // IATA -> {en, zh}, loaded once from destinations.json
  var airlines = {}; // ICAO -> {name, iata}, loaded once from airlines.json

  var previousKeys = []; // flight-identity keys currently shown, aligned to rowEls
  var currentItems = []; // transformed items currently shown, aligned to rowEls (or null)
  var isFirstLoad = true;

  var departedFirstSeen = new Map(); // flightKey -> ms timestamp first seen DEPARTED
  var rotationIndex = new Map(); // flightKey -> which codeshare index is currently shown

  // ---- Status vocabulary mapping (departures-data spec / design D7) -------
  // Raw HKIA vocabulary (lang=en): empty, "Est HH:MM", "Boarding", "Boarding
  // Soon", "Final Call", "Gate Closed", "Dep HH:MM", "Cancelled".
  // Returns a bilingual status label plus an optional red-column time string:
  // { en, zh, time } where `time` is a "H.MM" revised/actual departure time (for
  // the red departure drums) or '' when the status carries no time.
  function mapStatus(raw) {
    var s = raw == null ? '' : String(raw).trim();
    if (s === '') return { en: '', zh: '', time: '', rawTime: '' };
    var lower = s.toLowerCase();
    var m = s.match(/(\d{1,2}:\d{2})/);
    var rawTime = m ? m[1] : '';
    var time = m ? KaiTak.formatTime(m[1]) : '';

    if (lower.indexOf('cancel') === 0) return { en: 'CANCELLED', zh: '取消', time: '', rawTime: '' };
    // DELAYED/DEPARTED carry a revised/actual time that supersedes the
    // original schedule for sort purposes (a 3-hour-delayed 11:35 flight
    // shouldn't keep squatting at the top of the board).
    if (lower.indexOf('est') === 0) return { en: 'DELAYED', zh: '延遲', time: time, rawTime: rawTime };
    if (lower.indexOf('final call') === 0) return { en: 'FINAL CALL', zh: '最後召集', time: '', rawTime: '' };
    if (lower.indexOf('gate closed') === 0) return { en: 'GATE CLOSED', zh: '閘口關閉', time: '', rawTime: '' };
    if (lower.indexOf('dep') === 0) return { en: 'DEPARTED', zh: '已起飛', time: time, rawTime: rawTime };

    if (lower.indexOf('boarding') === 0) {
      return lower.indexOf('soon') >= 0
        ? { en: 'PREPARING', zh: '準備登機', time: '', rawTime: '' }
        : { en: 'BOARDING', zh: '登機', time: '', rawTime: '' };
    }

    // Unrecognized status text: surface it uppercased rather than dropping it.
    return { en: s.toUpperCase(), zh: '', time: '', rawTime: '' };
  }

  // ---- Destination lookup ---------------------------------------------------
  function lookupDest(iata) {
    var entry = iata ? destinations[iata] : null;
    if (!entry) {
      console.warn('[KaiTak] missing destination for IATA code:', iata);
      return { en: iata || '', zh: '' };
    }
    return entry;
  }

  // ---- Airline lookup -------------------------------------------------------
  // The API's `airline` field is the flight's ICAO code (e.g. "CPA", "ETH").
  // airlines.json maps that to a short display IATA code plus the full name for
  // a native-tooltip. Falls back to the raw ICAO code (and no tooltip) when the
  // code isn't in the table, so unknown carriers still render, just untranslated.
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
    return (raw.destIata || '?') + '|' + (raw.scheduled || '?');
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
    var dest = lookupDest(raw.destIata);
    var air = lookupAirline(chosen.airline);
    var status = item.mappedStatus;

    return {
      // Display the resolved short IATA code (e.g. ICAO "CPA" -> "CX"); the raw
      // ICAO code is the graceful fallback for carriers not in airlines.json.
      airline: air.code,
      // Full airline name for the native tooltip on the airline card.
      airlineName: air.name,
      flightNo: chosen.no || '',
      destEN: dest.en,
      destZH: dest.zh,
      scheduled: KaiTak.formatTime(raw.scheduled),
      // HKIA departure gate (e.g. "216"); blank until assigned.
      gate: raw.gate == null ? '' : String(raw.gate),
      statusEN: status.en,
      statusZH: status.zh,
      // Revised/actual departure time for the red drums; '' when none.
      departure: status.time,
      lamp: KaiTak.isLampLit(status.en),
    };
  }

  // ---- Row selection (4.2) ---------------------------------------------------
  // Next ROW_COUNT flights ordered by scheduled time, excluding CANCELLED,
  // and excluding flights that have been DEPARTED for more than ~2 minutes.
  function selectRows(items, now) {
    var presentKeys = Object.create(null);
    var candidates = [];

    items.forEach(function (item) {
      presentKeys[item.key] = true;

      if (item.mappedStatus.en === 'CANCELLED') return;

      if (item.mappedStatus.en === 'DEPARTED') {
        var firstSeen = departedFirstSeen.get(item.key);
        if (firstSeen == null) {
          // Grace period only for flights we were showing when they departed;
          // flights already departed the first time we see them (e.g. this
          // morning's 00:05 flights on page load) drop out immediately.
          if (previousKeys.indexOf(item.key) === -1) return;
          departedFirstSeen.set(item.key, now);
        } else if (now - firstSeen > DEPARTED_TTL_MS) {
          return; // expired off the board
        }
      }

      candidates.push(item);
    });

    // Housekeeping: drop tracking for flights no longer present at all
    // (e.g. yesterday's list rolled off) so the maps don't grow unbounded.
    departedFirstSeen.forEach(function (_, key) {
      if (!presentKeys[key]) departedFirstSeen.delete(key);
    });
    rotationIndex.forEach(function (_, key) {
      if (!presentKeys[key]) rotationIndex.delete(key);
    });

    function effectiveMinutes(item) {
      var revised = item.mappedStatus.rawTime;
      return toMinutes(revised || item.raw.scheduled);
    }

    candidates.sort(function (a, b) {
      return effectiveMinutes(a) - effectiveMinutes(b);
    });

    return candidates.slice(0, ROW_COUNT);
  }

  // ---- Roll-up cascade (4.4) -------------------------------------------------
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

    // First load: populate all 12 rows at once, no cascade — rows start
    // blank (board.js no longer seeds demo data), so this already reads as
    // a "flap in from blank" rather than a staggered reveal.
    var divergeIndex = isFirstLoad ? ROW_COUNT : findDivergeIndex(previousKeys, newKeys);
    isFirstLoad = false;

    for (var i = 0; i < ROW_COUNT; i++) {
      var item = newItems[i];
      var flightIdx = item ? rotationIndex.get(item.key) || 0 : 0;
      var model = item ? displayModelFor(item, flightIdx) : {};

      if (i < divergeIndex) {
        // Above (or at, when nothing diverged) the removal point: update
        // together/immediately. renderRow() no-ops on unchanged cell
        // values, so identical content simply doesn't animate.
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

  // ---- Codeshare rotation (4.5) ----------------------------------------------
  function rotationTick() {
    for (var i = 0; i < ROW_COUNT; i++) {
      var item = currentItems[i];
      if (!item) continue;
      var flights = item.raw.flights || [];
      if (flights.length < 2) continue;

      var idx = ((rotationIndex.get(item.key) || 0) + 1) % flights.length;
      rotationIndex.set(item.key, idx);

      // Other fields are recomputed identically from the same raw row, so
      // renderRow() flips only the airline/flight cells that actually change.
      KaiTak.renderRow(rowEls[i], displayModelFor(item, idx));
    }
  }

  // ---- Stale indicator (5.1) -------------------------------------------------
  // The worker sets `stale: true` when it had to serve its last cached copy
  // because the HKIA upstream was unreachable. We keep showing that last-known
  // data (never blank the board) and just toggle a subtle corner label. The
  // class is cleared again on the next poll that returns fresh data.
  function setStale(isStale) {
    if (!boardEl) return;
    boardEl.classList.toggle('is-stale', !!isStale);
  }

  // ---- Polling (4.1) ---------------------------------------------------------
  function poll() {
    return fetch('/api/departures')
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
        // Leave the board showing its last-known state; just log and retry
        // on the next cycle.
        console.error('[KaiTak] departures poll failed:', err);
      });
  }

  function scheduleNextPoll() {
    var jitter = (Math.random() * 2 - 1) * POLL_JITTER_MS;
    setTimeout(function () {
      poll().then(scheduleNextPoll, scheduleNextPoll);
    }, POLL_INTERVAL_MS + jitter);
  }

  // ---- Boot -------------------------------------------------------------------
  function loadDestinations() {
    return fetch('destinations.json')
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (json) {
        destinations = json || {};
      })
      .catch(function (err) {
        console.error('[KaiTak] failed to load destinations.json:', err);
        destinations = {};
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
    boardEl = document.querySelector('.board.kaitak');
    currentItems = new Array(ROW_COUNT).fill(null);

    Promise.all([loadDestinations(), loadAirlines()]).then(function () {
      poll().then(scheduleNextPoll, scheduleNextPoll);
      setInterval(rotationTick, ROTATION_INTERVAL_MS);
    });

    // A board left in a background tab gets throttled timers; poll as soon as
    // it's visible again rather than waiting out the remainder of the cycle.
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) poll();
    });
  }

  // board.js's own DOMContentLoaded listener (registered first, since its
  // <script> tag precedes this one) builds the row elements; ours runs after.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : this);
