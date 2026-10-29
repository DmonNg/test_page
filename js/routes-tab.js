/* routes-tab.js — Routes & timetable tab, incl. the KRP_G11 tip card */
/* ---------- Routes tab ---------- */
/* Does this bus go CP -> ... -> KRP_G11 -> stops -> ... -> CP, where waiting at KRP_G11 beats riding from CP? */
function routeTipInfo(b) {
  if (!b || !places[CP_ID] || !places[KRP_ID]) return null;
  const tl = timeline(b), cp = tl.ids.indexOf(CP_ID), krp = tl.ids.indexOf(KRP_ID);
  if (cp < 0 || krp < 0) return null;
  const toCp = off(tl, krp, cp), wmin = dist(stopLL(CP_ID), stopLL(KRP_ID)) / WALK, stops = [];
  tl.ids.forEach((id, i) => {
    if (i === krp || i === cp || id === KRP_ID || id === CP_ID) return;
    const ride = off(tl, krp, i);
    if (ride >= toCp) return;                                                   // not after KRP_G11
    if (wmin + ride >= dist(stopLL(CP_ID), stopLL(id)) / WALK) return;         // close enough to just walk from CP
    if (!stops.includes(id)) stops.push(id);
  });
  if (!stops.length) return null;
  stops.sort((a, c) => off(tl, krp, tl.ids.indexOf(a)) - off(tl, krp, tl.ids.indexOf(c)));   // in route order after KRP_G11
  const x = stops.find(id => /^KDSE/.test(places[id].name)) || stops[0];
  return { tl, krp, cp, stops, x, full: Math.round(off(tl, cp, tl.ids.indexOf(x))), short: Math.round(off(tl, krp, tl.ids.indexOf(x))) };
}
function routeTipHtml(b, di, running, now) {
  const info = routeTipInfo(b); if (!info) return "";
  const kn = esc(places[KRP_ID].name), wd = dist(stopLL(CP_ID), stopLL(KRP_ID));
  const pass = [];
  info.tl.keys.forEach((k, j) => { for (const dep of depsFor(b, k, di)) pass.push(Math.round(dep + off(info.tl, info.tl.starts[j], info.krp))); });
  const merged = [];                                   // same bus listed under two departure points -> keep one time
  pass.sort((a, c) => a - c).forEach(m => { if (!merged.length || m - merged[merged.length - 1] > 2) merged.push(m); });
  let marked = false;
  const chips = merged.map(m => {
    let cls = ""; if (running && now >= 0) { if (m < now) cls = "past"; else if (!marked) { cls = "next"; marked = true; } }
    return `<span class="chip ${cls}">${Bus.fmt(m)}</span>`;
  }).join("");
  const list = info.stops.map(id => esc(places[id].name)).join(" · ");
  return `<div class="tip"><b>${tx("tip_krp_title")}</b><span>${tx("tip_route", { b: esc(b.code), x: esc(places[info.x].name), full: info.full, short: info.short, s: kn, w: walkTxt(wd) })}</span>`
    + `<div class="sub muted">${tx("tip_after", { s: kn, list })}</div>`
    + (chips ? `<div class="sub muted">${tx("tip_passes", { b: esc(b.code), s: kn })}</div><div class="chips">${chips}</div>` : "")
    + `<button class="mini" id="tipMap" style="align-self:flex-start;margin-top:6px">${tx("tip_show_map")}</button></div>`;
}
let mapPreviewPreviousPeek;
function showMapPreview() {
  if (mapPreviewPreviousPeek === undefined) mapPreviewPreviousPeek = $("sheet").classList.contains("peek");
  $("mapNotice").classList.remove("hide");
  peek();
}
$("mapReturn").onclick = () => {
  if (mapPreviewPreviousPeek !== undefined) $("sheet").classList.toggle("peek", mapPreviewPreviousPeek);
  mapPreviewPreviousPeek = undefined;
  $("mapNotice").classList.add("hide");
  $("sheetHint").textContent = tx($("sheet").classList.contains("peek") ? "show_panel" : "hide_panel");
};
function renderRoutes() {
  const di = dayInfo();
  $("rlist").innerHTML = buses.map(b => `<button class="rbtn ${b.code === cur.route ? "on" : ""}" style="--c:${colorOf[b.code] || "#00e5ff"};${busActive(b, di) ? "" : "opacity:.45"}" data-r="${esc(b.code)}">${esc(b.code)}</button>`).join("");
  const b = buses.find(x => x.code === cur.route) || buses[0];
  if (!b) { $("info").innerHTML = '<span class="muted">' + tx("no_sched") + '</span>'; $("times").innerHTML = ""; return; }
  const running = busActive(b, di), now = di.isToday ? nowMin() : -1;
  $("info").innerHTML = `<span class="tag">${esc(b.code)}</span> <b style="margin-left:6px">${esc(b.route)}</b>
    <div class="muted" style="margin:6px 0">${esc(b.via)}</div>
    <span class="badge">${I18N.en["d_" + b.day] ? tx("d_" + b.day) : b.day}</span>${b.friday ? `<span class="badge red">${tx("fri_no", { w: esc(b.friday.join("–")) })}</span>` : ""}${running ? "" : `<span class="badge red">${tx("not_running")}</span>`}
    <div><button class="mini" id="seeMap" style="margin-top:6px">${tx("show_on_map")}</button></div>`;
  $("seeMap").onclick = () => { selectRoute(b.code, false); showMapPreview(); mapPadFit(rlines[b.code].line.getLatLngs()); };
  $("routeMeta").textContent = tx("route_meta", { a: Object.keys(b.from).length, b: timeline(b).ids.length });
  let html = routeTipHtml(b, di, running, now);
  for (const k of Object.keys(b.from).sort()) {
    html += `<div class="card"><b style="color:var(--yellow)">${tx("leaves_from", { x: esc(b.from[k]) })}</b>`;
    let any = false, marked = false;
    for (const t of b.times[k] || []) {
      if (!periodOk(t.period, di)) continue;
      const list = t.list.map(s => s.trim()).filter(s => !friBlocked(b, di, Bus.toMin(s)));
      if (!list.length) continue; any = true;
      html += `<div class="sub">${esc(I18N.en["p_" + t.period] ? tx("p_" + t.period) : t.period)}</div><div class="chips">` + list.map(s => {
        const m = Bus.toMin(s); let cls = "";
        if (running && now >= 0) { if (m < now) cls = "past"; else if (!marked) { cls = "next"; marked = true; } }
        return `<span class="chip ${cls}">${s}</span>`;
      }).join("") + "</div>";
    }
    if (!any) html += '<div class="muted" style="margin-top:6px">' + tx("no_dep") + '</div>';
    html += "</div>";
  }
  $("times").innerHTML = html;
  const tm = $("tipMap");
  if (tm) tm.onclick = () => {
    selectRoute(b.code, false); setTipStop(KRP_ID); showMapPreview();
    if (hasMap) { L.polyline([stopLL(CP_ID), stopLL(KRP_ID)], { color: "#0d2b5e", weight: 4, dashArray: "2 8", opacity: 0.95 }).addTo(layerJ); mapPadFit([stopLL(CP_ID), stopLL(KRP_ID), stopLL(routeTipInfo(b).x)]); }
  };
}
$("rlist").onclick = e => { const r = e.target.closest("[data-r]"); if (r) { cur.route = r.dataset.r; selectRoute(cur.route); } };
$("daySel").onchange = () => { renderRoutes(); updClock(); };
