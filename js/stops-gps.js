/* stops-gps.js — Stop popup and GPS */
/* ---------- Stop popup ---------- */
let stopId = null;
function openStop(id, desc) {
  stopId = id; const p = places[id], di = dayInfo();
  $("stopTitle").textContent = p.name;
  $("stopDesc").textContent = desc || tx(di.isToday ? "next_buses" : "first_buses");
  const nx = nextAtStop(id, di, di.isToday ? nowMin() : 0, 6);
  $("stopBuses").innerHTML = nx.length
    ? nx.map(n => `<div class="sbus"><span><span class="tag" style="background:${colorOf[n.b.code] || "#00e5ff"}">${esc(n.b.code)}</span> <span class="muted">${esc(n.b.route.slice(0, 26))}</span></span><b>${Bus.fmt(n.t)}</b></div>`).join("")
    : '<div class="muted">' + tx("no_more") + '</div>';
  let tipHtml = "";
  if (id === KRP_ID && buses.some(b => routeTipInfo(b))) tipHtml = `<span>${tx("tip_stop_krp")}</span>`;
  else if (id === CP_ID && buses.some(b => busActive(b, di) && routeTipInfo(b))) {
    const t0 = di.isToday ? nowMin() : 0, wd = dist(stopLL(CP_ID), stopLL(KRP_ID));
    const nx = nextAtStop(KRP_ID, di, t0 + wd / WALK, 1)[0];
    if (nx) tipHtml = `<b>${tx("tip_krp_title")}</b><span>${tx("tip_stop_cp", { w: walkTxt(wd), s: esc(places[KRP_ID].name), b: esc(nx.b.code), t: Bus.fmt(nx.t) })}</span>`;
  }
  $("stopTip").innerHTML = tipHtml; $("stopTip").classList.toggle("hide", !tipHtml);
  $("stopCard").classList.remove("hide");
}
$("stopClose").onclick = () => $("stopCard").classList.add("hide");
$("stopFrom").onclick = () => { origLL = null; $("fromIn").value = places[stopId].name; $("stopCard").classList.add("hide"); setTab("plan"); toast(tx("set_from")); };
$("stopTo").onclick = () => { destLL = null; clearTarget(); $("toIn").value = places[stopId].name; $("stopCard").classList.add("hide"); setTab("plan"); toast(tx("set_to")); };

/* ---------- GPS ---------- */
let meMarker = null, mePos = null;
function geoError(err) {
  setGps("off");
  const framed = window.self !== window.top;
  let msg;
  if (!window.isSecureContext) msg = tx("geo_secure");
  else if (err && err.code === 1) msg = framed ? tx("geo_framed") : tx("geo_denied");
  else if (err && err.code === 3) msg = tx("geo_timeout");
  else msg = tx("geo_fail");
  toast(msg + " " + tx("geo_tail"));
  picking = "from"; peek();
}
function nearest(me) { let best = null, bd = 1e12; for (const id of stopIds) { const d = dist(me, [places[id].lat, places[id].lng]); if (d < bd) { bd = d; best = id; } } return { id: best, d: bd }; }
function locate(onDone) {
  if (!navigator.geolocation) return toast(tx("geo_unsupported"));
  setGps("locating");
  navigator.geolocation.getCurrentPosition(pos => {
    setGps("active");
    mePos = [pos.coords.latitude, pos.coords.longitude];
    if (hasMap) {
      if (meMarker) meMarker.setLatLng(mePos);
      else meMarker = L.marker(mePos, { icon: L.divIcon({ className: "", iconSize: [18, 18], html: '<div class="me"></div>' }) }).addTo(map);
    }
    const n = nearest(mePos); if (!n.id) return toast(tx("not_loaded"));
    if (typeof onDone === "function") return onDone(n);
    if (n.d > 5000) toast(tx("far_toast", { k: (n.d / 1000).toFixed(1) }));
    map.flyTo([places[n.id].lat, places[n.id].lng], 17);
    openStop(n.id, tx("nearest_desc", { d: Math.round(n.d) }));
  }, err => geoError(err), { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
}
$("useLoc").onclick = () => locate(n => { origLL = mePos; $("fromIn").value = tx("my_loc_val"); toast(tx("nearest_toast", { s: places[n.id].name, d: Math.round(n.d) })); });
