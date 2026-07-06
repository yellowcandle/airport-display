/*
 * arrivals-board.js — Kai Tak ARRIVALS board rendering + layout.
 *
 * Parallel to board.js (the departures renderer) but for arriving flights.
 * It is deliberately self-contained: it duplicates the handful of tiny
 * helpers it needs from board.js (formatTime, fitBoard) rather than importing
 * them, so the departures files (board.js / index.html / data.js) stay
 * completely untouched and the two pages never load each other's scripts.
 *
 * Column set differs from departures: arrivals drop the departure-only
 * "check-in" (check-in aisle) and "embark" columns and add a "baggage"
 * (reclaim belt) column. Everything else — the flap engine (flap.js), the
 * card/drum cell composition, blank-first build, whole-board fit — mirrors
 * board.js.
 *
 * Reusable seam for the live data layer (arrivals-data.js): build a display
 * model per row and call `renderRow(rowEl, model)`. Helpers are exported on
 * `window.KaiTakArr` (mirroring board.js's `window.KaiTak`). `renderRow` is
 * idempotent per cell (flap.setValue no-ops on equal values), so re-calling
 * with changed fields flips only cells that actually changed.
 */
(function (global) {
  'use strict';

  // ---- Layout constants -------------------------------------------------
  // Slot counts must match the column widths in arrivals-board.css
  // (:root --col-arr-*) and board.css (--col-*).
  var FLIGHT_SLOTS = 7;
  var ORIGIN_EN_SLOTS = 12;
  var SCHED_SLOTS = 5;
  var BAGGAGE_SLOTS = 3; // reclaim belt e.g. "14"; 3 slots leaves room for "B3"
  var ARRTIME_SLOTS = 5; // actual/estimated arrival time, red drums
  var ROW_COUNT = 12;

  // Drum cell geometry (CELL.w must equal --cw in board.css).
  var CELL = { w: '20px', h: '28px', fs: '18px' };

  // Airline card colours — brand-ish backgrounds. Dark text where the
  // background is light enough to need it; off-white otherwise. (Same table
  // as board.js — carriers fly both directions.)
  var AIRLINE_COLORS = {
    CX: { bg: '#00594C', fg: '#F5F3EC' }, // Cathay Pacific teal
    KA: { bg: '#C8A951', fg: '#1A1A1A' }, // Dragonair gold (dark text)
    UA: { bg: '#14143C', fg: '#F5F3EC' }, // United navy
    NW: { bg: '#B01722', fg: '#F5F3EC' }, // Northwest red
    SQ: { bg: '#1B2B4B', fg: '#F5F3EC' }, // Singapore navy
    BR: { bg: '#0B5A34', fg: '#F5F3EC' }, // EVA green
    JL: { bg: '#B4131C', fg: '#F5F3EC' }, // JAL red
    TG: { bg: '#4B1E64', fg: '#F5F3EC' }, // Thai purple
    CZ: { bg: '#0E3A82', fg: '#F5F3EC' }, // China Southern blue
    _default: { bg: '#1A1A1A', fg: '#F5F3EC' }
  };

  // ---- Data-shaping helpers (reused by the live data layer) -------------

  // "09:10" -> "9.10"; drops the leading zero on the hour, dot separator.
  // (Duplicated from board.js so this page needs no departures scripts.)
  function formatTime(hhmm) {
    if (hhmm == null) return '';
    var m = String(hhmm).match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return '';
    return String(parseInt(m[1], 10)) + '.' + m[2];
  }

  // Lamp lit once the flight is on the ground and passengers/baggage are
  // arriving — i.e. status LANDED (just touched down) or AT GATE (parked,
  // baggage being delivered). This is the arrivals analogue of the departures
  // board lighting its lamp during BOARDING / FINAL CALL: it marks the rows a
  // viewer at the terminal should act on right now (head to the reclaim belt).
  function isLampLit(status) {
    if (!status) return false;
    var s = String(status).toUpperCase();
    return s.indexOf('LANDED') >= 0 || s.indexOf('AT GATE') >= 0;
  }

  // ---- Flap cell construction -------------------------------------------

  function makeDrumGroup(parent, n) {
    var arr = [];
    for (var i = 0; i < n; i++) {
      arr.push(global.createFlapCell(parent, {
        mode: 'drum', width: CELL.w, height: CELL.h, fontSize: CELL.fs
      }));
    }
    return arr;
  }

  // Fan a string across row drum cells; missing positions flip blank.
  function setGroup(arr, str) {
    str = str == null ? '' : String(str);
    for (var i = 0; i < arr.length; i++) {
      arr[i].setValue(str.charAt(i) || ' ');
    }
  }

  // Chinese city card is a fixed 96px column (~84px usable inside padding).
  // CJK glyph advance ~= 1em, so up to 4 chars fit at the base 17px; longer
  // names (e.g. 亞的斯亞貝巴, Addis Ababa) shrink to fit instead of clipping.
  function fitZh(cell, str) {
    str = str == null ? '' : String(str);
    cell.el.style.fontSize = (str.length > 4 ? Math.floor(84 / str.length) : 17) + 'px';
    cell.setValue(str);
  }

  // Build 9 grid cells + flap cells once; cached on the row element.
  function buildRowCells(rowEl) {
    function child(cls) {
      var d = document.createElement('div');
      d.className = 'kcell ' + cls;
      rowEl.appendChild(d);
      return d;
    }
    var airlineEl = child('airline');
    var flightEl = child('flight');
    var originENEl = child('destEN');   // reuse departures cell classes for
    var originZHEl = child('destzh');   // identical flap theming from board.css
    var schedEl = child('sched');
    var baggageEl = child('baggage');
    var statusEl = child('status');
    var arrtimeEl = child('arrtime');
    var lampEl = child('lamp');

    // Status is small backlit bilingual text (not flap cells), per the photo:
    // two spans (English over Chinese) built once and updated as plain text.
    var statusEn = document.createElement('span');
    statusEn.className = 'st-en';
    var statusZh = document.createElement('span');
    statusZh.className = 'st-zh';
    statusEl.appendChild(statusEn);
    statusEl.appendChild(statusZh);

    var lamp = document.createElement('span');
    lamp.className = 'lamp';
    lampEl.appendChild(lamp);

    return {
      airlineEl: airlineEl,
      airline: global.createLogoCell(airlineEl, {
        width: '50px', height: '26px', className: 'airline-card'
      }),
      flight: makeDrumGroup(flightEl, FLIGHT_SLOTS),
      originEN: makeDrumGroup(originENEl, ORIGIN_EN_SLOTS),
      originZH: global.createFlapCell(originZHEl, {
        mode: 'card', width: '96px', height: '26px', fontSize: '17px', className: 'zh-card'
      }),
      sched: makeDrumGroup(schedEl, SCHED_SLOTS),
      baggage: makeDrumGroup(baggageEl, BAGGAGE_SLOTS),
      statusEn: statusEn,
      statusZh: statusZh,
      arrtime: makeDrumGroup(arrtimeEl, ARRTIME_SLOTS),
      lamp: lamp
    };
  }

  /*
   * renderRow(rowEl, model) — reusable seam for the live data layer.
   *
   * `model` is the display view-model (all fields already formatted):
   *   { airline:'CX', airlineName:'Cathay Pacific', flightNo:'CX 713',
   *     originEN:'BANGKOK', originZH:'曼谷', scheduled:'9.10', baggage:'14',
   *     statusEN:'AT GATE', statusZH:'已到閘', arrtime:'11.53', lamp:true }
   * An empty/omitted model renders the row blank. Safe to call repeatedly on
   * the same rowEl: cells are built once, and no-op on unchanged values so
   * only changed cells re-flip.
   */
  function renderRow(rowEl, model) {
    var c = rowEl._cells || (rowEl._cells = buildRowCells(rowEl));
    model = model || {};

    // Brand colours drive the fallback chip shown when a carrier's logo is
    // unavailable (unknown code, CDN miss, or offline).
    var col = AIRLINE_COLORS[String(model.airline || '').toUpperCase()] || AIRLINE_COLORS._default;
    c.airlineEl.style.setProperty('--air-bg', col.bg);
    c.airlineEl.style.setProperty('--air-fg', col.fg);

    // Real carrier logo; 2-letter code doubles as the chip fallback, full name
    // (from airlines.json) is the hover tooltip.
    c.airline.setValue({ code: model.airline || '', name: model.airlineName || '' });
    setGroup(c.flight, model.flightNo);
    setGroup(c.originEN, model.originEN);
    fitZh(c.originZH, model.originZH || '');
    setGroup(c.sched, model.scheduled);
    setGroup(c.baggage, model.baggage);
    // Status is plain backlit text, not flaps — set only when changed.
    var stEn = model.statusEN || '';
    var stZh = model.statusZH || '';
    if (c.statusEn.textContent !== stEn) c.statusEn.textContent = stEn;
    if (c.statusZh.textContent !== stZh) c.statusZh.textContent = stZh;
    setGroup(c.arrtime, model.arrtime);

    if (model.lamp) c.lamp.classList.add('lit');
    else c.lamp.classList.remove('lit');
  }

  // ---- Board build + fit ------------------------------------------------

  function buildBoard() {
    var rows = document.getElementById('rows');
    var rowEls = [];
    for (var i = 0; i < ROW_COUNT; i++) {
      var el = document.createElement('div');
      el.className = 'krow';
      rows.appendChild(el);
      rowEls.push(el);
    }
    // Start every row blank; the live data layer (arrivals-data.js) populates
    // them on its first poll, giving the authentic "flap in from blank" look.
    for (var j = 0; j < ROW_COUNT; j++) {
      renderRow(rowEls[j], {});
    }
    return rowEls;
  }

  // Scale the whole frame uniformly so it fills the viewport without scrolling.
  // (Duplicated from board.js.)
  function fitBoard() {
    var frame = document.getElementById('frame');
    if (!frame) return;
    var s = Math.min(
      window.innerWidth / frame.offsetWidth,
      window.innerHeight / frame.offsetHeight
    );
    frame.style.transform = 'scale(' + s + ')';
  }

  function init() {
    buildBoard();
    fitBoard();
    window.addEventListener('resize', fitBoard);
    // Re-fit once web fonts land (metrics can shift the natural size a touch).
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(fitBoard);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Exported for the arrivals live data layer (arrivals-data.js).
  global.KaiTakArr = {
    renderRow: renderRow,
    formatTime: formatTime,
    isLampLit: isLampLit,
    buildBoard: buildBoard,
    fitBoard: fitBoard,
    ROW_COUNT: ROW_COUNT
  };
})(typeof window !== 'undefined' ? window : this);
