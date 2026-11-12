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

  /** The site-wide Hypixel API key from /config.js (edit that file to change it). */
  const apiKey = () => (window.ACE_CONFIG && window.ACE_CONFIG.hypixelApiKey) || '';

  /** GET a Hypixel API path (e.g. '/v2/counts'), sending the saved key. Resolves to the JSON body. */
  async function hypixel(path, key = apiKey()) {
    const r = await fetch('https://api.hypixel.net' + path, { headers: key ? { 'API-Key': key } : {} });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.success === false) throw Object.assign(new Error(j.cause || 'HTTP ' + r.status), { status: r.status });
    return j;
  }

  /* ---------- login (Minecraft name + SkyBlock profile, saved in this browser) ---------- */
  const LOGIN = 'ace-hypixel.login.v1', SKIP = 'ace-hypixel.skiplogin';
  const login = () => readLS(LOGIN, null);
  function setLogin(v) {
    try { if (v) { localStorage.setItem(LOGIN, JSON.stringify(v)); localStorage.removeItem(SKIP); } else localStorage.removeItem(LOGIN); } catch { /* storage unavailable */ }
  }
  const skipped = () => { try { return !!localStorage.getItem(SKIP); } catch { return true; } };
  const skipLogin = () => { try { localStorage.setItem(SKIP, '1'); } catch { /* storage unavailable */ } };
  const avatar = (uuid, size = 32) => `https://crafthead.net/avatar/${encodeURIComponent(uuid)}/${size}`;
  const MODES = { ironman: '♲ Ironman', island: '☀ Stranded', bingo: 'Ⓑ Bingo' };

  /** Minecraft name -> { name, uuid } (uuid without dashes). Mojang's own API blocks browsers, so use mirrors. */
  async function lookupPlayer(name) {
    name = String(name).trim();
    if (!/^[A-Za-z0-9_]{1,16}$/.test(name)) throw new Error("That isn't a valid Minecraft name.");
    try {
      const j = await fetch('https://playerdb.co/api/player/minecraft/' + encodeURIComponent(name)).then(r => r.json());
      if (j.success && j.data && j.data.player) return { name: j.data.player.username, uuid: j.data.player.raw_id };
      if (j.code === 'minecraft.invalid_username') throw Object.assign(new Error('notfound'), { nf: true });
    } catch (e) { if (e.nf) throw new Error(`No Minecraft player is called "${name}".`); }
    const r = await fetch('https://api.ashcon.app/mojang/v2/user/' + encodeURIComponent(name));
    if (r.status === 404) throw new Error(`No Minecraft player is called "${name}".`);
    if (!r.ok) throw new Error('Could not look up that name right now. Try again in a moment.');
    const j = await r.json();
    return { name: j.username, uuid: j.uuid.replace(/-/g, '') };
  }
  /** SkyBlock profiles the player is still a member of. */
  async function skyblockProfiles(uuid) {
    const j = await hypixel('/v2/skyblock/profiles?uuid=' + encodeURIComponent(uuid));
    return (j.profiles || []).filter(p => {
      const m = p.members && p.members[uuid];
      return m && !(m.profile && m.profile.deletion_notice);
    });
  }

  /* ---------- the logged-in profile's data (cached for a few minutes per tab) ---------- */
  const CACHE_TTL = 5 * 60e3, memo = {};
  async function cachedApi(key, path, force) {
    if (!force) {
      if (memo[key] && Date.now() - memo[key].t < CACHE_TTL) return memo[key];
      try { const c = JSON.parse(sessionStorage.getItem(key)); if (c && Date.now() - c.t < CACHE_TTL) return (memo[key] = c); } catch { /* none */ }
    }
    const c = { t: Date.now(), j: await hypixel(path) };
    memo[key] = c;
    try { sessionStorage.setItem(key, JSON.stringify(c)); } catch { /* too big for sessionStorage: memory only */ }
    return c;
  }
  /** { at, profile, member, login } for the logged-in profile, or null when not logged in. */
  async function myProfile(force = false) {
    const l = login(); if (!l) return null;
    const c = await cachedApi('ace-hypixel.p.' + l.profileId, '/v2/skyblock/profile?profile=' + encodeURIComponent(l.profileId), force);
    const p = c.j.profile;
    if (!p || !p.members || !p.members[l.uuid]) throw new Error(`Couldn't find ${l.name} on the ${l.cuteName} profile any more. Log in again to pick a profile.`);
    return { at: c.t, profile: p, member: p.members[l.uuid], login: l };
  }
  /** Garden data for the logged-in profile ({} when they have no Garden). */
  async function myGarden(force = false) {
    const l = login(); if (!l) return null;
    try {
      const c = await cachedApi('ace-hypixel.g.' + l.profileId, '/v2/skyblock/garden?profile=' + encodeURIComponent(l.profileId), force);
      return { at: c.t, garden: c.j.garden || {}, login: l };
    } catch (e) { if (e.status === 404) return { at: Date.now(), garden: {}, login: l }; throw e; }
  }
  const apiError = e => e.status === 403 ? "The site's Hypixel API key has expired, so profile data can't load right now."
    : e.status === 429 ? 'Too many requests to Hypixel right now. Try Refresh in a minute.' : (e.message || 'Could not load profile data.');

  /**
   * Remembers a fingerprint of profile data per page so it's only applied again when it changes in game;
   * anything typed by hand stays until then. Returns true when `value` is new.
   */
  function changed(key, value) {
    const sig = JSON.stringify(value);
    const all = readLS('ace-hypixel.applied.v1', {});
    const k = (login() || {}).profileId + ':' + key;
    if (all[k] === sig) return false;
    all[k] = sig; writeLS('ace-hypixel.applied.v1', all);
    return true;
  }

  /**
   * A small "From your profile" bar. `apply(data, fresh)` uses the data and returns a short message;
   * `fresh` is true when the person pressed Refresh (apply everything again).
   */
  function profileBar(host, { what, load = myProfile, apply }) {
    if (!host) return;
    const l = login();
    const bar = document.createElement('div');
    bar.className = 'profile-bar';
    host.appendChild(bar);
    if (!l) {
      bar.innerHTML = `<span>Log in to fill in ${esc(what)} from your SkyBlock profile.</span> <a href="../?login">Log in</a>`;
      return;
    }
    bar.innerHTML = `<img src="${avatar(l.uuid, 24)}" alt="" width="20" height="20"><span class="pb-msg"></span><button type="button" class="btn ghost small">Refresh</button>`;
    const msg = bar.querySelector('.pb-msg'), btn = bar.querySelector('button');
    const run = async force => {
      btn.disabled = true; bar.classList.remove('bad');
      msg.textContent = `Loading ${what} from ${l.name} on ${l.cuteName}…`;
      try {
        const d = await load(force);
        const ago = Math.round((Date.now() - d.at) / 60000);
        msg.textContent = `${await apply(d, force)} · from ${l.name} on ${l.cuteName}, ${ago ? ago + 'm ago' : 'just now'}`;
      } catch (e) { bar.classList.add('bad'); msg.textContent = apiError(e); console.error(e); }
      btn.disabled = false;
    };
    btn.addEventListener('click', () => run(true));
    run(false);
  }

  /** Decode a gzip+base64 NBT inventory from the API into [{ id, count, name }]. */
  async function nbtItems(b64) {
    if (!b64 || typeof DecompressionStream === 'undefined') return [];
    const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const buf = new Uint8Array(await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
    const dv = new DataView(buf.buffer), td = new TextDecoder();
    let o = 0;
    const str = () => { const n = dv.getUint16(o); o += 2; const s = td.decode(buf.subarray(o, o + n)); o += n; return s; };
    function tag(t) {
      switch (t) {
        case 1: return dv.getInt8(o++);
        case 2: { const v = dv.getInt16(o); o += 2; return v; }
        case 3: { const v = dv.getInt32(o); o += 4; return v; }
        case 4: { o += 8; return 0; }
        case 5: { const v = dv.getFloat32(o); o += 4; return v; }
        case 6: { const v = dv.getFloat64(o); o += 8; return v; }
        case 7: { const n = dv.getInt32(o); o += 4 + n; return null; }
        case 8: return str();
        case 9: { const et = dv.getInt8(o++), n = dv.getInt32(o); o += 4; const a = []; for (let i = 0; i < n; i++) a.push(tag(et)); return a; }
        case 10: { const c = {}; for (;;) { const tt = dv.getInt8(o++); if (!tt) return c; const k = str(); c[k] = tag(tt); } }
        case 11: { const n = dv.getInt32(o); o += 4 + 4 * n; return null; }
        case 12: { const n = dv.getInt32(o); o += 4 + 8 * n; return null; }
      }
      throw new Error('Unreadable item data');
    }
    const rt = dv.getInt8(o++); str();
    const root = tag(rt);
    const out = [];
    for (const it of root.i || []) {
      const ea = it && it.tag && it.tag.ExtraAttributes;
      if (!ea || !ea.id) continue;
      let id = ea.id;
      // Enchanted books are stored per enchant in recipe data (e.g. SHARPNESS;5)
      if (id === 'ENCHANTED_BOOK' && ea.enchantments) {
        const e = Object.entries(ea.enchantments);
        if (e.length === 1) id = e[0][0].toUpperCase() + ';' + e[0][1];
      }
      out.push({ id, count: it.Count || 1, name: it.tag.display && it.tag.display.Name });
    }
    return out;
  }

  /** "Logged in as" chip in the top bar of every tool page. */
  function userChip() {
    const nav = document.querySelector('.sitebar nav, .nav nav');
    if (!nav || nav.querySelector('.user-chip')) return;
    const l = login();
    const home = document.documentElement.hasAttribute('data-hub') ? './' : '../';
    const a = document.createElement('a');
    a.className = 'user-chip';
    a.href = home + '?login';
    if (l) {
      a.title = 'Switch player or profile';
      a.innerHTML = `<img src="${avatar(l.uuid, 24)}" alt="" width="20" height="20"><span>${esc(l.name)}</span><small>${esc(l.cuteName)}${l.mode ? ' ' + esc((MODES[l.mode] || '').split(' ')[0]) : ''}</small>`;
    } else {
      a.textContent = 'Log in';
    }
    nav.prepend(a);
  }

  // First visit to a tool page: send people to the login page, then bring them back.
  if (!document.documentElement.hasAttribute('data-hub') && !login() && !skipped()) {
    location.replace('../?next=' + encodeURIComponent(location.pathname + location.search));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', userChip); else userChip();

  return { esc, num, MC, countdown, dur, when, named, mcText, plain, readLS, writeLS, pretty, roman, apiKey, hypixel,
    login, setLogin, skipped, skipLogin, avatar, MODES, lookupPlayer, skyblockProfiles, userChip,
    myProfile, myGarden, apiError, changed, profileBar, nbtItems };
})();
