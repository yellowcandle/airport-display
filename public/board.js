/*
 * board.js — Kai Tak departure board rendering + layout.
 *
 * Task 3.x scope: build the 12-row grid, compose each row's flap cells with
 * flap.js, drive STATIC demo data, format times as `H.MM`, and scale the
 * whole board to fit the viewport.
 *
 * Reusable seam for task 4.x (live data): the data layer only needs to build a
 * display model per row and call `renderRow(rowEl, model)`. The time/lamp
 * helpers below are exported on `window.KaiTak` so the data layer can reuse them.
 * `renderRow` is idempotent per cell (flap.setValue no-ops on equal values), so
 * re-calling with changed fields flips only the cells that actually changed.
 */
(function (global) {
  'use strict';

  // ---- Layout constants -------------------------------------------------
  // Slot counts match the column widths in board.css (:root --col-*).
  var FLIGHT_SLOTS = 7;
  var DEST_EN_SLOTS = 12;
  var SCHED_SLOTS = 5;
  var GATE_SLOTS = 3;        // HKIA gate e.g. "216"
  var DEPARTURE_SLOTS = 5;   // revised/actual departure time, red drums
  var ROW_COUNT = 12;

  // Drum cell geometry (CELL.w must equal --cw in board.css).
  var CELL = { w: '20px', h: '28px', fs: '18px' };

  // Airline card colours — brand-ish backgrounds. Dark text where the
  // background is light enough to need it; off-white otherwise.
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

  // ---- Data-shaping helpers (reused by task 4's live data layer) --------

  // "09:10" -> "9.10"; drops the leading zero on the hour, dot separator.
  function formatTime(hhmm) {
    if (hhmm == null) return '';
    var m = String(hhmm).match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return '';
    return String(parseInt(m[1], 10)) + '.' + m[2];
  }

  // Lamp lit only on boarding / final call statuses.
  function isLampLit(status) {
    if (!status) return false;
    var s = String(status).toUpperCase();
    return s.indexOf('BOARDING') >= 0 || s.indexOf('FINAL CALL') >= 0;
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

  // Fan a string across row drum cells; missing positions flip to blank.
  function setGroup(arr, str) {
    str = str == null ? '' : String(str);
    for (var i = 0; i < arr.length; i++) {
      arr[i].setValue(str.charAt(i) || ' ');
    }
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
    var destENEl = child('destEN');
    var destZHEl = child('destzh');
    var schedEl = child('sched');
    var gateEl = child('gate');
    var statusEl = child('status');
    var departureEl = child('departure');
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
      destEN: makeDrumGroup(destENEl, DEST_EN_SLOTS),
      destZH: global.createFlapCell(destZHEl, {
        mode: 'card', width: '96px', height: '26px', fontSize: '17px', className: 'zh-card'
      }),
      sched: makeDrumGroup(schedEl, SCHED_SLOTS),
      gate: makeDrumGroup(gateEl, GATE_SLOTS),
      statusEn: statusEn,
      statusZh: statusZh,
      departure: makeDrumGroup(departureEl, DEPARTURE_SLOTS),
      lamp: lamp
    };
  }

  /*
   * renderRow(rowEl, model) — reusable seam for task 4.
   *
   * `model` is the display view-model (all fields already formatted):
   *   { airline:'CX', airlineName:'Cathay Pacific', flightNo:'CX 713',
   *     destEN:'BANGKOK', destZH:'曼谷', scheduled:'9.10', gate:'216',
   *     statusEN:'BOARDING', statusZH:'登機', departure:'', lamp:true }
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

    // Real carrier logo; the 2-letter code doubles as tooltip fallback text and
    // the chip shown when the logo can't load. Full name (from airlines.json)
    // is the hover tooltip.
    c.airline.setValue({ code: model.airline || '', name: model.airlineName || '' });
    setGroup(c.flight, model.flightNo);
    setGroup(c.destEN, model.destEN);
    c.destZH.setValue(model.destZH || '');
    setGroup(c.sched, model.scheduled);
    setGroup(c.gate, model.gate);
    // Status is plain backlit text, not flaps — set only when changed.
    var stEn = model.statusEN || '';
    var stZh = model.statusZH || '';
    if (c.statusEn.textContent !== stEn) c.statusEn.textContent = stEn;
    if (c.statusZh.textContent !== stZh) c.statusZh.textContent = stZh;
    setGroup(c.departure, model.departure);

    if (model.lamp) c.lamp.classList.add('lit');
    else c.lamp.classList.remove('lit');
  }

  // ---- STATIC DEMO DATA (replaced by live data in task 4.x) -------------
  // Raw form mirrors the worker's row shape closely enough for the demo
  // helpers: scheduled is "HH:MM"; statusEN/statusZH are a bilingual pair.
  var DEMO_ROWS = [
    { airline: 'CX', flightNo: 'CX 713', destEN: 'BANGKOK', destZH: '曼谷', scheduled: '09:10', gate: '23', statusEN: 'BOARDING', statusZH: '登機' },
    { airline: 'KA', flightNo: 'KA 041', destEN: 'TOKYO', destZH: '東京', scheduled: '09:15', gate: '25', statusEN: '', statusZH: '' },
    { airline: 'SQ', flightNo: 'SQ 865', destEN: 'SINGAPORE', destZH: '新加坡', scheduled: '09:20', gate: '30', statusEN: 'FINAL CALL', statusZH: '最後召集' },
    { airline: 'BR', flightNo: 'BR 856', destEN: 'TAIPEI', destZH: '台北', scheduled: '09:25', gate: '41', statusEN: '', statusZH: '' },
    { airline: 'NW', flightNo: 'NW 002', destEN: 'TOKYO', destZH: '東京', scheduled: '09:30', gate: '48', statusEN: 'GATE CLOSED', statusZH: '閘口關閉' },
    { airline: 'UA', flightNo: 'UA 862', destEN: 'SAN FRAN', destZH: '三藩市', scheduled: '09:40', gate: '60', statusEN: 'BOARDING', statusZH: '登機' },
    { airline: 'CX', flightNo: 'CX 250', destEN: 'LONDON', destZH: '倫敦', scheduled: '09:50', gate: '1', statusEN: '', statusZH: '' },
    { airline: 'JL', flightNo: 'JL 736', destEN: 'OSAKA', destZH: '大阪', scheduled: '10:00', gate: '15', statusEN: '', statusZH: '' },
    { airline: 'TG', flightNo: 'TG 601', destEN: 'BANGKOK', destZH: '曼谷', scheduled: '10:10', gate: '35', statusEN: 'DELAYED', statusZH: '延遲' },
    { airline: 'CZ', flightNo: 'CZ 302', destEN: 'GUANGZHOU', destZH: '廣州', scheduled: '10:20', gate: '210', statusEN: '', statusZH: '' },
    { airline: 'KA', flightNo: 'KA 862', destEN: 'SHANGHAI', destZH: '上海', scheduled: '10:30', gate: '216', statusEN: 'BOARDING', statusZH: '登機' },
    { airline: 'CX', flightNo: 'CX 907', destEN: 'MANILA', destZH: '馬尼拉', scheduled: '10:40', gate: '520', statusEN: '', statusZH: '' }
  ];

  // Raw demo row -> display view-model, exercising the shared helpers.
  function toDisplayModel(r) {
    return {
      airline: r.airline,
      flightNo: r.flightNo,
      destEN: r.destEN,
      destZH: r.destZH,
      scheduled: formatTime(r.scheduled),
      gate: r.gate,
      statusEN: r.statusEN,
      statusZH: r.statusZH,
      departure: '',
      lamp: isLampLit(r.statusEN)
    };
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
    // Start every row blank; the live data layer (data.js) populates them on
    // its first poll, giving the authentic "flap in from blank" look.
    // (DEMO_ROWS/toDisplayModel above remain available for standalone testing
    // of this file without data.js loaded.)
    for (var j = 0; j < ROW_COUNT; j++) {
      renderRow(rowEls[j], {});
    }
    return rowEls;
  }

  // Scale the whole frame uniformly so it fills the viewport without scrolling.
  // transform:scale doesn't change offsetWidth/Height, so the natural (scale-1)
  // size can always be read directly.
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

  // Exported for task 4's live data layer.
  global.KaiTak = {
    renderRow: renderRow,
    formatTime: formatTime,
    isLampLit: isLampLit,
    buildBoard: buildBoard,
    fitBoard: fitBoard,
    ROW_COUNT: ROW_COUNT
  };
})(typeof window !== 'undefined' ? window : this);
