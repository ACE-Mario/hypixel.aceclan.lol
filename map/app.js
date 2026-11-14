// Live Clan Map: polls Jerry for the players who chose to share their location and
// draws them on top-down island renders (see islands.js for the images and their world corners).
(function () {
  'use strict';
  var JERRY = 'https://jerry.aceclan.lol';
  var POLL_MS = 2000;
  var PX = 2;                       // stage pixels per block (the renders are 2 px per block)
  var STALE_S = 10;                 // fade a dot that hasn't moved in this long

  var $ = function (id) { return document.getElementById(id); };
  var islands = (window.ISLANDS || []).slice();
  var players = [];
  var online = null;                // null = not heard yet, true/false after
  var current = null;               // island object on screen
  var chosenByUser = false;
  var view = { z: 1, tx: 0, ty: 0 };
  var fitted = null;                // island key the view was last fitted to
  var busy = false;

  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function norm(s) { return String(s || '').toLowerCase().trim(); }
  function isHome(p) { return norm(p.area) === 'private island'; }
  function hasPos(p) { return typeof p.x === 'number' && typeof p.z === 'number'; }

  function islandForArea(area) {
    var a = norm(area);
    for (var i = 0; i < islands.length; i++) {
      if (islands[i].areas.some(function (n) { return norm(n) === a; })) return islands[i];
    }
    return null;
  }

  // Areas without a render get a plain grid sized around whoever is there
  function gridIsland(area) {
    var here = players.filter(function (p) { return norm(p.area) === norm(area) && hasPos(p); });
    var x1 = -100, x2 = 100, z1 = -100, z2 = 100;
    if (here.length) {
      x1 = Math.min.apply(null, here.map(function (p) { return p.x; })) - 80;
      x2 = Math.max.apply(null, here.map(function (p) { return p.x; })) + 80;
      z1 = Math.min.apply(null, here.map(function (p) { return p.z; })) - 80;
      z2 = Math.max.apply(null, here.map(function (p) { return p.z; })) + 80;
      var size = Math.max(x2 - x1, z2 - z1), cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
      x1 = Math.floor(cx - size / 2); x2 = Math.ceil(cx + size / 2);
      z1 = Math.floor(cz - size / 2); z2 = Math.ceil(cz + size / 2);
    }
    return { key: 'area:' + norm(area), name: area, areas: [area], nomap: true, x1: x1, z1: z1, x2: x2, z2: z2 };
  }

  function islandFor(p) { return islandForArea(p.area) || gridIsland(p.area); }

  function playersOn(isl) {
    return players.filter(function (p) {
      return !isHome(p) && isl.areas.some(function (n) { return norm(n) === norm(p.area); });
    });
  }

  // ── tabs ──────────────────────────────────────────────────────────────
  function tabList() {
    var list = islands.slice();
    players.forEach(function (p) {
      if (isHome(p) || islandForArea(p.area)) return;
      if (!list.some(function (i) { return i.key === 'area:' + norm(p.area); })) list.push(gridIsland(p.area));
    });
    return list;
  }

  function renderTabs() {
    $('tabs').innerHTML = tabList().map(function (isl) {
      var n = playersOn(isl).length;
      return '<button type="button" class="tab' + (isl.nomap ? ' nomap' : '') + '" data-key="' + esc(isl.key) + '" aria-pressed="' +
        (current && current.key === isl.key) + '"' + (isl.nomap ? ' title="No map image for this area yet"' : '') + '>' +
        esc(isl.name) + (n ? ' <b>' + n + '</b>' : '') + '</button>';
    }).join('');
  }

  $('tabs').addEventListener('click', function (e) {
    var b = e.target.closest('.tab');
    if (!b) return;
    var isl = tabList().filter(function (i) { return i.key === b.dataset.key; })[0];
    if (!isl) return;
    chosenByUser = true;
    store('aceMapIsland', isl.key);
    show(isl);
  });

  // ── map stage ─────────────────────────────────────────────────────────
  function stageSize(isl) { return { w: (isl.x2 - isl.x1) * PX, h: (isl.z2 - isl.z1) * PX }; }

  function sizeBox() {
    var box = $('mapbox');
    var w = box.clientWidth;
    box.style.height = Math.round(Math.max(320, Math.min(w, window.innerHeight * 0.74))) + 'px';
  }

  function applyView() {
    $('stage').style.transform = 'translate(' + view.tx + 'px,' + view.ty + 'px) scale(' + view.z + ')';
    $('stage').style.setProperty('--inv', String(1 / view.z));
  }

  function fit() {
    if (!current) return;
    var box = $('mapbox'), s = stageSize(current);
    view.z = Math.min(box.clientWidth / s.w, box.clientHeight / s.h);
    view.tx = (box.clientWidth - s.w * view.z) / 2;
    view.ty = (box.clientHeight - s.h * view.z) / 2;
    applyView();
  }

  function zoomAt(factor, cx, cy) {
    var z = Math.max(0.15, Math.min(12, view.z * factor));
    factor = z / view.z;
    view.tx = cx - (cx - view.tx) * factor;
    view.ty = cy - (cy - view.ty) * factor;
    view.z = z;
    applyView();
  }

  function show(isl) {
    var changed = !current || current.key !== isl.key;
    current = isl;
    var s = stageSize(isl), stage = $('stage');
    stage.style.width = s.w + 'px';
    stage.style.height = s.h + 'px';
    stage.className = 'stage' + (isl.nomap ? ' grid' : '');
    stage.style.backgroundSize = isl.nomap ? (16 * PX) + 'px ' + (16 * PX) + 'px' : '';
    var img = isl.nomap ? '' : '<img src="' + esc(isl.img) + '" alt="Top-down map of ' + esc(isl.name) + '">';
    stage.innerHTML = img + '<div id="pins"></div>';
    $('note').hidden = !isl.nomap;
    if (isl.nomap) $('note').textContent = 'No map image for ' + isl.name + ' yet, so this is a plain grid (one square = 16 blocks).';
    if (changed || fitted !== isl.key) { fit(); fitted = isl.key; }
    renderTabs();
    renderPins();
  }

  function face(name, cls) {
    return '<span class="face ' + (cls || '') + '"><img src="https://mc-heads.net/avatar/' + encodeURIComponent(name) +
      '/32" alt="" loading="lazy" onerror="this.replaceWith(document.createTextNode(\'' + esc(name.charAt(0).toUpperCase()) + '\'))"></span>';
  }

  function renderPins() {
    var pins = $('pins');
    if (!pins || !current) return;
    pins.innerHTML = playersOn(current).filter(hasPos).map(function (p) {
      var left = (p.x - current.x1) * PX, top = (p.z - current.z1) * PX;
      return '<div class="pin' + (p.age > STALE_S ? ' stale' : '') + '" data-name="' + esc(p.name) + '" style="left:' + left +
        'px;top:' + top + 'px" title="' + esc(p.name + ' · ' + (p.zone || p.area) + ' · ' + Math.round(p.x) + ', ' + Math.round(p.y) + ', ' + Math.round(p.z)) + '">' +
        face(p.name) + '<span class="tag">' + esc(p.name) + '</span></div>';
    }).join('');
  }

  // ── player list ───────────────────────────────────────────────────────
  function ago(s) { return s < 3 ? 'now' : Math.round(s) + 's ago'; }

  function renderList() {
    var el = $('plist');
    if (online === false) { el.innerHTML = '<div class="empty">Can\'t reach Jerry right now. The map fills in again once Jerry is back online.</div>'; return; }
    if (online === null) { el.innerHTML = '<div class="empty">Connecting…</div>'; return; }
    if (!players.length) { el.innerHTML = '<div class="empty">Nobody is sharing their location right now.</div>'; return; }
    el.innerHTML = players.map(function (p) {
      var where = isHome(p) ? 'Home on their private island'
        : esc(p.area) + (p.zone && norm(p.zone) !== norm(p.area) ? ' · ' + esc(p.zone) : '');
      var pos = hasPos(p) && !isHome(p) ? Math.round(p.x) + ', ' + Math.round(p.y) + ', ' + Math.round(p.z) + ' · ' : '';
      return '<button type="button" class="prow" data-name="' + esc(p.name) + '"' + (isHome(p) ? ' disabled' : '') + '>' +
        face(p.name) + '<span><b>' + esc(p.name) + '</b><small>' + where + '</small><small>' + pos + ago(p.age) + '</small></span></button>';
    }).join('');
  }

  $('plist').addEventListener('click', function (e) {
    var row = e.target.closest('.prow');
    if (!row) return;
    var p = players.filter(function (q) { return q.name === row.dataset.name; })[0];
    if (!p || isHome(p)) return;
    chosenByUser = true;
    var isl = islandFor(p);
    store('aceMapIsland', isl.key);
    show(isl);
    if (hasPos(p)) {
      var box = $('mapbox');
      if (view.z < 1.2) view.z = 1.6;
      view.tx = box.clientWidth / 2 - (p.x - isl.x1) * PX * view.z;
      view.ty = box.clientHeight / 2 - (p.z - isl.z1) * PX * view.z;
      applyView();
      var pin = document.querySelector('.pin[data-name="' + CSS.escape(p.name) + '"]');
      if (pin) { pin.classList.remove('flash'); void pin.offsetWidth; pin.classList.add('flash'); }
    }
  });

  // ── pan and zoom ──────────────────────────────────────────────────────
  var box = $('mapbox'), pointers = {}, last = null, pinch = null;
  box.addEventListener('wheel', function (e) {
    e.preventDefault();
    var r = box.getBoundingClientRect();
    zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  box.addEventListener('pointerdown', function (e) {
    if (e.target.closest('.ctrls')) return;
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    box.setPointerCapture(e.pointerId);
    box.classList.add('drag');
    last = { x: e.clientX, y: e.clientY };
  });
  box.addEventListener('pointermove', function (e) {
    var r = box.getBoundingClientRect();
    if (current) {
      var wx = (e.clientX - r.left - view.tx) / view.z / PX + current.x1;
      var wz = (e.clientY - r.top - view.ty) / view.z / PX + current.z1;
      $('coords').textContent = 'x ' + Math.round(wx) + ' · z ' + Math.round(wz);
    }
    if (!pointers[e.pointerId]) return;
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(pointers);
    if (ids.length === 2) {
      var a = pointers[ids[0]], b = pointers[ids[1]];
      var d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) zoomAt(d / pinch, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      pinch = d;
      return;
    }
    if (last) {
      view.tx += e.clientX - last.x;
      view.ty += e.clientY - last.y;
      applyView();
    }
    last = { x: e.clientX, y: e.clientY };
  });
  function release(e) {
    delete pointers[e.pointerId];
    pinch = null;
    var ids = Object.keys(pointers);
    last = ids.length ? pointers[ids[0]] : null;
    if (!ids.length) box.classList.remove('drag');
  }
  box.addEventListener('pointerup', release);
  box.addEventListener('pointercancel', release);
  $('zin').addEventListener('click', function () { zoomAt(1.4, box.clientWidth / 2, box.clientHeight / 2); });
  $('zout').addEventListener('click', function () { zoomAt(1 / 1.4, box.clientWidth / 2, box.clientHeight / 2); });
  $('zfit').addEventListener('click', fit);
  window.addEventListener('resize', function () { sizeBox(); fit(); });

  // ── data ──────────────────────────────────────────────────────────────
  function setStatus() {
    var el = $('status');
    el.className = 'status' + (online === true ? ' live' : online === false ? ' off' : '');
    var shown = players.length;
    el.querySelector('span').textContent = online === null ? 'Connecting to Jerry…'
      : online === false ? 'Jerry is offline'
      : shown + (shown === 1 ? ' player' : ' players') + ' sharing';
  }

  function update() {
    // Pick an island to start on: the one you chose before, else wherever most people are
    if (!chosenByUser) {
      var saved = store('aceMapIsland');
      var best = null, bestN = 0;
      tabList().forEach(function (isl) {
        var n = playersOn(isl).length;
        if (n > bestN) { best = isl; bestN = n; }
      });
      var savedIsl = tabList().filter(function (i) { return i.key === saved; })[0];
      var pick = best || savedIsl || islands[0];
      if (pick && (!current || current.key !== pick.key)) show(pick);
    }
    if (current && current.nomap) {
      var fresh = gridIsland(current.name);
      if (fresh.x1 !== current.x1 || fresh.x2 !== current.x2 || fresh.z1 !== current.z1 || fresh.z2 !== current.z2) { fitted = null; show(fresh); }
    }
    renderTabs();
    renderPins();
    renderList();
    setStatus();
  }

  function poll() {
    if (busy || document.hidden) return;
    busy = true;
    fetch(JERRY + '/mc/map', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) { players = (d.players || []).slice().sort(function (a, b) { return a.name.localeCompare(b.name); }); online = true; })
      .catch(function () { online = false; players = []; })
      .then(function () { busy = false; update(); });
  }

  var saved = store('aceMapIsland');
  if (saved) chosenByUser = islands.some(function (i) { return i.key === saved; });
  sizeBox();
  show(islands.filter(function (i) { return i.key === saved; })[0] || islands[0]);
  renderList();
  poll();
  setInterval(poll, POLL_MS);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) poll(); });
})();
