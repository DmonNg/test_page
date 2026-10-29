/* schedule.js — Bus schedule parser, route timeline, trip finder (pure logic, no DOM) */
/* LOGIC START */
class Bus {
  static toMin(t) { const [h, m] = t.split(":").map(Number); return h * 60 + m; }
  static fmt(min) { min = Math.round(min); return String(Math.floor(min / 60) % 24).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0"); }
}
const places = {}, buses = [];
function parse(txt) {
  let b = null;
  buses.length = 0; for (const k in places) delete places[k];
  for (const raw of txt.split("\n")) {
    const l = raw.trim(); if (!l || l[0] === "#") continue;
    const p = l.split("|");
    switch (p[0]) {
      case "PLACE": places[p[1]] = { name: p[2], lat: +p[3], lng: +p[4] }; break;
      case "BUS": b = { code: p[1], day: p[2], from: {}, times: {}, path: [], pathLegs: [], friday: null, route: "", via: "" }; break;
      case "ROUTE": if (b) b.route = p[1]; break;
      case "VIA": if (b) b.via = p[1] || ""; break;
      case "FROM": if (b) b.from[p[1]] = p[2]; break;
      case "FRIDAY_NO_SERVICE": if (b) b.friday = p[1].split("-"); break;
      case "TIMES": if (b) (b.times[p[1]] ??= []).push({ period: p[2], list: p[3].split(",") }); break;
      case "PATH": if (b) {
        b.pathLegs = p.slice(1).join("|").split(/\s+AND_THEN\s+/i).map(leg => leg.split(",").map(s => s.trim()).filter(Boolean)).filter(leg => leg.length);
        b.path = b.pathLegs.flat();
      } break;
      case "END": if (b) buses.push(b); b = null; break;
    }
  }
}
const rad = d => d * Math.PI / 180;
function dist(a, b) {
  const x = rad(b[1] - a[1]) * Math.cos(rad((a[0] + b[0]) / 2)), y = rad(b[0] - a[0]);
  return Math.sqrt(x * x + y * y) * 6371000;
}
function busActive(b, di) { return b.day === "WEEKEND" ? di.weekend : !di.weekend; }
function periodOk(p, di) { if (p === "TUESDAY") return di.tue; if (p === "MON-FRI") return !di.weekend; return true; }
function friBlocked(b, di, m) { return di.fri && b.friday && m >= Bus.toMin(b.friday[0]) && m < Bus.toMin(b.friday[1]); }
function depsFor(b, key, di) {
  const out = [];
  for (const t of b.times[key] || []) {
    if (!periodOk(t.period, di)) continue;
    for (const s of t.list) { const m = Bus.toMin(s.trim()); if (!friBlocked(b, di, m)) out.push(m); }
  }
  return out.sort((a, c) => a - c);
}
function timeline(b) {
  if (b._tl) return b._tl;
  const ids = [];
  for (const id of b.path) { if (!places[id] || ids[ids.length - 1] === id) continue; ids.push(id); }
  if (ids.length > 1 && ids[0] === ids[ids.length - 1]) ids.pop();
  const SPEED = 360, DWELL = 0.4, DETOUR = 1.35;
  const leg = (a, c) => dist([places[a].lat, places[a].lng], [places[c].lat, places[c].lng]) * DETOUR / SPEED + DWELL;
  const cum = [0];
  for (let i = 1; i < ids.length; i++) cum[i] = cum[i - 1] + leg(ids[i - 1], ids[i]);
  const L = ids.length > 1 ? cum[ids.length - 1] + leg(ids[ids.length - 1], ids[0]) : 1;
  const keys = Object.keys(b.from).sort();
  /* where does each "FROM" column really start? 1) stop whose name matches the FROM label,
     2) first stop after the AND_THEN split, 3) last resort: guess by distance around the loop */
  const norm = x => String(x).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const toks = x => norm(x).split(" ").filter(w => w.length > 1 && w !== "bus" && w !== "stop");
  const startFor = (k, j) => {
    const fn = norm(b.from[k]); let i;
    i = ids.findIndex(id => norm(places[id].name) === fn); if (i >= 0) return i;
    i = ids.findIndex(id => { const n = norm(places[id].name); return n.includes(fn) || fn.includes(n); }); if (i >= 0) return i;
    const ft = toks(b.from[k]); let bestI = -1, bestN = 0;
    ids.forEach((id, ix) => { const n = toks(places[id].name).filter(w => ft.includes(w)).length; if (n > bestN) { bestN = n; bestI = ix; } });
    if (bestI >= 0) return bestI;
    const leg = (b.pathLegs || [])[j]; if (leg) { i = ids.indexOf(leg.find(x => places[x])); if (i >= 0) return i; }
    const target = L * j / keys.length; let best = 0, bd = 1e9;
    cum.forEach((c, ix) => { const d = Math.abs(c - target); if (d < bd) { bd = d; best = ix; } });
    return best;
  };
  const starts = keys.map((k, j) => j === 0 ? 0 : startFor(k, j));
  return (b._tl = { ids, cum, L, keys, starts });
}
const off = (tl, a, c) => (((tl.cum[c] - tl.cum[a]) % tl.L) + tl.L) % tl.L;
const idxs = (ids, id) => ids.reduce((r, x, i) => (x === id && r.push(i), r), []);

function directTrips(fromId, toId, startMin, di, onlyBus) {
  const out = [];
  for (const b of buses) {
    if (onlyBus && b !== onlyBus) continue;
    if (!busActive(b, di)) continue;
    const tl = timeline(b), F = idxs(tl.ids, fromId), T = idxs(tl.ids, toId);
    if (!F.length || !T.length) continue;
    tl.keys.forEach((k, j) => {
      const s = tl.starts[j];
      for (const dep of depsFor(b, k, di)) for (const f of F) {
        const o = dep + off(tl, s, f); if (o < startMin) continue;
        let best = null, bt = -1;
        for (const t of T) { if (t === f) continue; const d = off(tl, f, t); if (best === null || d < best) { best = d; bt = t; } }
        if (best !== null) out.push({ b, from: fromId, to: toId, dep: o, arr: o + best, dur: best, fi: f, ti: bt });
      }
    });
  }
  out.sort((a, c) => a.dep - c.dep || a.arr - c.arr);
  const seen = new Set();
  return out.filter(o => { const k = o.b.code + o.dep; if (seen.has(k)) return false; seen.add(k); return true; });
}
function transferTrips(fromId, toId, startMin, di) {
  const res = [];
  for (const b1 of buses) {
    if (!busActive(b1, di)) continue;
    const tl1 = timeline(b1); if (!tl1.ids.includes(fromId)) continue;
    for (const mid of new Set(tl1.ids)) {
      if (mid === fromId || mid === toId) continue;
      const t1 = directTrips(fromId, mid, startMin, di, b1)[0]; if (!t1) continue;
      const t2 = directTrips(mid, toId, t1.arr + 2, di).find(t => t.b !== b1);
      if (t2) res.push({ legs: [t1, t2], dep: t1.dep, arr: t2.arr });
    }
  }
  res.sort((a, c) => a.arr - c.arr || a.dep - c.dep);
  const seen = new Set();
  return res.filter(r => { const k = r.legs[0].b.code + r.legs[0].dep + r.legs[1].b.code + r.legs[1].dep; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 5);
}
function nextAtStop(id, di, fromMin, limit) {
  const out = [];
  for (const b of buses) {
    if (!busActive(b, di)) continue;
    const tl = timeline(b), F = idxs(tl.ids, id); if (!F.length) continue;
    tl.keys.forEach((k, j) => {
      for (const dep of depsFor(b, k, di)) for (const f of F) {
        const t = dep + off(tl, tl.starts[j], f); if (t >= fromMin) out.push({ b, t });
      }
    });
  }
  out.sort((a, c) => a.t - c.t);
  const seen = new Set();
  return out.filter(o => { const k = o.b.code + o.t; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, limit);
}
/* LOGIC END */
