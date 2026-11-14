// Live Clan Map: one full-screen map of every SkyBlock island (squaremap style, built on Leaflet).
// Polls Jerry for players who chose to share their location and glides their markers between updates.
(function () {
  'use strict';
  var JERRY = 'https://jerry.aceclan.lol';
  var POLL_MS = 2000;
  var STALE_S = 10;          // fade a marker that hasn't updated in this long
  var JUMP_BLOCKS = 80;      // further than this between updates = a teleport, so don't glide

  var islands = window.ISLANDS || [];
  var $ = function (id) { return document.getElementById(id); };
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function norm(s) { return String(s || '').toLowerCase().trim(); }

  // Real x/z on an island -> point on the shared map (north up)
  function toMap(isl, x, z) { return L.latLng(-(z + isl.dz), x + isl.dx); }
  function islandForArea(area) {
    var a = norm(area);
    for (var i = 0; i < islands.length; i++) if (islands[i].areas.some(function (n) { return norm(n) === a; })) return islands[i];
    return null;
  }
  // Underground layers (Glacite Tunnels) share their parent's spot; pick one by zone, or by being past the surface map
  var under = islands.filter(function (i) { return i.under; });
  function inTunnels(p) {
    return /glacite tunnels|glacite lake|fossil/i.test(p.zone || '') || (typeof p.z === 'number' && p.z > 313);
  }
  function islandFor(p) {
    var isl = islandForArea(p.area);
    if (!isl) return null;
    var sub = under.filter(function (u) { return u.under === isl.key; })[0];
    return sub && inTunnels(p) ? sub : isl;
  }
  function islandAt(latlng) {
    var order = islands.slice().sort(function (a, b) { return (b.under && showUnder ? 1 : 0) - (a.under && showUnder ? 1 : 0); });
    for (var i = 0; i < order.length; i++) {
      var s = order[i], x = latlng.lng - s.dx, z = -latlng.lat - s.dz;
      if (x >= s.x1 && x <= s.x2 && z >= s.z1 && z <= s.z2) return { isl: s, x: x, z: z };
    }
    return null;
  }
  function boundsOf(isl) { return L.latLngBounds(toMap(isl, isl.x1, isl.z1), toMap(isl, isl.x2, isl.z2)); }

  // ── the map ───────────────────────────────────────────────────────────
  var map = L.map('map', {
    crs: L.CRS.Simple, minZoom: -4, maxZoom: 4, zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 110,
    attributionControl: true, zoomControl: true, inertia: true, fadeAnimation: true, zoomAnimation: true
  });
  map.attributionControl.setPrefix(false);
  map.attributionControl.addAttribution('Island maps: <a href="https://github.com/dediamondpro/skyguide" target="_blank" rel="noopener">SkyGuide</a> (<a href="SKYGUIDE-LICENSE.txt">GPL-3.0</a>), Glacite Tunnels: <a href="https://hypixelskyblock.minecraft.wiki/" target="_blank" rel="noopener">Hypixel SkyBlock Wiki</a> · Not affiliated with Hypixel');

  var world = null;
  var overlays = {};
  var showUnder = false;
  islands.forEach(function (isl) {
    var b = boundsOf(isl);
    world = world ? world.extend(b) : L.latLngBounds(b.getSouthWest(), b.getNorthEast());
    overlays[isl.key] = L.imageOverlay(isl.img, b, { alt: 'Top-down map of ' + isl.name, zIndex: isl.under ? 1 : 2 }).addTo(map);
    // An underground layer's top edge is inside its parent island, so its name goes under it instead
    L.marker(L.latLng(isl.under ? b.getSouth() - 6 : b.getNorth() + 6, b.getCenter().lng), {
      interactive: false, keyboard: false,
      icon: L.divIcon({ className: '', html: '<div class="isl-label' + (isl.under ? ' below' : '') + '">' + esc(isl.name) + '</div>', iconSize: [0, 0] })
    }).addTo(map);
  });

  // Surface / Tunnels: which of the stacked Dwarven Mines layers is on top
  function setUnder(on) {
    showUnder = !!on;
    under.forEach(function (u) {
      overlays[u.key].setZIndex(showUnder ? 3 : 1);
      if (overlays[u.under]) overlays[u.under].setOpacity(showUnder ? 0.3 : 1);
    });
    var el = document.getElementById('layers');
    if (el) el.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String((b.dataset.under === '1') === showUnder)); });
  }
  if (under.length) {
    var Layers = L.Control.extend({
      onAdd: function () {
        var d = L.DomUtil.create('div', 'box layers');
        d.id = 'layers';
        d.innerHTML = '<span>Dwarven Mines</span><button type="button" data-under="0" aria-pressed="true">Surface</button>' +
          '<button type="button" data-under="1" aria-pressed="false">Glacite Tunnels</button>';
        L.DomEvent.disableClickPropagation(d);
        d.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) setUnder(b.dataset.under === '1'); });
        return d;
      }
    });
    var layersCtl = new Layers({ position: 'topleft' });
  }
  if (world) {
    map.setMaxBounds(world.pad(0.35));
    map.fitBounds(world, { padding: [20, 20], animate: false });
  } else {
    map.setView([0, 0], 0);
  }

  // Brand (top left, under zoom) and coordinates (bottom left), like squaremap's controls
  var Brand = L.Control.extend({
    onAdd: function () {
      var d = L.DomUtil.create('div', 'box');
      d.innerHTML = '<a class="brand" href="../">ACE<span>.</span><small>Hypixel</small></a>';
      return d;
    }
  });
  new Brand({ position: 'topleft' }).addTo(map);
  if (typeof layersCtl !== 'undefined') layersCtl.addTo(map);
  var Coords = L.Control.extend({
    onAdd: function () {
      var d = L.DomUtil.create('div', 'box coords');
      d.id = 'coords';
      d.innerHTML = 'Move over the map<small>for coordinates</small>';
      return d;
    }
  });
  new Coords({ position: 'bottomleft' }).addTo(map);
  map.on('mousemove', function (e) {
    var hit = islandAt(e.latlng);
    $('coords').innerHTML = hit
      ? 'x ' + Math.round(hit.x) + ' · z ' + Math.round(hit.z) + '<small>' + esc(hit.isl.name) + '</small>'
      : '—<small>Not on an island</small>';
  });

  // ── players ───────────────────────────────────────────────────────────
  var players = [];
  var online = null;          // null until the first answer
  var marks = {};             // name -> { m, from, to, t0, dur, isl }
  var following = null;
  var flying = false;
  var animating = false;

  function hasPos(p) { return typeof p.x === 'number' && typeof p.z === 'number'; }
  function isHome(p) { return norm(p.area) === 'private island'; }
  function faceHtml(name) {
    return '<span class="face"><img src="https://mc-heads.net/avatar/' + encodeURIComponent(name) + '/32" alt="" loading="lazy" ' +
      'onerror="this.replaceWith(document.createTextNode(\'' + esc(name.charAt(0).toUpperCase()) + '\'))"></span>';
  }

  function step(now) {
    var moving = false;
    Object.keys(marks).forEach(function (name) {
      var k = marks[name];
      var t = Math.min(1, (now - k.t0) / k.dur);
      var lat = k.from.lat + (k.to.lat - k.from.lat) * t, lng = k.from.lng + (k.to.lng - k.from.lng) * t;
      k.m.setLatLng([lat, lng]);
      if (t < 1) moving = true;
      if (following === name && !flying) map.panTo([lat, lng], { animate: false });
    });
    animating = moving;
    if (moving) requestAnimationFrame(step);
  }
  function kick() { if (!animating) { animating = true; requestAnimationFrame(step); } }

  function placeMarkers() {
    var seen = {};
    players.forEach(function (p) {
      var isl = islandFor(p);
      if (!isl || !hasPos(p) || isHome(p)) return;
      seen[p.name] = true;
      var to = toMap(isl, p.x, p.z);
      var k = marks[p.name];
      if (!k) {
        var m = L.marker(to, {
          keyboard: false, riseOnHover: true,
          icon: L.divIcon({ className: '', iconSize: [0, 0], html: '<div class="pl">' + faceHtml(p.name) + '<span class="name">' + esc(p.name) + '</span></div>' })
        }).addTo(map);
        m.on('click', function () { focusPlayer(p.name); });
        k = marks[p.name] = { m: m, from: to, to: to, t0: performance.now(), dur: 1, isl: isl.key, spot: isl.under || isl.key };
      } else {
        var cur = k.m.getLatLng();
        var far = Math.hypot(cur.lat - to.lat, cur.lng - to.lng) > JUMP_BLOCKS;   // map units are blocks
        k.from = (k.spot !== (isl.under || isl.key) || far) ? to : cur;    // teleports jump; walking (even down into the tunnels) glides
        k.to = to;
        k.t0 = performance.now();
        k.dur = POLL_MS;
        k.isl = isl.key;
        k.spot = isl.under || isl.key;
      }
      var el = k.m.getElement() && k.m.getElement().querySelector('.pl');
      if (el) el.classList.toggle('stale', p.age > STALE_S);
    });
    Object.keys(marks).forEach(function (name) {
      if (!seen[name]) { map.removeLayer(marks[name].m); delete marks[name]; if (following === name) following = null; }
    });
    kick();
  }

  function focusPlayer(name) {
    var p = players.filter(function (q) { return q.name === name; })[0];
    var k = marks[name];
    if (!p || !k) return;
    var isl = islandFor(p);
    if (isl && under.length) setUnder(!!isl.under);
    following = name;
    flying = true;   // let the fly-in finish before following takes over
    map.once('moveend', function () { flying = false; });
    map.flyTo(k.m.getLatLng(), Math.max(map.getZoom(), 1.5), { duration: 0.9 });
    var el = k.m.getElement() && k.m.getElement().querySelector('.pl');
    if (el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
    if (window.innerWidth <= 640) setSide(false);
  }
  // Dragging the map stops following
  map.on('dragstart', function () { following = null; });

  // ── sidebar ───────────────────────────────────────────────────────────
  function ago(s) { return s < 3 ? 'now' : Math.round(s) + 's ago'; }

  function renderSide() {
    var st = $('status');
    st.className = 'status' + (online === true ? ' live' : online === false ? ' off' : '');
    st.querySelector('span').textContent = online === null ? 'Connecting to Jerry…' : online === false ? 'Jerry is offline'
      : players.length + (players.length === 1 ? ' player' : ' players') + ' sharing';
    $('openCount').textContent = online ? players.length + ' online' : 'Players';

    var el = $('players');
    if (online === false) el.innerHTML = '<div class="empty">Can\'t reach Jerry right now. Players appear again once Jerry is back.</div>';
    else if (online === null) el.innerHTML = '<div class="empty">Connecting…</div>';
    else if (!players.length) el.innerHTML = '<div class="empty">Nobody is sharing their location right now.</div>';
    else el.innerHTML = players.map(function (p) {
      var onMap = !!marks[p.name];
      var where = isHome(p) ? 'Home on their private island'
        : esc(p.area) + (p.zone && norm(p.zone) !== norm(p.area) ? ' · ' + esc(p.zone) : '');
      var extra = !isHome(p) && !islandForArea(p.area) ? 'No map for this area yet · ' : '';
      var pos = onMap ? Math.round(p.x) + ', ' + Math.round(p.y) + ', ' + Math.round(p.z) + ' · ' : '';
      return '<button type="button" class="row" data-name="' + esc(p.name) + '"' + (onMap ? '' : ' disabled') + '>' + faceHtml(p.name) +
        '<span class="txt"><b>' + esc(p.name) + '</b><small>' + where + '</small><small>' + extra + pos + ago(p.age) + '</small></span></button>';
    }).join('');

    $('islands').innerHTML = islands.map(function (isl) {
      var n = players.filter(function (p) { return hasPos(p) && !isHome(p) && islandFor(p) === isl; }).length;
      return '<button type="button" class="row" data-island="' + esc(isl.key) + '"><span class="txt"><b>' + esc(isl.name) + '</b></span>' +
        (n ? '<span class="n">' + n + '</span>' : '') + '</button>';
    }).join('');
  }

  $('players').addEventListener('click', function (e) {
    var b = e.target.closest('.row');
    if (b && !b.disabled) focusPlayer(b.dataset.name);
  });
  $('islands').addEventListener('click', function (e) {
    var b = e.target.closest('.row');
    if (!b) return;
    var isl = islands.filter(function (i) { return i.key === b.dataset.island; })[0];
    if (!isl) return;
    following = null;
    if (isl.under) setUnder(true);
    else if (under.some(function (u) { return u.under === isl.key; })) setUnder(false);
    map.flyToBounds(boundsOf(isl), { padding: [30, 30], duration: 0.9 });
    if (window.innerWidth <= 640) setSide(false);
  });

  function setSide(open, remember) {
    $('side').classList.toggle('closed', !open);
    $('open').hidden = open;
    if (remember) store('aceMapSide', open ? '1' : '0');
  }
  $('close').addEventListener('click', function () { setSide(false, true); });
  $('open').addEventListener('click', function () { setSide(true, true); });
  var sidePref = store('aceMapSide');
  setSide(sidePref === null ? window.innerWidth > 640 : sidePref === '1');

  // ── data ──────────────────────────────────────────────────────────────
  var busy = false;
  function poll() {
    if (busy || document.hidden) return;
    busy = true;
    fetch(JERRY + '/mc/map', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) { players = (d.players || []).slice().sort(function (a, b) { return a.name.localeCompare(b.name); }); online = true; })
      .catch(function () { online = false; players = []; })
      .then(function () { busy = false; placeMarkers(); renderSide(); });
  }
  renderSide();
  poll();
  setInterval(poll, POLL_MS);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) poll(); });
})();
