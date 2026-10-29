/* tabs.js — Bottom sheet, tab switching, populate() after the schedule loads */
/* ---------- Sheet & tabs ---------- */
const TITLES = { plan: "Plan a trip", routes: "Routes & timetable", "3d": "3D map view" };
let tab = "plan";
function setTab(t) {
  if (t === "near") { locate(); return; }
  tab = t;
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("on", b.dataset.tab === t));
  ["plan", "routes", "3d"].forEach(x => $("p-" + x).classList.toggle("hide", x !== t));
  $("sheetTitle").textContent = tx("title_" + t);
  $("sheet").classList.remove("peek"); $("sheet").classList.toggle("tall3d", t === "3d");
  $("sheetHint").textContent = tx("hide_panel");
  if (t === "3d") { setMapTilt($("mapTilt").value); track("open_3d_view"); } else setMapTilt(window._mapKey === "digi" ? $("mapTilt").value : 0);
  updatePokestopStyle();
  if (t === "routes") renderRoutes();
  if (t === "plan" && !$("timeIn").value) $("timeIn").value = Bus.fmt(nowMin());
  if (t === "routes") selectRoute(cur.route, false);
  else if (t === "plan" && !journeyActive) selectRoute(null, false);
}
document.querySelectorAll(".tab").forEach(b => b.onclick = () => setTab(b.dataset.tab));
$("handle").onclick = () => { const s = $("sheet"); s.classList.toggle("peek"); $("sheetHint").textContent = s.classList.contains("peek") ? tx("show_panel") : tx("hide_panel"); };
const peek = () => { $("sheet").classList.add("peek"); $("sheetHint").textContent = tx("show_panel"); };

/* ---------- Data ---------- */
let nameToId = {}, stopIds = [];
const cur = { route: null };
function populate() {
  stopIds = [...new Set(buses.flatMap(b => b.path))].filter(i => places[i]);
  nameToId = {}; stopIds.forEach(id => { const n = places[id].name.toLowerCase(); if (!nameToId[n]) nameToId[n] = id; });
  $("placeList").innerHTML = stopIds.map(id => `<option value="${esc(places[id].name)}">`).join("");
  cur.route = buses[0]?.code || null;
  drawRoutes(); drawStops(); fitAll(); renderRoutes(); renderQuick();
  $("timeIn").value = Bus.fmt(nowMin());
}
