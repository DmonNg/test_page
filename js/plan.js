/* plan.js — Trip timeline, Plan tab, KRP_G11 planner tip, quick destinations, target pin */
/* ---------- Trip timeline helpers ---------- */
function legStops(l) {
  const tl = timeline(l.b), n = tl.ids.length, out = []; let i = l.fi, guard = 0;
  while (i !== l.ti && guard++ <= n) { out.push({ id: tl.ids[i], t: l.dep + off(tl, l.fi, i) }); i = (i + 1) % n; }
  out.push({ id: tl.ids[l.ti], t: l.arr });
  return out;
}
function tripTimeline(legs, o) {
  o = o || {};
  const GR = "rgba(144,164,174,.7)", T = "transparent";
  const col = l => colorOf[l.b.code] || "#00e5ff", nm = id => places[id].name;
  const rl = (a, b, cls, inner) => `<span class="rl ${cls || ""}" style="--a:${a};--b:${b}">${inner || ""}</span>`;
  const stop = (time, name, sub, a, b, c) => `<div class="st"><b class="tm">${Bus.fmt(time)}</b>${rl(a, b, "", `<i class="dot" style="--c:${c}"></i>`)}<div class="nm"><b>${esc(name)}</b>${sub ? `<span class="muted"> · ${sub}</span>` : ""}</div></div>`;
  const note = (time, html) => `<div class="st"><b class="tm">${time == null ? "" : Bus.fmt(time)}</b>${rl(GR, GR, "full dash")}<div class="nm">${html}</div></div>`;
  let h = '<div class="tl">', above = T;
  if (o.walkIn) { h += note(o.start, `<span class="walk">${o.walkIn}</span>`); above = GR; }
  legs.forEach((l, i) => {
    const c = col(l), last = i === legs.length - 1, st = legStops(l), mids = st.slice(1, -1);
    h += stop(l.dep, nm(l.from), tx("tl_board", { b: esc(l.b.code) }), above, c, c);
    const sum = `<span class="tag" style="background:${c}">${esc(l.b.code)}</span><b>${tx("min_unit", { n: Math.round(l.dur) })}</b><span class="muted">· ${tx("tl_stops", { n: st.length - 1 })}</span>${mids.length ? '<span class="chev">▾</span>' : ""}`;
    const sumRow = `<span class="tm"></span>${rl(c, c, "full")}<div class="nm seg">${sum}</div>`;
    if (mids.length) h += `<details><summary class="st">${sumRow}</summary>${mids.map(m => `<div class="st mid"><b class="tm">${Bus.fmt(m.t)}</b>${rl(c, c, "", `<i class="dot sm" style="--c:${c}"></i>`)}<div class="nm">${esc(nm(m.id))}</div></div>`).join("")}</details>`;
    else h += `<div class="st">${sumRow}</div>`;
    if (!last) {
      const nx = legs[i + 1];
      h += stop(l.arr, nm(l.to), tx("tl_getoff"), c, GR, c);
      h += note(null, `<span class="then">${tx("tl_then")}</span><span class="muted">${tx("tl_change", { b: esc(nx.b.code), n: Math.max(0, Math.round(nx.dep - l.arr)) })}</span>`);
      above = GR;
    } else if (o.walkOut) {
      h += stop(l.arr, nm(l.to), tx("tl_getoff"), c, GR, c);
      h += note(l.arr, `<span class="walk">${o.walkOut}</span>`);
      h += stop(o.final, o.destLabel || tx("tl_target"), "", GR, T, "#ff2a6d");
    } else {
      h += stop(l.arr, nm(l.to), tx("tl_arrive"), c, T, c);
    }
  });
  return h + "</div>";
}

/* ---------- Plan tab ---------- */
function resolveStop(v) {
  v = (v || "").trim().toLowerCase(); if (!v) return null;
  if (nameToId[v]) return nameToId[v];
  const k = Object.keys(nameToId).find(n => n.includes(v)); if (k) return nameToId[k];
  return Object.keys(places).find(i => i.toLowerCase() === v) || null;
}
$("swapBtn").onclick = () => {
  const a = $("fromIn").value; $("fromIn").value = $("toIn").value; $("toIn").value = a;
  [origLL, destLL] = [destLL, origLL];
};
let origLL = null, destLL = null, destMarker = null, picking = false;
$("fromIn").oninput = () => { origLL = null; };
$("toIn").oninput = () => { destLL = null; clearTarget(); };
function clearTarget() { if (destMarker && hasMap) { map.removeLayer(destMarker); destMarker = null; } }
const WALK = 75; // metres per minute
function nearStops(ll, n = 3, max = 1500) {
  return stopIds.map(id => ({ id, d: dist(ll, [places[id].lat, places[id].lng]) })).sort((a, c) => a.d - c.d).slice(0, n).filter((x, i) => i === 0 || x.d <= max);
}
const stopLL = id => [places[id].lat, places[id].lng];
const tripStore = [];
const walkTxt = d => tx("walk_txt", { d: Math.round(d), n: Math.max(1, Math.round(d / WALK)) });

function suggest(oLL, dLL, start, di) {
  const O = nearStops(oLL), D = nearStops(dLL), res = [];
  for (const o of O) for (const d of D) {
    if (o.id === d.id) continue;
    const ready = start + o.d / WALK;
    const dir = directTrips(o.id, d.id, ready, di)[0];
    if (dir) res.push({ legs: [dir], o, d, dep: dir.dep, arr: dir.arr, final: dir.arr + d.d / WALK });
    else { const tr = transferTrips(o.id, d.id, ready, di)[0]; if (tr) res.push({ legs: tr.legs, o, d, dep: tr.dep, arr: tr.arr, final: tr.arr + d.d / WALK }); }
  }
  res.sort((a, c) => a.final - c.final);
  const seen = new Set();
  return res.filter(r => { const k = r.legs.map(l => l.b.code + l.dep).join() + r.d.id; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 5);
}

/* Tip: from Center Point (CP) heading to KDSE, the bus has to loop around the whole campus first.
   Walking to KRP_G11 and waiting there (the bus passes it just before KDSE) is often faster. */
const KRP_ID = "KRP_G11", CP_ID = "CP";
/* Is `id` a stop AFTER KRP_G11 (before the bus loops back to CP) on any bus running that day? */
function afterKrp(id, di) {
  for (const b of buses) {
    if (!busActive(b, di)) continue;
    const tl = timeline(b), k = tl.ids.indexOf(KRP_ID), c = tl.ids.indexOf(CP_ID), t = idxs(tl.ids, id);
    if (k < 0 || c < 0 || !t.length) continue;
    const toCp = off(tl, k, c);
    if (t.some(i => i !== k && off(tl, k, i) < toCp)) return true;
  }
  return false;
}
/* Tip: a student waiting at Center Point (CP) who wants a stop after KRP_G11 (any bus, not only E) is better
   off walking to KRP_G11 and waiting there, instead of riding the whole campus loop from CP. */
function krpTip(oLL, dLL, start, di, baseFinal) {
  if (!places[CP_ID] || !places[KRP_ID]) return null;
  if (dist(oLL, stopLL(CP_ID)) > 200) return null;                 // student must be at CP
  const wd = dist(oLL, stopLL(KRP_ID)), ready = start + wd / WALK;
  let best = null;
  for (const d of nearStops(dLL)) {
    if (d.d > 1500 || d.id === KRP_ID || d.id === CP_ID || !afterKrp(d.id, di)) continue;
    const leg = directTrips(KRP_ID, d.id, ready, di)[0]; if (!leg) continue;
    const final = leg.arr + d.d / WALK;
    if (!best || final < best.final) best = { leg, id: d.id, d: d.d, final };
  }
  if (!best || best.final > baseFinal - 1) return null;            // only suggest when it is really faster
  if (dist(oLL, dLL) / WALK <= wd / WALK + best.leg.dur + best.d / WALK) return null;   // so close that walking beats walk + ride
  return { ...best, wd, ready, saved: Math.round(baseFinal - best.final), dest: places[nearStops(dLL, 1)[0].id].name };
}

function plan() {
  if (!buses.length) return toast(tx("not_loaded"));
  if (!$("fromIn").value.trim() && !origLL) {           // no origin typed: use GPS
    return locate(n => { origLL = mePos; $("fromIn").value = tx("my_loc_val"); plan(); });
  }
  const f = resolveStop($("fromIn").value), t = resolveStop($("toIn").value);
  const oLL = origLL || (f && stopLL(f)), dLL = destLL || (t && stopLL(t));
  if (!oLL) return toast(tx("err_from"));
  if (!dLL) return toast(tx("err_to"));
  const di = dayInfo(), start = $("timeIn").value ? Bus.toMin($("timeIn").value) : nowMin();
  tripStore.length = 0; setTipStop(null);
  const cards = [], SHOW = 3;
  const card = (legs, head, best, o) => {
    tripStore.push({ bs: legs.map(l => l.b), walks: o.walks || [], tip: !!o.tip });
    const wait = Math.max(0, Math.round(legs[0].dep - (o.ready ?? start)));
    cards.push(`<div class="trip ${best ? "best" : ""}">${head}<div class="muted">${tx("wait", { n: wait })}</div>${tripTimeline(legs, o)}<button class="mini" data-trip="${tripStore.length - 1}" style="align-self:flex-start">${tx("view_on_map")}</button></div>`);
  };
  const addTip = baseFinal => {
    const tip = krpTip(oLL, dLL, start, di, baseFinal); if (!tip) return false;
    const kn = esc(places[KRP_ID].name), walks = [[oLL, stopLL(KRP_ID)]];
    if (tip.d > 15) walks.push([stopLL(tip.id), dLL]);
    const head = `<div class="tip"><b>${tx("tip_krp_title")}</b><span>${tx("tip_krp", { w: walkTxt(tip.wd), s: kn, m: tip.saved, d: esc(tip.dest) })}</span></div><div class="hd"><span class="cp" style="color:var(--green);border-color:var(--green)">${tx("best")}${tx("arrive", { t: Bus.fmt(tip.final) })}</span><span class="cp">${tx("total_min", { n: Math.round(tip.final - start) })}</span></div>`;
    card([tip.leg], head, true, {
      walks, start, ready: tip.ready, final: tip.final, tip: true,
      walkIn: tx("walk_to_stop", { w: walkTxt(tip.wd), s: kn }),
      walkOut: tip.d > 15 ? tx("walk_to_target", { w: walkTxt(tip.d) }) : "",
      destLabel: tx("tl_target")
    });
    return true;
  };
  let intro = "";

  if (origLL || destLL) {                                // location-based suggestions
    const res = suggest(oLL, dLL, start, di);
    const tipShown = addTip(res.length ? res[0].final : Infinity);
    if (!res.length && !tipShown) intro = `<div class="card">${tx("no_bus_loc", { t: Bus.fmt(start) })}</div>`;
    res.forEach((r, i) => {
      const walks = [];
      if (r.o.d > 15) walks.push([oLL, stopLL(r.o.id)]);
      if (r.d.d > 15) walks.push([stopLL(r.d.id), dLL]);
      const head = `<div class="hd"><span class="cp" style="${i === 0 && !tipShown ? "color:var(--green);border-color:var(--green)" : ""}">${i === 0 && !tipShown ? tx("best") : ""}${tx("arrive", { t: Bus.fmt(r.final) })}</span><span class="cp">${tx("total_min", { n: Math.round(r.final - start) })}</span></div>`;
      card(r.legs, head, i === 0 && !tipShown, {
        walks, start, ready: start + r.o.d / WALK, final: r.final,
        walkIn: r.o.d > 15 ? tx("walk_to_stop", { w: walkTxt(r.o.d), s: esc(places[r.o.id].name) }) : "",
        walkOut: r.d.d > 15 ? tx("walk_to_target", { w: walkTxt(r.d.d) }) : "",
        destLabel: tx("tl_target")
      });
    });
  } else {                                               // stop-to-stop
    if (f === t) return toast(tx("same_stop"));
    const direct = directTrips(f, t, start, di).slice(0, 8);
    if (direct.length) {
      const bestArr = Math.min(...direct.map(d => d.arr));
      const tipShown = addTip(bestArr);
      direct.forEach(d => {
        const head = `<div class="hd"><span class="big">${Bus.fmt(d.dep)} → ${Bus.fmt(d.arr)}</span><span class="cp">${d.arr === bestArr && !tipShown ? "⭐ " : ""}${tx("min_unit", { n: Math.round(d.dur) })}</span></div>`;
        card([d], head, d.arr === bestArr && !tipShown, {});
      });
    } else {
      const tr = transferTrips(f, t, start, di);
      if (tr.length) {
        intro = '<div class="muted">' + tx("no_direct") + '</div>';
        const tipShown = addTip(tr[0].arr);
        tr.forEach((r, i) => {
          const head = `<div class="hd"><span class="big">${Bus.fmt(r.dep)} → ${Bus.fmt(r.arr)}</span><span class="cp">${i === 0 && !tipShown ? "⭐ " : ""}${tx("min_unit", { n: Math.round(r.arr - r.dep) })}</span></div>`;
          card(r.legs, head, i === 0 && !tipShown, {});
        });
      } else if (!addTip(Infinity)) intro = `<div class="card">${tx("no_bus_day", { t: Bus.fmt(start) })}</div>`;
    }
  }
  let html = intro + cards.slice(0, SHOW).join("");
  if (cards.length > SHOW) {
    const n = cards.length - SHOW;
    html += `<div class="xtra hide" data-extra>${cards.slice(SHOW).join("")}</div><button class="mini" data-more="${n}" style="align-self:center">${tx("more_opts", { n })}</button>`;
  }
  html += '<div class="muted" style="text-align:center">' + tx("estimates") + '</div>';
  if (tripStore.length) html = '<button class="mini" data-all="1" style="align-self:flex-start">' + tx("show_all") + '</button>' + html;
  $("tripOut").innerHTML = html;
  if (tripStore.length) { setTipStop(tripStore[0].tip ? KRP_ID : null); drawJourney(tripStore[0].bs, tripStore[0].walks); }   // show only the best route on the map
  track("plan_trip", { results: tripStore.length, mode: (origLL || destLL) ? "location" : "stops" });
  $("tripOut").scrollIntoView({ block: "nearest", behavior: "smooth" });
}
$("goBtn").onclick = plan;
$("tripOut").onclick = e => { const mb = e.target.closest("[data-more]"); if (mb) { const w = $("tripOut").querySelector("[data-extra]"); w.classList.toggle("hide"); mb.textContent = w.classList.contains("hide") ? tx("more_opts", { n: mb.dataset.more }) : tx("fewer_opts"); return; } if (e.target.closest("[data-all]")) { selectRoute(null, false); fitAll(); return; } const b = e.target.closest("[data-trip]"); if (!b) return; const t = tripStore[+b.dataset.trip]; peek(); setTipStop(t.tip ? KRP_ID : null); drawJourney(t.bs, t.walks); };

/* quick destinations: stops served by the most routes */
function renderQuick() {
  const cnt = {}; buses.forEach(b => new Set(b.path).forEach(id => { if (places[id]) cnt[id] = (cnt[id] || 0) + 1; }));
  const top = Object.keys(cnt).sort((a, c) => cnt[c] - cnt[a]).slice(0, 8);
  $("quick").innerHTML = top.map(id => `<button class="q" data-q="${esc(id)}">🏁 ${esc(places[id].name.replace(/\s*\(.*\)/, ""))}</button>`).join("");
}
$("quick").onclick = e => {
  const q = e.target.closest("[data-q]"); if (!q) return;
  $("toIn").value = places[q.dataset.q].name; destLL = null; clearTarget(); plan();
};

/* pin a target on the map */
function setTarget(ll) {
  picking = false; destLL = ll; clearTarget();
  destMarker = L.marker(ll, { icon: L.divIcon({ className: "", iconSize: [30, 30], iconAnchor: [15, 28], html: '<div class="target">📍</div>' }) }).addTo(map);
  const n = nearStops(ll, 1)[0];
  $("toIn").value = tx("pinned_target", { s: places[n.id].name });
  $("sheet").classList.remove("peek"); setTab("plan"); plan();
}
$("pickBtn").onclick = () => { picking = "to"; peek(); toast(tx("tap_target")); };
function pickAt(ll) { return picking === "from" ? setStart(ll) : setTarget(ll); }
function setStart(ll) {
  picking = false; origLL = ll; mePos = ll;
  if (meMarker) meMarker.setLatLng(ll); else meMarker = L.marker(ll, { icon: L.divIcon({ className: "", iconSize: [18, 18], html: '<div class="me"></div>' }) }).addTo(map);
  $("fromIn").value = tx("pinned_start");
  setTab("plan"); if ($("toIn").value.trim()) plan(); else toast(tx("start_set"));
}
if (hasMap) map.on("click", e => { if (picking) pickAt([e.latlng.lat, e.latlng.lng]); });
