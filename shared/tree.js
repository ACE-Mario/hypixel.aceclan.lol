/* Skill tree planner shared by the Heart of the Mountain and Heart of the Forest pages.
   Tree data (positions, max levels, costs, stats) comes from data/hotm.json / data/hotf.json,
   built by scripts/extract_trees.py from the NotEnoughUpdates repo. */
'use strict';

const Tree = (() => {
  /* ---------- a tiny evaluator for NEU's lisp-style expressions ---------- */
  function tokenize(src) {
    const out = [];
    const re = /\s*(\(|\)|"[^"]*"|[^\s()]+)/g;
    let m;
    while ((m = re.exec(src))) out.push(m[1]);
    return out;
  }
  function parse(tokens) {
    const t = tokens.shift();
    if (t === '(') {
      const list = [];
      while (tokens.length && tokens[0] !== ')') list.push(parse(tokens));
      tokens.shift();
      return list;
    }
    if (t[0] === '"') return { str: t.slice(1, -1) };
    const n = Number(t);
    return Number.isNaN(n) ? { sym: t } : n;
  }
  const cache = new Map();
  function compile(src) {
    if (!cache.has(src)) cache.set(src, src ? parse(tokenize(src)) : null);
    return cache.get(src);
  }
  const FN = {
    '+': (...a) => a.reduce((x, y) => x + y, 0),
    '-': (a, b) => (b === undefined ? -a : a - b),
    '*': (...a) => a.reduce((x, y) => x * y, 1),
    '/': (a, b) => a / b,
    pow: Math.pow, floor: Math.floor, round: Math.round,
    min: Math.min, max: Math.max, id: x => x,
    lt: (a, b) => a < b, gt: (a, b) => a > b, '=': (a, b) => a === b,
    'round-decimals': (n, p) => Math.round(n * 10 ** p) / 10 ** p,
    'list.new': (...a) => a, 'list.at': (l, i) => l[i],
  };
  function ev(node, env) {
    if (typeof node === 'number' || node === null || node === undefined) return node;
    if (node.str !== undefined) return node.str;
    if (node.sym !== undefined) return node.sym in env ? env[node.sym] : node.sym.replace(/^:/, '');
    const [head, ...args] = node;
    if (head.sym === 'if') return ev(args[0], env) ? ev(args[1], env) : ev(args[2], env);
    const f = FN[head.sym];
    return f ? f(...args.map(a => ev(a, env))) : undefined;
  }
  const run = (src, env) => (src === '' || src === undefined ? undefined : ev(compile(String(src)), env));

  /* ---------- tree maths ---------- */
  function makeTree(data) {
    const perks = data.perks;
    const ids = Object.keys(perks);
    const coreId = ids.find(id => perks[id].core);
    const at = new Map(ids.map(id => [`${perks[id].x},${perks[id].tier}`, id]));
    const near = id => {
      const p = perks[id];
      return [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => at.get(`${p.x + dx},${p.tier + dy}`)).filter(Boolean);
    };
    const root = ids.find(id => perks[id].tier === 1);
    const env = (lv, s) => ({ level: lv, level0: lv, maxLevel: 0, potm: (s.plan[coreId] || 0) - 1, hotm: s.tier });

    /** Powder type and amount to go from level `lv` to `lv + 1`. Level 1 only costs a token. */
    function step(id, lv, s) {
      const p = perks[id];
      if (lv === 0 && !p.core) return null;
      const e = env(lv, s);
      const amount = Math.floor(run(p.cost, e) || 0);
      const powder = p.powder.startsWith('(') ? run(p.powder, e) : p.powder;
      return amount && powder ? [powder, amount] : null;
    }
    /** Powder needed to take a perk from level a to level b (b > a). */
    function cost(id, a, b, s, into = {}) {
      for (let lv = a; lv < b; lv++) {
        const c = step(id, lv, s);
        if (c) into[c[0]] = (into[c[0]] || 0) + c[1];
      }
      return into;
    }
    function tierFromXp(xp) {
      let t = 1;
      data.xp.forEach((need, i) => { if (xp >= need) t = i + 1; });
      return t;
    }
    function tokensAt(tier, coreLv) {
      let n = data.tokens.slice(0, tier).reduce((a, b) => a + b, 0);
      for (const [lv, k] of Object.entries(data.coreTokens)) if (coreLv >= +lv) n += k;
      return n;
    }
    const tokensUsed = levels => ids.filter(id => !perks[id].core && levels[id] > 0).length;

    /** Perks that are levelled but not connected back to the first perk. */
    function disconnected(levels) {
      const on = id => levels[id] > 0;
      const seen = new Set();
      if (on(root)) {
        const q = [root]; seen.add(root);
        while (q.length) for (const n of near(q.shift())) if (on(n) && !seen.has(n)) { seen.add(n); q.push(n); }
      }
      return new Set(ids.filter(id => on(id) && !seen.has(id)));
    }
    /** Adds the fewest level-1 perks needed so every levelled perk connects back to the first one. */
    function connect(levels) {
      if (!(levels[root] > 0)) levels[root] = 1;
      for (let guard = 0; guard < 40; guard++) {
        const loose = disconnected(levels);
        if (!loose.size) return;
        // 0-1 BFS from the connected part: stepping onto a perk you don't have costs 1.
        const conn = ids.filter(id => levels[id] > 0 && !loose.has(id));
        const dist = new Map(conn.map(id => [id, 0])), prev = new Map();
        const dq = [...conn];
        while (dq.length) {
          const cur = dq.shift();
          for (const n of near(cur)) {
            const w = levels[n] > 0 ? 0 : 1;
            const d = dist.get(cur) + w;
            if (!dist.has(n) || d < dist.get(n)) {
              dist.set(n, d); prev.set(n, cur);
              if (w) dq.push(n); else dq.unshift(n);
            }
          }
        }
        // Join the closest loose perk, then repeat.
        let best = null;
        for (const id of loose) if (dist.has(id) && (!best || dist.get(id) < dist.get(best))) best = id;
        if (!best) return;
        for (let c = prev.get(best); c; c = prev.get(c)) if (!(levels[c] > 0)) levels[c] = 1;
      }
    }
    return { data, perks, ids, coreId, root, near, step, cost, tierFromXp, tokensAt, tokensUsed, disconnected, connect, run, env };
  }

  /* ---------- page ---------- */
  const PUA = /[-]/g;

  function loreHTML(t, id, lv, s) {
    const p = t.perks[id];
    const e = t.env(lv, s);
    e.maxLevel = p.max;
    const vals = {};
    for (const [k, src] of Object.entries(p.stats || {})) {
      const v = t.run(src, e);
      vals[k] = typeof v === 'number' ? +v.toFixed(2) : v;
    }
    vals.stats = vals.stat;
    const lines = [];
    for (const l of p.lore) {
      if (typeof l === 'object') { if (t.run(l.onlyIf, e)) lines.push(l.text); continue; }
      lines.push(l);
    }
    return lines.map(l => U.mcText(l.replace(PUA, '').replace(/\{(\w+)\}/g, (_, k) => (vals[k] === undefined ? '?' : typeof vals[k] === 'number' ? vals[k].toLocaleString(undefined, { maximumFractionDigits: 2 }) : vals[k]))) || '&nbsp;').join('<br>');
  }

  /**
   * cfg: { data, storeKey, node: 'mining'|'foraging', label: 'HotM', powderOf(member) → {POWDER: n},
   *        presets: [{ id, name, desc, src, ability, levels: { perk: n|'max' } }], abilityKey }
   */
  async function page(cfg) {
    const $ = s => document.querySelector(s);
    const t = makeTree(await fetch(cfg.data, { cache: 'no-cache' }).then(r => r.json()));
    const { perks, ids } = t;
    const P = t.data.powders;
    const rows = t.data.rows;
    const blank = () => Object.fromEntries(ids.map(id => [id, 0]));
    let s = U.readLS(cfg.storeKey, null) || {};
    s = {
      tier: s.tier || rows, plan: { ...blank(), ...(s.plan || {}) }, cur: { ...blank(), ...(s.cur || {}) },
      ability: s.ability || '', curAbility: s.curAbility || '', have: s.have || {}, sel: s.sel || t.root, fromProfile: !!s.fromProfile,
    };
    const save = () => U.writeLS(cfg.storeKey, s);
    const pname = k => (P[k] ? U.named(P[k][0], P[k][1]) : U.esc(k));
    const costLine = c => Object.keys(P).filter(k => c[k]).map(k => `${U.num(c[k])} ${pname(k)}`).join(' + ') || 'Free';
    const abilities = ids.filter(id => perks[id].ability);

    function totals() {
      const plan = {}, up = {}, refund = {};
      for (const id of ids) {
        t.cost(id, 0, s.plan[id], s, plan);
        if (s.plan[id] > s.cur[id]) t.cost(id, s.cur[id], s.plan[id], s, up);
        else if (s.plan[id] < s.cur[id] && !perks[id].core) t.cost(id, s.plan[id], s.cur[id], s, refund);
      }
      return { plan, up, refund };
    }

    /** The Minecraft item a perk shows in game at a level (coal / emerald / diamond and so on). */
    function itemOf(id, lv) {
      const p = perks[id], ic = cfg.icons || {};
      const it = p.item || '';
      let name;
      if (it.startsWith(':')) name = it.slice(1);
      else if (it.startsWith('(npi')) name = (ic.npi || [])[lv === 0 ? 0 : lv >= p.max ? 2 : 1];
      else if (it.startsWith('(api')) name = (ic.api || [])[lv === 0 ? 0 : 1];
      else if (it) name = String(t.run(it, { level0: lv, maxLevel: p.max }) || '');
      return (ic.map || {})[name] || name || 'BARRIER';
    }
    const slotImg = (item, off) => `<img src="../icons/${encodeURIComponent(item)}.png" alt="" loading="lazy"${off ? ' class="off"' : ''} onerror="this.style.visibility='hidden'">`;

    /** Minecraft-style tooltip text for a perk. */
    function tipHTML(id) {
      const p = perks[id], c = s.cur[id], v = s.plan[id];
      const bad = v > 0 && (t.disconnected(s.plan).has(id) || p.tier > s.tier);
      const col = bad ? 'c' : v >= p.max ? 'a' : v > 0 ? 'e' : 'c';
      const lines = [`§${col}${p.name}`];
      if (p.max > 1) lines.push(`§7Level ${c === v ? v : `${c} → §f${v}`}§8/${p.max}`);
      if (p.ability) lines.push(s.ability === id ? '§aSelected ability' : '§8Pickaxe ability');
      const lore = loreHTML(t, id, Math.max(v, 1), s);
      const cost = v > c ? `<br><br>${U.mcText('§7Cost: ')}${costLine(t.cost(id, c, v, s))}` : '';
      const warn = p.tier > s.tier ? `<br>${U.mcText(`§cNeeds tier ${p.tier}`)}` : bad ? `<br>${U.mcText('§cNot connected')}` : '';
      return `${lines.map(l => U.mcText(l)).join('<br>')}<br>${lore}${cost}${warn}`;
    }

    function renderGrid() {
      const loose = t.disconnected(s.plan);
      const cells = [];
      for (let tier = rows; tier >= 1; tier--) {
        const open = tier <= s.tier;
        cells.push(`<div class="mc-slot mc-tier${open ? ' open' : ''}" title="Tier ${tier}${open ? '' : ' (locked)'}">${slotImg(open ? cfg.icons.tierOn : cfg.icons.tierOff)}<span class="mc-n">${tier}</span></div>`);
        for (let x = 0; x < 7; x++) {
          const id = ids.find(i => perks[i].x === x && perks[i].tier === tier);
          if (!id) { cells.push('<div class="mc-slot empty"></div>'); continue; }
          const p = perks[id], c = s.cur[id], v = s.plan[id];
          const cls = ['mc-slot', 'perk'];
          if (v > c) cls.push('up'); else if (v < c) cls.push('down');
          if (v > 0 && (loose.has(id) || tier > s.tier)) cls.push('bad');
          if (s.sel === id) cls.push('sel');
          if (p.ability && s.ability === id) cls.push('glint');
          const n = p.max > 1 && v > 0 ? `<span class="mc-n">${v}</span>` : '';
          const arrow = v > c ? '<span class="mc-chg up">▲</span>' : v < c ? '<span class="mc-chg down">▼</span>' : '';
          cells.push(`<button type="button" class="${cls.join(' ')}" data-id="${id}" aria-label="${U.esc(p.name)}">${slotImg(itemOf(id, v), tier > s.tier)}${n}${arrow}</button>`);
        }
        cells.push('<div class="mc-slot empty"></div>');
      }
      $('#grid').innerHTML = `<div class="mc-title">${U.esc(cfg.title || cfg.label)}</div><div class="mc-grid">${cells.join('')}</div>`;
    }

    // Hover tooltip that follows the mouse, like in game.
    const tip = document.createElement('div');
    tip.className = 'mc-tip'; tip.hidden = true;
    document.body.appendChild(tip);
    const placeTip = e => {
      const w = tip.offsetWidth, h = tip.offsetHeight;
      let x = e.clientX + 14, y = e.clientY - 10;
      if (x + w > innerWidth - 8) x = e.clientX - w - 14;
      if (y + h > innerHeight - 8) y = innerHeight - h - 8;
      tip.style.left = Math.max(8, x) + 'px'; tip.style.top = Math.max(8, y) + 'px';
    };
    $('#grid').addEventListener('mouseover', e => {
      const b = e.target.closest('[data-id]');
      if (!b || matchMedia('(hover: none)').matches) { tip.hidden = true; return; }
      tip.innerHTML = tipHTML(b.dataset.id); tip.hidden = false; placeTip(e);
    });
    $('#grid').addEventListener('mousemove', e => { if (!tip.hidden) placeTip(e); });
    $('#grid').addEventListener('mouseleave', () => { tip.hidden = true; });
    Tree.tip = { el: tip, place: placeTip };

    function renderDetail() {
      const id = s.sel, p = perks[id];
      if (!p) { $('#detail').innerHTML = ''; return; }
      const c = s.cur[id], v = s.plan[id];
      const issues = [];
      if (p.tier > s.tier) issues.push(`Needs ${cfg.label} tier ${p.tier}.`);
      if (v > 0 && t.disconnected(s.plan).has(id)) issues.push('Not connected to the rest of your tree. Unlock a perk next to it first.');
      const step = v < p.max ? t.step(id, v, s) : null;
      const btn = (d, label) => `<button type="button" class="btn ghost small" data-step="${d}">${label}</button>`;
      $('#detail').innerHTML = `
        <h3>${U.esc(p.name)}</h3>
        <div class="muted">${[`Tier ${p.tier}`, p.max > 1 ? `max level ${p.max}` : 'one level',
          p.powder && !p.powder.startsWith('(') ? pname(p.powder) : '', p.core ? 'Doesn\'t use a token' : '',
          p.est ? '<span title="Not listed on the wiki yet">cost estimated</span>' : ''].filter(Boolean).join(' · ')}</div>
        ${issues.map(i => `<p class="ht-warn">${U.esc(i)}</p>`).join('')}
        <div class="ht-levels">
          <span>You have <b>${c}</b></span>
          <label class="field">Plan <input type="number" id="lvl" min="0" max="${p.max}" value="${v}" class="small"></label>
          <span class="ht-btns">${p.max > 1 ? btn(-10, '−10') + btn(-1, '−1') + btn(1, '+1') + btn(10, '+10') + btn('max', 'Max') : btn('max', 'Take')}${btn(0, 'None')}</span>
        </div>
        ${p.ability ? `<label class="ht-pick"><input type="radio" name="abil" value="${id}" ${s.ability === id ? 'checked' : ''} ${v ? '' : 'disabled'}> Use this as my selected ability</label>` : ''}
        <div class="ht-lore">${loreHTML(t, id, Math.max(v, 1), s)}</div>
        ${v !== c && c > 0 && p.max > 1 ? `<details class="ht-was"><summary>At your current level (${c})</summary><div class="ht-lore">${loreHTML(t, id, c, s)}</div></details>` : ''}
        <div class="ht-cost">
          ${v > c ? `<div><span class="muted">${c} → ${v}:</span> ${costLine(t.cost(id, c, v, s))}</div>` : ''}
          ${step ? `<div><span class="muted">Next level:</span> ${costLine({ [step[0]]: step[1] })}</div>` : ''}
          ${v > 0 ? `<div><span class="muted">All ${v} level${v > 1 ? 's' : ''} in total:</span> ${costLine(t.cost(id, 0, v, s))}${p.core ? '' : ' + 1 token'}</div>` : ''}
        </div>`;
    }

    // "You are missing X" / "You have X more than needed", per powder, against everything you own (spent + unspent).
    function powderStatus(plan) {
      if (!Object.keys(s.have).some(k => s.have[k])) return [];
      return Object.keys(P).filter(k => plan[k] || s.have[k]).map(k => {
        const d = (s.have[k] || 0) - (plan[k] || 0), name = P[k][1];
        return d < 0 ? { k, bad: true, text: `You are missing ${U.num(-d)} ${name}` }
          : { k, bad: false, text: d ? `You have ${U.num(d)} more ${name} than needed` : `You have exactly enough ${name}` };
      });
    }

    function renderStats() {
      const tot = totals();
      const coreLv = t.coreId ? s.plan[t.coreId] : 0;
      const avail = t.tokensAt(s.tier, coreLv), used = t.tokensUsed(s.plan);
      const loose = t.disconnected(s.plan).size;
      const locked = ids.filter(id => s.plan[id] > 0 && perks[id].tier > s.tier).length;
      const haveAny = Object.keys(s.have).some(k => s.have[k]);
      const cards = [`<div class="stat"><div class="k">Tokens</div><div class="v ${used > avail ? 'ht-over' : ''}">${used} / ${avail}</div>
        <div class="hint" style="margin:4px 0 0">${used > avail ? `${used - avail} more than you have at tier ${s.tier}` : `${avail - used} spare`}</div></div>`];
      for (const k of Object.keys(P)) {
        const have = s.have[k] || 0;
        const over = haveAny && tot.plan[k] > have;
        cards.push(`<div class="stat"><div class="k">${U.esc(P[k][1])}</div>
          <div class="v ${over ? 'ht-over' : ''}">${U.num(tot.plan[k] || 0)}${haveAny ? ` <small>/ ${U.num(have)}</small>` : ''}</div>
          <div class="hint" style="margin:4px 0 0">${tot.up[k] ? `${U.num(tot.up[k])} more than your tree now` : 'Nothing extra'}${tot.refund[k] ? ` · ${U.num(tot.refund[k])} freed up` : ''}</div>
          ${haveAny ? (st => st ? `<div class="ht-pw ${st.bad ? 'bad' : 'ok'}">${U.esc(st.text)}</div>` : '')(powderStatus(tot.plan).find(x => x.k === k)) : ''}</div>`);
      }
      $('#stats').innerHTML = cards.join('');
      $('#tierNow').textContent = s.tier;
      $('#tierInfo').textContent = `${avail} tokens`;
      const warn = [];
      if (loose) warn.push(`${loose} perk${loose > 1 ? 's aren\'t' : ' isn\'t'} connected to the rest of the tree.`);
      if (locked) warn.push(`${locked} perk${locked > 1 ? 's need' : ' needs'} a higher tier than ${s.tier}.`);
      if (used > avail) warn.push('Not enough tokens for every perk in this plan.');
      if (abilities.length && !s.ability && abilities.some(a => s.plan[a])) warn.push('Pick which ability you will use (click it in the tree).');
      if (haveAny && Object.keys(P).some(k => tot.plan[k] > (s.have[k] || 0))) warn.push('This plan needs more powder than you have in total. Spend your powder on the top of the list below first.');
      $('#warn').innerHTML = warn.map(w => `<p class="ht-warn">${U.esc(w)}</p>`).join('');
      $('#haveRow').innerHTML = Object.keys(P).map(k => `<label class="field">${U.esc(P[k][1])} you own
        <input type="number" min="0" step="1000" data-have="${k}" value="${s.have[k] || ''}" placeholder="unknown"></label>`).join('');
    }

    function renderList() {
      const changed = ids.filter(id => s.plan[id] !== s.cur[id]);
      if (!changed.length) { $('#todo').innerHTML = '<p class="empty-note">Your plan matches your tree. Pick a build above or click a perk to change it.</p>'; return; }
      // Anything lowered means a reset, which refunds every perk (not the core), so everything is levelled from 0.
      const reset = changed.some(id => s.plan[id] < s.cur[id] && !perks[id].core);
      const from = id => (reset && !perks[id].core ? 0 : s.cur[id]);
      const order = (a, b) => perks[a].tier - perks[b].tier || perks[a].x - perks[b].x;
      const up = ids.filter(id => s.plan[id] > from(id)).sort(order);
      const total = {};
      for (const id of up) t.cost(id, from(id), s.plan[id], s, total);
      const refund = {};
      if (reset) for (const id of ids) if (!perks[id].core) t.cost(id, 0, s.cur[id], s, refund);
      const card = id => {
        const p = perks[id], a = from(id), b = s.plan[id];
        const lvl = p.max === 1 || b === 1 ? 'Unlock' : b >= p.max ? `Max <small>(${b})</small>` : `Level ${b}`;
        const c = t.cost(id, a, b, s);
        return `<a href="#" class="ht-step${b >= p.max ? ' max' : ''}" data-go="${id}">
          <span class="nm">${U.esc(p.name)}</span><span class="to">${lvl}</span>
          <span class="cost">${a > 0 ? `from ${a} · ` : ''}${Object.keys(c).length ? costLine(c) : 'free'}</span></a>`;
      };
      const tiers = [...new Set(up.map(id => perks[id].tier))];
      $('#todo').innerHTML = `
        ${reset ? `<div class="ht-reset"><b>1. Refund all</b><span>Reset your tree in game. You get back every token${Object.keys(refund).length ? ` and ${costLine(refund)}` : ''}${t.coreId ? ` (${U.esc(perks[t.coreId].name)} stays)` : ''}.</span></div>` : ''}
        <div class="ht-reset ht-then"><b>${reset ? '2. Then level these' : 'Level these'}</b>
          <span>Total: ${costLine(total)}. Go tier by tier so each perk is connected.</span>
          ${powderStatus(totals().plan).map(x => `<span class="ht-pw ${x.bad ? 'bad' : 'ok'}">${U.esc(x.text)}</span>`).join('')}</div>
        ${tiers.map(tr => `<div class="ht-tier-h">Tier ${tr}</div>
          <div class="ht-steps">${up.filter(id => perks[id].tier === tr).map(card).join('')}</div>`).join('')}
        ${s.ability && s.ability !== s.curAbility ? `<p class="hint">Then select <b>${U.esc(perks[s.ability].name)}</b> as your ability.</p>` : ''}`;
    }

    function renderPresets() {
      $('#presets').innerHTML = cfg.presets.map(p => `<div class="card ht-preset">
        <h3>${U.esc(p.name)}</h3><p>${U.esc(p.desc)}</p>
        <div class="chips">${Object.entries(p.levels).map(([id, lv]) => perks[id] ? `<span class="chip">${U.esc(perks[id].name)}${perks[id].max > 1 ? ` ${lv === 'max' ? perks[id].max : lv}` : ''}</span>` : '').join('')}</div>
        <div class="ht-preset-foot">
          <button type="button" class="btn" data-preset="${p.id}">Plan this build</button>
          <button type="button" class="btn ghost" data-preset="${p.id}" data-tier="1">Only what my tier allows</button>
          ${cfg.best ? `<button type="button" class="btn ghost" data-preset="${p.id}" data-best="1" title="Spends your tokens and powder where they add the most for this build">Best I can do</button>` : ''}
          ${p.src ? `<span class="hint">Based on <a href="${p.src}" target="_blank" rel="noopener">${U.esc(p.srcName || 'this guide')}</a></span>` : ''}
        </div></div>`).join('');
    }

    // Hooks for page-specific panels (the HotM gear panel): read the plan, change it, evaluate stats.
    const api = {
      tree: t, get state() { return s; }, render: () => render(),
      stat: (id, lv) => (lv > 0 && perks[id] && perks[id].stats ? +t.run(perks[id].stats.stat, t.env(lv, s)) || 0 : 0),
      levelCost: (id, lv) => { const c = t.step(id, lv - 1, s); return c ? c[1] : 0; },
      pname,
    };
    function render() {
      $('#tier').value = s.tier;
      renderGrid(); renderDetail(); renderStats(); renderList();
      save();
      if (cfg.onRender) cfg.onRender(api);
    }

    function applyPreset(p, tierOnly) {
      // Perks are listed in priority order, so when they don't all fit the last ones are dropped.
      let want = Object.entries(p.levels).filter(([id]) => perks[id] && (!tierOnly || perks[id].tier <= s.tier));
      const build = () => {
        const lv = blank();
        if (t.coreId) lv[t.coreId] = Math.max(s.cur[t.coreId], s.plan[t.coreId]);   // core levels are never refunded
        for (const [id, v] of want) lv[id] = Math.max(lv[id], v === 'max' ? perks[id].max : Math.min(v, perks[id].max));
        t.connect(lv);
        return lv;
      };
      let levels = build();
      while (tierOnly && want.length && t.tokensUsed(levels) > t.tokensAt(s.tier, t.coreId ? levels[t.coreId] : 0)) {
        const i = want.map(([id]) => !perks[id].core).lastIndexOf(true);
        if (i < 0) break;
        want.splice(i, 1);
        levels = build();
      }
      s.plan = levels;
      // The preset's ability, or its fallback when the tier can't reach it yet (e.g. Sheer Force needs HotM 10).
      s.ability = [p.ability, p.fallback].find(a => a && levels[a]) || abilities.find(a => levels[a]) || '';
      if (cfg.onPreset) cfg.onPreset(p);
      render();
      // Scroll to what the preset changes first (HotM: the gear panel), else the tree.
      ($(cfg.presetScroll || '#grid') || $('#grid')).scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function setLevel(id, v) {
      const p = perks[id];
      s.plan[id] = Math.max(0, Math.min(p.max, Math.round(+v || 0)));
      if (p.ability && !s.plan[id] && s.ability === id) s.ability = '';
      if (p.ability && s.plan[id] && !s.ability) s.ability = id;
      render();
    }

    /* events */
    $('#grid').addEventListener('click', e => {
      const b = e.target.closest('[data-id]'); if (!b) return;
      s.sel = b.dataset.id; render();
      if (matchMedia('(max-width: 820px)').matches) $('#detail').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    $('#detail').addEventListener('click', e => {
      const b = e.target.closest('[data-step]'); if (!b) return;
      const p = perks[s.sel], d = b.dataset.step;
      setLevel(s.sel, d === 'max' ? p.max : d === '0' ? 0 : s.plan[s.sel] + +d);
    });
    $('#detail').addEventListener('change', e => {
      if (e.target.id === 'lvl') setLevel(s.sel, e.target.value);
      if (e.target.name === 'abil') { s.ability = e.target.value; render(); }
    });
    $('#todo').addEventListener('click', e => {
      const a = e.target.closest('[data-go]'); if (!a) return;
      e.preventDefault(); s.sel = a.dataset.go; render();
      $('#grid').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('#presets').addEventListener('click', e => {
      const b = e.target.closest('[data-preset]'); if (!b) return;
      const p = cfg.presets.find(x => x.id === b.dataset.preset);
      if (b.dataset.best && cfg.best) {
        if (cfg.onPreset) cfg.onPreset(p);
        const r = cfg.best(p, api);
        if (r) { s.plan = r.levels; s.ability = r.ability; }
        render();
        ($(cfg.presetScroll || '#grid') || $('#grid')).scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      applyPreset(p, !!b.dataset.tier);
    });
    $('#tier').addEventListener('change', e => { s.tier = +e.target.value; render(); });
    $('#haveRow').addEventListener('change', e => {
      const k = e.target.dataset.have; if (!k) return;
      s.have[k] = Math.max(0, +e.target.value || 0); render();
    });
    $('#mine').addEventListener('click', () => { s.plan = { ...s.cur }; s.ability = s.curAbility; render(); });
    $('#clear').addEventListener('click', () => {
      s.plan = blank();
      if (t.coreId) s.plan[t.coreId] = s.cur[t.coreId];
      s.ability = ''; render();
    });
    $('#tier').innerHTML = t.data.xp.map((xp, i) => `<option value="${i + 1}">Tier ${i + 1}${xp ? ` (${U.num(xp)} XP)` : ''}</option>`).join('');

    renderPresets();
    render();

    async function applyProfile(d, fresh) {
      const m = d.member, st = m.skill_tree || {};
      const nodes = (st.nodes || {})[cfg.node] || {};
      const cur = blank();
      for (const id of ids) if (nodes[id]) cur[id] = Math.min(perks[id].max, +nodes[id] || 0);
      const xp = ((st.experience || {})[cfg.node]) || 0;
      const have = cfg.powderOf(m);
      const changed = U.changed(cfg.storeKey, [cur, xp]) || fresh || !s.fromProfile;
      s.cur = cur; s.curAbility = (st.selected_ability || {})[cfg.node] || '';
      s.have = have;
      if (changed) { s.tier = t.tierFromXp(xp); s.plan = { ...cur }; s.ability = s.curAbility; }
      s.fromProfile = true;
      if (cfg.onProfile) await cfg.onProfile(d, api);
      render();
      const n = ids.filter(id => cur[id] > 0).length;
      return `${cfg.label} tier ${t.tierFromXp(xp)}, ${n} perk${n === 1 ? '' : 's'} unlocked`;
    }
    U.profileBar($('#profileBar'), { what: `your ${cfg.label}`, apply: applyProfile });
  }

  return { page, makeTree, tip: null };
})();
