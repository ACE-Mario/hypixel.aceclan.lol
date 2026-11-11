'use strict';
/* Shared helpers for the ACE Hypixel tools. */

const SB = (() => {
  // SkyBlock calendar: Year 1, Early Spring 1st began at this unix time.
  const EPOCH = 1560275700;
  const DAY = 1200;            // 20 real minutes
  const MONTH = DAY * 31;      // 10h 20m
  const YEAR = MONTH * 12;     // 124h
  const MONTHS = ['Early Spring', 'Spring', 'Late Spring', 'Early Summer', 'Summer', 'Late Summer',
    'Early Autumn', 'Autumn', 'Late Autumn', 'Early Winter', 'Winter', 'Late Winter'];

  const now = () => Date.now() / 1000;

  /** SkyBlock date for a unix time (seconds). month is 0-based, day 1-based. */
  function date(t = now()) {
    const e = t - EPOCH;
    const yi = Math.floor(e / YEAR);
    let r = e - yi * YEAR;
    const month = Math.floor(r / MONTH); r -= month * MONTH;
    const di = Math.floor(r / DAY); r -= di * DAY;
    const mins = Math.floor(r / DAY * 1440);
    return { year: yi + 1, month, day: di + 1, hour: Math.floor(mins / 60), minute: mins % 60, monthName: MONTHS[month] };
  }

  /** Unix time (seconds) of a SkyBlock moment. year 1-based, month 0-based, day 1-based, hour 0-24. */
  function at(year, month, day, hour = 0) {
    return EPOCH + (year - 1) * YEAR + month * MONTH + (day - 1) * DAY + hour / 24 * DAY;
  }

  const ordinal = n => n + ([, 'st', 'nd', 'rd'][(n % 100 >> 3 ^ 1) && n % 10] || 'th');
  const fmtDate = d => `${d.monthName} ${ordinal(d.day)}`;
  function fmtClock(d) {
    const h = d.hour % 12 || 12;
    return `${h}:${String(d.minute - d.minute % 10).padStart(2, '0')}${d.hour < 12 ? 'am' : 'pm'}`;
  }

  return { EPOCH, DAY, MONTH, YEAR, MONTHS, now, date, at, ordinal, fmtDate, fmtClock };
})();

const U = (() => {
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = n => (+n).toLocaleString(undefined, { maximumFractionDigits: 1 });
  const MC = { 0: '#8a8a8a', 1: '#6b6bff', 2: '#3cc13c', 3: '#3cc1c1', 4: '#d94040', 5: '#c04ad0', 6: '#ffaa00', 7: '#aaaaaa',
    8: '#8a8a8a', 9: '#6f6fff', a: '#55ff55', b: '#55ffff', c: '#ff5555', d: '#ff55ff', e: '#ffff55', f: '#ffffff' };

  /** Countdown text: "2d 4h", "3h 12m", "4m 09s". */
  function countdown(sec) {
    sec = Math.max(0, Math.floor(sec));
    const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    if (d) return `${d}d ${h}h`;
    if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
    return `${m}m ${String(s).padStart(2, '0')}s`;
  }
  /** Duration text: "1d 6h", "8h", "45m", "30s". */
  function dur(sec) {
    sec = Math.round(sec);
    if (sec < 60) return sec + 's';
    const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.round(sec % 3600 / 60);
    return [d && d + 'd', h && h + 'h', m && m + 'm'].filter(Boolean).join(' ');
  }
  /** Local date/time for a unix time in seconds. */
  function when(t) {
    const d = new Date(t * 1000);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    const tomorrow = new Date(today.getTime() + 864e5).toDateString() === d.toDateString();
    const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (sameDay) return 'today ' + time;
    if (tomorrow) return 'tomorrow ' + time;
    return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }) + ' ' + time;
  }

  /** Render a name in its colour: (colourCode, text) */
  const named = (c, text) => `<span class="mc" style="color:${MC[c] || MC.f}">${esc(text)}</span>`;

  /** Render a Minecraft §-formatted string as coloured HTML. */
  function mcText(s) {
    let color = MC[7], bold = false, out = '';
    const parts = String(s || '').replace(/Â/g, '').split(/§([0-9a-fk-or])/i);
    for (let i = 0; i < parts.length; i++) {
      if (i % 2) {
        const c = parts[i].toLowerCase();
        if (MC[c]) { color = MC[c]; bold = false; } else if (c === 'l') bold = true; else if (c === 'r') { color = MC[7]; bold = false; }
      } else if (parts[i]) {
        out += `<span style="color:${color}${bold ? ';font-weight:700' : ''}">${esc(parts[i])}</span>`;
      }
    }
    return out;
  }
  const plain = s => String(s || '').replace(/Â/g, '').replace(/§./g, '');

  function readLS(key, fb) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fb; } catch { return fb; } }
  function writeLS(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ } }

  const pretty = id => id.split(/[_;]/).map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
  const roman = n => ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV'][n] || String(n);

  return { esc, num, MC, countdown, dur, when, named, mcText, plain, readLS, writeLS, pretty, roman };
})();
