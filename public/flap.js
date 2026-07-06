/*
 * flap.js — reusable split-flap ("Solari") cell engine for the Kai Tak board.
 * No dependencies, no build step. Attaches window.createFlapCell.
 *
 * API:
 *   const cell = createFlapCell(container, { mode: 'drum' | 'card', ... });
 *   cell.setValue(str);   // drum: single char, steps through the drum sequence;
 *                         // card: whole string, one flip. Same value = no-op.
 *   cell.destroy();       // clears any pending timer + removes the DOM node.
 *   cell.el              // the .flap-cell element (already appended to container).
 *
 * Options: mode ('drum'|'card'), width/height (CSS length -> --fw/--fh),
 *          fontSize (CSS length), className (extra class on the cell).
 */
(function (global) {
  'use strict';

  // Fixed drum sequence; leading space = blank face.
  var DRUM = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789./-';

  var STYLE_ID = 'flap-styles';
  var CSS =
    '.flap-cell{position:relative;display:inline-block;box-sizing:border-box;' +
    'width:var(--fw,1.1em);height:var(--fh,1.5em);perspective:220px;' +
    'background:#0a0a0a;color:#f4f4f4;text-align:center;vertical-align:top;overflow:hidden;' +
    'font-family:inherit;font-weight:600;border-radius:3px;}' +
    '.flap-face{position:absolute;left:0;width:100%;overflow:hidden;background:#161616;}' +
    '.flap-top{top:0;height:50%;border-bottom:1px solid rgba(0,0,0,.65);border-radius:3px 3px 0 0;}' +
    '.flap-bottom{bottom:0;height:50%;border-radius:0 0 3px 3px;}' +
    '.flap-ch{position:absolute;left:0;width:100%;height:var(--fh,1.5em);' +
    'line-height:var(--fh,1.5em);white-space:nowrap;}' +
    '.is-top .flap-ch{top:0;}' +
    '.is-bottom .flap-ch{top:-100%;}' +
    '.flap-leaf{position:absolute;left:0;top:0;width:100%;height:50%;z-index:3;' +
    'transform-origin:50% 100%;transform-style:preserve-3d;transform:rotateX(0deg);}' +
    '.flap-leaf .flap-face{height:100%;}' +
    '.flap-leaf-front{backface-visibility:hidden;border-radius:3px 3px 0 0;}' +
    '.flap-leaf-back{backface-visibility:hidden;transform:rotateX(180deg);border-radius:0 0 3px 3px;}';

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  // ---- Flap sound -------------------------------------------------------- *
  // A synthesized mechanical "clack" per flap (no audio file). Every flap
  // movement goes through flip(), so one tick there + many cells moving at
  // once naturally reads as the Solari clatter. Rate-limited so a full-board
  // flip-in is a dense rattle rather than hundreds of overlapping voices.
  // Browsers block audio until a user gesture, so the context is created/
  // resumed on the first pointerdown/keydown; the initial flip-in is silent.
  var SOUND = (function () {
    var ctx = null, noiseBuf = null, last = 0, muted = false;
    try { muted = localStorage.getItem('kaitak-mute') === '1'; } catch (e) {}

    function ensure() {
      if (ctx) return;
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      // 30ms of front-loaded, decaying white noise — reused for every tick.
      var n = Math.floor(ctx.sampleRate * 0.03);
      noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    }

    function unlock() {
      ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume();
    }

    function tick() {
      if (muted || !ctx || !noiseBuf) return;
      var now = ctx.currentTime;
      if (now - last < 0.012) return; // cap the clatter at ~80 ticks/sec
      last = now;
      var src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.playbackRate.value = 0.85 + Math.random() * 0.5; // slight per-tick variation
      var lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2600 + Math.random() * 1200;
      var g = ctx.createGain();
      g.gain.value = 0.05 + Math.random() * 0.03;
      src.connect(lp); lp.connect(g); g.connect(ctx.destination);
      src.start();
    }

    function setMuted(m) {
      muted = !!m;
      try { localStorage.setItem('kaitak-mute', muted ? '1' : '0'); } catch (e) {}
      if (!muted) unlock();
    }

    return {
      tick: tick, unlock: unlock, setMuted: setMuted,
      isMuted: function () { return muted; }
    };
  })();

  // Normalize an input into a single drum character (unknown -> blank space).
  function drumChar(str) {
    if (str == null || str === '') return ' ';
    var c = String(str).charAt(0).toUpperCase();
    return DRUM.indexOf(c) >= 0 ? c : ' ';
  }

  function setFace(ch, str) {
    ch.textContent = str; // '' or ' ' both render as a blank black face
  }

  // Perform exactly one top-to-bottom flap from `fromStr` to `toStr`.
  // Only ever holds a single pending timer (cleared first, defensively).
  function flip(cell, fromStr, toStr, duration, done) {
    clearTimeout(cell.timer);
    SOUND.tick(); // one mechanical clack per flap (rate-limited, gesture-gated)
    setFace(cell.frontCh, fromStr); // leaf front = old top half
    setFace(cell.backCh, toStr); // leaf back  = new bottom half
    setFace(cell.topCh, toStr); // reveal new top under the falling leaf
    // (static bottom keeps the old face until the flip lands)

    var leaf = cell.leaf;
    leaf.style.transition = 'none';
    leaf.style.transform = 'rotateX(0deg)';
    void leaf.offsetHeight; // force reflow so the reset isn't animated
    leaf.style.transition = 'transform ' + duration + 'ms ease-in';
    leaf.style.transform = 'rotateX(-180deg)';

    cell.timer = setTimeout(function () {
      if (cell.dead) return;
      setFace(cell.bottomCh, toStr); // new bottom now settled
      leaf.style.transition = 'none';
      leaf.style.transform = 'rotateX(0deg)';
      setFace(cell.frontCh, toStr); // rest state: front = new top
      done();
    }, duration);
  }

  function nextDrum(current) {
    var idx = DRUM.indexOf(current);
    if (idx < 0) idx = 0;
    return DRUM.charAt((idx + 1) % DRUM.length);
  }

  function stepDur(mode) {
    // Drum: ~70-110ms per character step (desyncs cells so rows ripple).
    // Card: a single, more deliberate ~170-250ms flip.
    return mode === 'card' ? 170 + Math.random() * 80 : 70 + Math.random() * 40;
  }

  function createFlapCell(container, opts) {
    opts = opts || {};
    ensureStyles();
    var mode = opts.mode === 'card' ? 'card' : 'drum';
    var blank = mode === 'card' ? '' : ' ';

    var el = document.createElement('div');
    el.className = 'flap-cell' + (opts.className ? ' ' + opts.className : '');
    if (opts.width) el.style.setProperty('--fw', opts.width);
    if (opts.height) el.style.setProperty('--fh', opts.height);
    if (opts.fontSize) el.style.fontSize = opts.fontSize;
    el.innerHTML =
      '<div class="flap-face flap-top is-top"><div class="flap-ch"></div></div>' +
      '<div class="flap-face flap-bottom is-bottom"><div class="flap-ch"></div></div>' +
      '<div class="flap-leaf">' +
      '<div class="flap-face flap-leaf-front is-top"><div class="flap-ch"></div></div>' +
      '<div class="flap-face flap-leaf-back is-bottom"><div class="flap-ch"></div></div>' +
      '</div>';
    container.appendChild(el);

    var cell = {
      mode: mode,
      el: el,
      leaf: el.querySelector('.flap-leaf'),
      topCh: el.querySelector('.flap-top .flap-ch'),
      bottomCh: el.querySelector('.flap-bottom .flap-ch'),
      frontCh: el.querySelector('.flap-leaf-front .flap-ch'),
      backCh: el.querySelector('.flap-leaf-back .flap-ch'),
      current: blank,
      target: blank,
      animating: false,
      dead: false,
      timer: null
    };
    // Paint the initial (blank) steady state.
    setFace(cell.topCh, blank);
    setFace(cell.bottomCh, blank);
    setFace(cell.frontCh, blank);
    setFace(cell.backCh, blank);

    function step() {
      if (cell.dead) return;
      if (cell.current === cell.target) {
        cell.animating = false; // loop finished; nothing pending
        return;
      }
      // Drum walks one character at a time; card jumps straight to target.
      var next = cell.mode === 'card' ? cell.target : nextDrum(cell.current);
      flip(cell, cell.current, next, stepDur(cell.mode), function () {
        cell.current = next;
        step(); // continues toward cell.target (which may have changed mid-flip)
      });
    }

    function setValue(str) {
      if (cell.dead) return;
      var target = cell.mode === 'drum' ? drumChar(str) : str == null ? '' : String(str);
      cell.target = target;
      if (cell.animating) return; // the single live loop will chase the new target
      if (cell.current === target) return; // idempotent: no flip
      cell.animating = true;
      step();
    }

    function destroy() {
      cell.dead = true;
      clearTimeout(cell.timer);
      if (el.parentNode) el.parentNode.removeChild(el);
    }

    return { setValue: setValue, destroy: destroy, el: el };
  }

  // A non-flap "logo card" for the airline column. Shows the carrier's real
  // logo (Aviasales logo CDN, keyed by IATA code; LOGO_OVERRIDES supplies
  // self-hosted art for carriers whose CDN logo is stale) on a light sticker,
  // and falls back to a brand-coloured 2-letter chip only when the logo
  // actually fails — unresolved carriers reach the CDN as their 3-letter ICAO
  // code, which 404s and triggers onerror -> chip. The <img> is shown by
  // default (no
  // lazy loading: a display:none lazy image never intersects the viewport, so
  // it would never load). Same container/return shape as createFlapCell.
  // Per-carrier logo overrides: self-hosted art for carriers whose CDN logo is
  // outdated or off-brand. Keyed by resolved IATA code; add entries as needed.
  var LOGO_OVERRIDES = {
    UO: 'logos/hkexpress.svg' // official current HK Express branding (colour variant)
  };

  function createLogoCell(container, opts) {
    opts = opts || {};
    var el = document.createElement('div');
    el.className = 'logo-card' + (opts.className ? ' ' + opts.className : '');
    if (opts.width) el.style.setProperty('--fw', opts.width);
    if (opts.height) el.style.setProperty('--fh', opts.height);

    var chip = document.createElement('span');
    chip.className = 'logo-code';
    var img = document.createElement('img');
    img.className = 'logo-img';
    img.alt = '';
    el.appendChild(chip);
    el.appendChild(img);
    container.appendChild(el);

    var currentCode = null;
    // Only errors flip to the chip; a successful (re)load clears any prior
    // error state. The image shows by default, so success needs no handler.
    img.addEventListener('error', function () { el.classList.add('no-logo'); });
    img.addEventListener('load', function () { el.classList.remove('no-logo'); });

    // setValue({ code, name }) — only swaps the image when the code actually
    // changes, so codeshare-rotation re-renders don't re-request the same logo.
    function setValue(v) {
      v = v || {};
      var code = v.code == null ? '' : String(v.code);
      if (code === currentCode) return;
      currentCode = code;
      chip.textContent = code;
      el.title = v.name || '';
      if (code) {
        el.classList.remove('no-logo'); // optimistically show the logo
        img.src = LOGO_OVERRIDES[code] ||
          'https://pics.avs.io/100/50/' + encodeURIComponent(code) + '.png';
      } else {
        el.classList.add('no-logo'); // blank row: no logo, empty chip
        img.removeAttribute('src');
      }
    }

    function destroy() {
      if (el.parentNode) el.parentNode.removeChild(el);
    }

    return { setValue: setValue, destroy: destroy, el: el };
  }

  createFlapCell.DRUM = DRUM;
  global.createFlapCell = createFlapCell;
  global.createLogoCell = createLogoCell;
  global.FlapSound = SOUND;

  // ---- Sound wiring (browser only) --------------------------------------- *
  // Unlock audio on the first user gesture (autoplay policy), and inject a
  // small mute toggle so the sound is always dismissable. Done here rather
  // than per-page so both boards (and flap-test) get it from one file.
  if (typeof document !== 'undefined' && global.addEventListener) {
    global.addEventListener('pointerdown', SOUND.unlock);
    global.addEventListener('keydown', SOUND.unlock);

    var injectMuteButton = function () {
      if (!document.body || document.getElementById('flap-mute')) return;
      var b = document.createElement('button');
      b.id = 'flap-mute';
      b.type = 'button';
      b.setAttribute('aria-label', 'Toggle flap sound');
      // Shares the .page-nav pill look (board.css); .mute puts it bottom-left.
      b.className = 'page-nav mute';
      var label = function () { b.textContent = SOUND.isMuted() ? '♪ sound off' : '♪ sound on'; };
      b.addEventListener('click', function () { SOUND.setMuted(!SOUND.isMuted()); label(); });
      label();
      document.body.appendChild(b);
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', injectMuteButton);
    } else {
      injectMuteButton();
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = createFlapCell;
})(typeof window !== 'undefined' ? window : this);
