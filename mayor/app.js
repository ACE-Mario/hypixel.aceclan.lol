'use strict';

const API = 'https://api.hypixel.net/v2/resources/skyblock/election';
const ELECTION_END = [2, 27];  // Late Spring 27th
const BOOTH_OPEN = [5, 27];    // Late Summer 27th

function nextYearly([m, d], now) {
  const y = SB.date(now).year;
  for (let yy = y - 1; yy <= y + 1; yy++) { const t = SB.at(yy, m, d); if (t > now) return t; }
  return SB.at(y + 1, m, d);
}

function perksHTML(perks) {
  return (perks || []).map(p => `<div class="perk"><b>${U.mcText(p.name)}</b><div>${U.mcText(p.description)}</div></div>`).join('');
}

function render(data) {
  const m = data.mayor;
  const parts = [];
  parts.push(`<div class="grid2">
    <div class="mayor-card">
      <div class="target-label">Mayor</div>
      <h3>${U.esc(m.name)}</h3>
      ${perksHTML(m.perks)}
    </div>
    ${m.minister ? `<div class="mayor-card">
      <div class="target-label">Minister</div>
      <h3>${U.esc(m.minister.name)}</h3>
      ${perksHTML([m.minister.perk])}
    </div>` : ''}
  </div>`);

  const live = data.current;
  const last = m.election;
  const shown = live || last;
  if (shown && shown.candidates) {
    const total = shown.candidates.reduce((s, c) => s + (c.votes || 0), 0) || 1;
    const cands = [...shown.candidates].sort((a, b) => (b.votes || 0) - (a.votes || 0));
    parts.push(`<h3 class="section-h">${live ? `Election in progress · Year ${live.year}` : `Last election results · Year ${last.year}`}</h3>
      <div class="grid2">${cands.map((c, i) => {
        const pct = (c.votes || 0) / total * 100;
        return `<div class="cand">
          <div class="top-row"><b>${i === 0 ? '👑 ' : ''}${U.esc(c.name)}</b><span class="muted nowrap">${U.num(c.votes || 0)} votes · ${pct.toFixed(1)}%</span></div>
          <div class="bar ${i === 0 ? 'full' : ''}"><span style="width:${pct}%"></span></div>
          <div class="chips">${(c.perks || []).map(p => `<span class="chip ${p.minister ? 'req' : ''}" title="${U.esc(U.plain(p.description))}">${U.esc(U.plain(p.name))}</span>`).join('')}</div>
        </div>`;
      }).join('')}</div>
      <p class="hint">Hover a perk to see what it does.${live ? ' Vote counts update every few minutes.' : ''}</p>`);
  }
  document.getElementById('content').innerHTML = parts.join('');
  document.getElementById('updated').textContent = data.lastUpdated ? `API updated ${U.when(data.lastUpdated / 1000)}.` : '';
  hasLive = !!live;
}

let hasLive = false;
function tick() {
  const now = SB.now();
  const end = nextYearly(ELECTION_END, now);
  const booth = nextYearly(BOOTH_OPEN, now);
  // While voting is open, the next milestone is the result; otherwise it's the booth opening.
  const votingOpen = hasLive || booth > end;
  const target = votingOpen ? end : booth;
  document.getElementById('termLabel').textContent = votingOpen ? 'Election closes in' : 'Voting opens in';
  document.getElementById('termCd').textContent = U.countdown(target - now);
  document.getElementById('termWhen').textContent = `${SB.fmtDate(SB.date(target + 1))} · ${U.when(target)}`;
}

async function load() {
  try {
    const r = await fetch(API);
    const data = await r.json();
    if (!data.success) throw new Error('API error');
    render(data);
  } catch {
    document.getElementById('content').innerHTML = '<p class="empty-note">Couldn\'t reach the Hypixel API. Try again in a minute.</p>';
  }
  tick();
}

load();
setInterval(tick, 1000);
setInterval(load, 5 * 60 * 1000);
