'use strict';

/*
 * Event kinds:
 *  hourly:  starts every real hour at `minute`, lasts `len` seconds.
 *  monthly: every SkyBlock month on `days`, from hour `h0` to `h1` (SkyBlock hours).
 *  yearly:  each SkyBlock year from `from` [month, day] to `to` [month, day] (inclusive).
 *           `points` instead of a range means a one-off moment on those [month, day]s.
 */
const EVENTS = [
  { name: 'Dark Auction', icon: '🕴', where: 'Wilderness, Hub', kind: 'hourly', minute: 55, len: 0,
    note: 'Starts every hour at :55.' },
  { name: "Jacob's Farming Contest", icon: '🌾', where: 'Farming Islands / Garden', kind: 'hourly', minute: 15, len: 1200,
    note: 'Runs for 20 minutes.' },
  { name: 'Cult of the Fallen Star', icon: '⭐', where: 'Dwarven Mines', kind: 'monthly', days: [7, 14, 21, 28], h0: 0, h1: 6,
    note: '12am–6am SkyBlock time on the 7th, 14th, 21st and 28th of every month.' },
  { name: 'Bank Interest', icon: '🏦', where: 'Bank', kind: 'yearly', points: [[0, 1], [3, 1], [6, 1], [9, 1]],
    note: 'Paid at the start of each season.' },
  { name: 'Traveling Zoo', icon: '🦒', where: 'Hub', kind: 'yearly', ranges: [[[3, 1], [3, 3]], [[9, 1], [9, 3]]],
    note: 'Early Summer 1st–3rd and Early Winter 1st–3rd.' },
  { name: "Hoppity's Hunt", icon: '🐰', where: 'Everywhere', kind: 'yearly', ranges: [[[0, 1], [2, 31]]],
    note: 'All of Spring.' },
  { name: 'New Mayor Elected', icon: '🗳', where: 'Hub', kind: 'yearly', points: [[2, 27]],
    note: 'Election closes Late Spring 27th.' },
  { name: 'Election Booth Opens', icon: '📮', where: 'Hub', kind: 'yearly', points: [[5, 27]],
    note: 'Voting opens Late Summer 27th.' },
  { name: 'Harvest Feast', icon: '🦃', where: 'Everywhere', kind: 'yearly', ranges: [[[6, 1], [8, 31]]],
    note: 'All of Autumn.' },
  { name: 'Spooky Festival', icon: '🎃', where: 'Everywhere', kind: 'yearly', ranges: [[[7, 29], [7, 31]]],
    note: 'Autumn 29th–31st. Fear Mongerer arrives in the Hub an hour before.' },
  { name: 'Season of Jerry', icon: '🎁', where: "Jerry's Workshop", kind: 'yearly', ranges: [[[11, 24], [11, 26]]],
    note: 'Late Winter 24th–26th.' },
  { name: 'New Year Celebration', icon: '🎆', where: 'Hub', kind: 'yearly', ranges: [[[11, 29], [11, 31]]],
    note: 'Late Winter 29th–31st. Grab your free cake!' },
];

/** Next (or current) occurrence of an event: { start, end } in unix seconds. */
function nextOccurrence(ev, now) {
  if (ev.kind === 'hourly') {
    const hour = Math.floor(now / 3600) * 3600;
    let start = hour + ev.minute * 60;
    if (start + ev.len <= now) start += 3600;
    if (start + ev.len <= now) start += 3600;
    return { start, end: start + ev.len };
  }
  const cur = SB.date(now);
  const occ = [];
  for (let y = cur.year - 1; y <= cur.year + 1; y++) {
    if (ev.kind === 'monthly') {
      for (let m = 0; m < 12; m++) for (const d of ev.days) occ.push({ start: SB.at(y, m, d, ev.h0), end: SB.at(y, m, d, ev.h1) });
    } else if (ev.points) {
      for (const [m, d] of ev.points) { const t = SB.at(y, m, d); occ.push({ start: t, end: t }); }
    } else {
      for (const [[m0, d0], [m1, d1]] of ev.ranges) occ.push({ start: SB.at(y, m0, d0), end: SB.at(y, m1, d1 + 1) });
    }
  }
  return occ.filter(o => o.end > now || (o.end === o.start && o.start > now))
    .sort((a, b) => a.start - b.start)[0];
}

const hideKey = 'ace-hypixel.events.hideHourly';
const hideBox = document.getElementById('hideHourly');
hideBox.checked = U.readLS(hideKey, false);
hideBox.addEventListener('change', () => { U.writeLS(hideKey, hideBox.checked); render(); });

function render() {
  const now = SB.now();
  const d = SB.date(now);
  document.getElementById('sbNow').textContent = `${SB.fmtDate(d)} · ${SB.fmtClock(d)}`;
  document.getElementById('sbYear').textContent = `Year ${d.year}`;

  const rows = EVENTS
    .filter(ev => !(hideBox.checked && ev.kind === 'hourly'))
    .map(ev => ({ ev, o: nextOccurrence(ev, now) }))
    .map(r => ({ ...r, active: r.o.start <= now && r.o.end > now }))
    .sort((a, b) => (b.active - a.active) || ((a.active ? a.o.end : a.o.start) - (b.active ? b.o.end : b.o.start)));

  document.getElementById('events').innerHTML = rows.map(({ ev, o, active }) => {
    const sd = SB.date(o.start + 1);
    const cd = active
      ? `${U.countdown(o.end - now)}<small>left · ends ${U.when(o.end)}</small>`
      : `${U.countdown(o.start - now)}<small>${U.when(o.start)}</small>`;
    const sbLabel = ev.kind === 'hourly' ? '' : ` · ${SB.fmtDate(sd)}, Year ${sd.year}`;
    return `<div class="event ${active ? 'active' : ''}">
      <div class="ico" aria-hidden="true">${ev.icon}</div>
      <div>
        <h3>${U.esc(ev.name)} ${active ? '<span class="badge live">Live now</span>' : ''}</h3>
        <div class="sub">${U.esc(ev.where)}${U.esc(sbLabel)}</div>
        <div class="sub">${U.esc(ev.note)}</div>
      </div>
      <div class="cd">${cd}</div>
    </div>`;
  }).join('');
}

render();
setInterval(render, 1000);
