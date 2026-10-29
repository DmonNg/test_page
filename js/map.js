/* map.js — Loading bar, clock, day/night, Leaflet map, DigiWorld 3D overlay, route + journey drawing, KRP_G11 highlight */
const LD = { sched: 0, map: typeof L === "undefined" ? 1 : 0, routes: typeof L === "undefined" ? 1 : 0, rDone: 0, rTotal: 0, done: false };
function ldUpdate() {
  if (LD.done) return;
  const p = Math.round(Math.min(1, LD.sched) * 20 + LD.map * 20 + Math.min(1, LD.routes) * 60);
  $("ldBar").style.width = p + "%"; $("ldPct").textContent = p + "%";
  $("ldMsg").textContent = !LD.sched ? tx("loading_sched") : !LD.map ? tx("loading_map") : LD.routes < 1 ? tx("tracing", { a: LD.rDone, b: LD.rTotal }) : tx("ready");
  if (LD.sched && LD.map && LD.routes >= 1) ldFinish();
}
function ldFinish() {
  if (LD.done) return; LD.done = true;
  $("loader").classList.add("fade"); setTimeout(() => { const l = $("loader"); l && l.remove(); }, 500);
  if (typeof map !== "undefined" && map) map.invalidateSize();
}
setTimeout(() => $("ldSkip").classList.remove("hide"), 4000);
$("ldSkip").onclick = ldFinish;
setTimeout(ldFinish, 25000);   // never block the app longer than this
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.remove("hide"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add("hide"), Math.max(2800, msg.length * 70)); }
function dayInfo() {
  const v = $("daySel").value, today = new Date().getDay(), d = v === "" ? today : +v;
  return { d, isToday: d === today, weekend: d === 0 || d === 6, fri: d === 5, tue: d === 2 };
}
const nowMin = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };
function clockStr() {
  let c = ((window._mapKey === "digi" && tod && tod.icon) ? tod.icon + " " : "") + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const di = dayInfo(); if (!di.isToday) c += " · " + tx(["sun", "mon", "tue", "wed", "thu", "fri", "sat"][di.d]);
  return c;
}
function updClock() { $("clock").textContent = clockStr(); }
setInterval(updClock, 1000); updClock();

/* ---------- Day / night cycle (DigiWorld map) ---------- */
// keyframes: hour, brightness, sepia, saturate, hue-rotate(deg)
const KF = [[0,.5,.6,1.5,-190],[5,.5,.6,1.5,-190],[6.5,.85,.4,1.3,-15],[8,1.03,0,.9,-6],[17,1.03,0,.9,-6],[18.5,.9,.35,1.3,-20],[19.5,.62,.55,1.4,-120],[21,.5,.6,1.5,-190],[24,.5,.6,1.5,-190]];
var tod = { mode: "auto", icon: "" };
function lerpKF(h) {
  let i = 0; while (i < KF.length - 2 && h > KF[i + 1][0]) i++;
  const a = KF[i], b = KF[i + 1], t = Math.min(1, Math.max(0, (h - a[0]) / (b[0] - a[0])));
  return a.map((v, k) => v + (b[k] - v) * t);
}
function applyTod() {
  const m = $("map"); if (!m) return;
  const n = new Date();
  const h = tod.mode === "day" ? 12 : tod.mode === "dusk" ? 18.7 : tod.mode === "night" ? 22.5 : n.getHours() + n.getMinutes() / 60;
  const [, b, se, sa, hu] = lerpKF(h);
  m.style.setProperty("--tb", b.toFixed(3)); m.style.setProperty("--tse", se.toFixed(3));
  m.style.setProperty("--tsa", sa.toFixed(3)); m.style.setProperty("--thu", hu.toFixed(1) + "deg");
  const digi = window._mapKey === "digi";
  m.classList.toggle("night", digi && b < 0.7);
  tod.icon = h < 5.5 || h >= 19.8 ? "🌙" : h < 8 || h >= 17.5 ? "🌅" : "☀️";
  if (typeof updClock === "function") updClock();
}
setInterval(applyTod, 30000);

/* ---------- Map ---------- */
const DIGI_TILT = 35; // Adjust this angle (degrees) for DigiWorld's default tilt.
const hasMap = typeof L !== "undefined";
let map, layerRoutes, layerStops, layerJ, layerArrows;
let visibleStopIds = [];
const pokestopOverlay = { renderer: null, scene: null, camera: null, model: null, modelMinY: 0, modelScale: 1, instances: new Map(), queued: false };
if (hasMap) {
  map = L.map("map", { zoomControl: true }).setView([1.56, 103.64], 15);
  window.setMapStyle = k => {
    if (window._base) map.removeLayer(window._base);
    window._base = k === "sat"
      ? L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Tiles © Esri" })
      : L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" });
    window._base.addTo(map); window._base.bringToBack();
    if (!LD.map) { window._base.once("load", () => { LD.map = 1; ldUpdate(); }); setTimeout(() => { LD.map = 1; ldUpdate(); }, 12000); }
    $("map").classList.toggle("digi", k === "digi"); window._mapKey = k; applyTod();
    setMapTilt(k === "digi" ? DIGI_TILT : 0);
    $("sheet").classList.toggle("tall3d", k === "digi");
    updatePokestopStyle();
    updatePokestopStyle();
    try { localStorage.setItem("mapStyle", k); } catch (e) {}
  };
  layerRoutes = L.layerGroup().addTo(map); layerStops = L.layerGroup().addTo(map); layerJ = L.layerGroup().addTo(map); layerArrows = L.layerGroup().addTo(map);
}
/* Suggested wait spot (KRP_G11): pulsing ring + label on the map, and a bigger glowing 3D model in DigiWorld */
let tipStopId = null, layerTip = null, tipPrevTilt = null, tip3dHinted = false;

function setTipStop(id) {
  const old = tipStopId; tipStopId = id || null;
  if (!hasMap) return;
  if (!layerTip) layerTip = L.layerGroup().addTo(map);
  layerTip.clearLayers();
  if (tipStopId && places[tipStopId]) {
    const p = places[tipStopId];
    L.marker([p.lat, p.lng], { interactive: false, keyboard: false, zIndexOffset: 1000, icon: L.divIcon({ className: "", iconSize: [130, 90], iconAnchor: [65, 70],
      html: `<div class="tipmark"><i class="ring"></i><span class="lbl">${esc(tx("tip_wait_here"))}</span></div>` }) }).addTo(layerTip);
  }
  /* DigiWorld map: tilt into the 3D view with the 3D stop models while a tip is shown, restore afterwards */
  if (tipStopId && window._mapKey !== "digi" && !tip3dHinted) { tip3dHinted = true; toast(tx("tip_3d_hint")); }   // 3D only exists on the DigiWorld map style
  if (tipStopId && window._mapKey === "digi") {
    map.invalidateSize(); resizePokestopOverlay();                       // desktop: make sure map + 3D canvas use the real (wide) size
    if (tipPrevTilt === null) tipPrevTilt = parseInt($("tiltValue").textContent) || 0;
    setMapTilt(+$("mapTilt").value || DIGI_TILT);
  } else if (!tipStopId && tipPrevTilt !== null) { setMapTilt(tab === "3d" ? $("mapTilt").value : tipPrevTilt); tipPrevTilt = null; }
  updatePokestopStyle();
  const st = pokestopOverlay;
  if (st.scene) for (const k of [old, tipStopId]) { const r = k && st.instances.get(k); if (r) { st.scene.remove(r); st.instances.delete(k); } }
  schedulePokestopRender();
}
function schedulePokestopRender() {
  const state = pokestopOverlay;
  if (!state.renderer || !state.model || state.queued || !map) return;
  state.queued = true;
  requestAnimationFrame(() => { state.queued = false; renderPokestops(); });
}
/* Where a stop is on screen. During Leaflet's zoom animation the map is still at the OLD zoom (markers slide by CSS),
   so blend from the old position to the position at the target zoom with the same ease-out as Leaflet. */
function stopPoint(place) {
  const a = pokestopOverlay.anim, ll = [place.lat, place.lng], p0 = map.latLngToContainerPoint(ll);
  if (!a) return p0;
  const t = Math.min(1, (performance.now() - a.t0) / a.dur), e = 1 - Math.pow(1 - t, 3);
  const p1 = map.project(ll, a.zoom).subtract(a.centerPx).add(a.half);
  return L.point(p0.x + (p1.x - p0.x) * e, p0.y + (p1.y - p0.y) * e);
}
function renderPokestops() {
  const state = pokestopOverlay;
  {
    if (!state.renderer || !state.model) return;
    const size = map.getSize(), keep = new Set(visibleStopIds);
    /* the map tilts around a FIXED point of the container (the pan is applied before the tilt), so the canvas must tilt around the same fixed point */
    state.renderer.domElement.style.setProperty("--pokestop-tilt-origin", `${size.x / 2}px ${size.y * 0.65}px`);
    for (const [id, root] of state.instances) {
      if (!keep.has(id)) { state.scene.remove(root); state.instances.delete(id); }
    }
    for (const id of keep) {
      const place = places[id]; if (!place) continue;
      let root = state.instances.get(id);
      if (!root) {
        const hot = id === tipStopId;                       // suggested wait spot: bigger, glowing model
        root = state.model.clone(true);
        root.scale.setScalar(state.modelScale * (hot ? 1.5 : 1));
        if (hot) root.traverse(o => {
          if (!o.isMesh || !o.material) return;
          o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone();
          [].concat(o.material).forEach(m => { if (m.emissive) { m.emissive.set(0xffb300); m.emissiveIntensity = 0.55; } });
        });
        state.scene.add(root); state.instances.set(id, root);
      }
      const point = stopPoint(place);
      /* the canvas is tilted with the map and squashes everything vertically by cos(tilt); stretch by 1/cos so the cube stands upright */
      const tiltDeg = $("map").classList.contains("map-tilted") ? Math.min(60, +$("mapTilt").value || 0) : 0;
      const sc = state.modelScale * (id === tipStopId ? 1.5 : 1);
      root.scale.set(sc, sc / Math.cos(tiltDeg * Math.PI / 180), sc);
      root.position.set(point.x - size.x / 2, size.y / 2 - point.y - state.modelMinY * sc, 0);
      root.visible = window._mapKey === "digi" && point.x > -80 && point.x < size.x + 80 && point.y > -80 && point.y < size.y + 80;
    }
    state.renderer.render(state.scene, state.camera);
  }
}
function updatePokestopStyle() {
  const state = pokestopOverlay;
  const ready = window._mapKey === "digi" && !!state.model;
  $("map").classList.toggle("pokestop-models-ready", ready);
  schedulePokestopRender();
}
function resizePokestopOverlay() {
  const state = pokestopOverlay;
  if (!state.renderer || !map) return;
  const size = map.getSize();
  $("map").style.setProperty("--map-pane-tilt-origin", `${size.x / 2}px ${size.y * 0.65}px`);
  state.renderer.setSize(size.x, size.y, false);
  state.camera.left = -size.x / 2; state.camera.right = size.x / 2;
  state.camera.top = size.y / 2; state.camera.bottom = -size.y / 2;
  state.camera.updateProjectionMatrix(); schedulePokestopRender();
}
/* 3D cube that replaces the stop pin in DigiWorld.
   The overlay camera is orthographic and looks straight at the screen, so an un-rotated cube shows only ONE face
   (a flat square). The inner pivot is turned 45 deg around Y and tipped toward the viewer, so the top and two sides show.
   Its lowest corner sits on y = 0 (the stop's position on the map). */
function makeStopCube() {
  const root = new THREE.Group(), pivot = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x1558d6, roughness: 0.35, metalness: 0.1, emissive: 0x0b2f7a, emissiveIntensity: 0.35 }));
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: 0xffffff }));
  pivot.add(mesh, edges);
  pivot.rotation.set(0.5, Math.PI / 4, 0);          // pitch 0.5 rad, yaw 45 deg
  pivot.position.y = 0.8;                           // half the rotated height, so the lowest corner touches the ground
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.6, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 }));
  shadow.scale.set(1.2, 0.45, 1); shadow.position.z = -1;
  root.add(shadow, pivot);
  return root;
}
function initPokestopOverlay() {
  if (!hasMap || typeof THREE === "undefined") return;
  const state = pokestopOverlay, container = $("map"), size = map.getSize();
  const canvas = document.createElement("canvas"); canvas.className = "pokestop-overlay"; container.appendChild(canvas);
  try {
    state.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    state.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); state.renderer.setClearColor(0x000000, 0);
    state.scene = new THREE.Scene();
    state.scene.add(new THREE.HemisphereLight(0xffffff, 0x7b8795, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8); sun.position.set(-80, 120, 180); state.scene.add(sun);
    state.camera = new THREE.OrthographicCamera(-size.x / 2, size.x / 2, size.y / 2, -size.y / 2, 0.1, 2000);
    state.camera.position.set(0, 0, 1000); state.camera.lookAt(0, 0, 0);
    resizePokestopOverlay();
  } catch (e) { canvas.remove(); state.renderer = null; return; }
  map.on("move zoom viewreset resize", renderPokestops);          // draw in the same frame as the map moves, no 1-frame lag
  map.on("zoomanim", e => {                                          // animated zoom: follow the markers while they slide
    state.anim = { t0: performance.now(), dur: 250, zoom: e.zoom, centerPx: map.project(e.center, e.zoom), half: map.getSize().divideBy(2) };
    (function tick() { if (!state.anim) return; renderPokestops(); if (performance.now() - state.anim.t0 < state.anim.dur + 80) requestAnimationFrame(tick); })();
  });
  map.on("zoomend", () => { state.anim = null; renderPokestops(); });
  state.model = makeStopCube(); state.modelMinY = 0; state.modelScale = 26;   // cube is 1 unit; 26 px wide on screen
  updatePokestopStyle();
}
async function roadRoute(legs) {
  const line = [];
  for (const ids of legs) {
    const pts = ids.map(i => places[i]).filter(Boolean); if (!pts.length) continue;
    const coords = pts.map(p => `${p.lng},${p.lat}`).join(";");
    let ok = false;
    try {
      const ac = new AbortController(), to = setTimeout(() => ac.abort(), 8000);
      const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`, { signal: ac.signal });
      clearTimeout(to);
      const j = await r.json();
      if (j.code === "Ok" && j.routes?.length) { for (const c of j.routes[0].geometry.coordinates) line.push([c[1], c[0]]); ok = true; }
    } catch (e) {}
    if (!ok) for (const p of pts) line.push([p.lat, p.lng]);
  }
  return line;
}
const rrCache = {};
const cachedRoute = legs => { const k = JSON.stringify(legs); return (rrCache[k] ??= roadRoute(legs)); };
const busLegs = b => b.pathLegs.length ? b.pathLegs : [b.path];
const rlines = {};          // code -> {glow, line}
const colorOf = {};
function drawRoutes() {
  if (!hasMap) return;
  layerRoutes.clearLayers();
  buses.forEach((b, i) => {
    const color = `hsl(${Math.round((i * 137.5) % 360)},80%,45%)`; colorOf[b.code] = color;
    const pts = b.path.map(id => places[id]).filter(Boolean).map(p => [p.lat, p.lng]);
    const glow = L.polyline(pts, { color, weight: 8, opacity: 0.12 }).addTo(layerRoutes);
    const line = L.polyline(pts, { color, weight: 3, opacity: 0.8 }).addTo(layerRoutes);
    line.on("click", () => { setTab("routes"); selectRoute(b.code, false); });
    rlines[b.code] = { glow, line };
  });
  // upgrade straight lines to real road geometry, one route at a time (drives the loading bar)
  LD.rTotal = buses.length; LD.rDone = 0; if (!buses.length) { LD.routes = 1; ldUpdate(); }
  (async () => {
    for (const b of buses) {
      try { const ln = await cachedRoute(busLegs(b)); if (ln.length > 1 && rlines[b.code]) { rlines[b.code].line.setLatLngs(ln); rlines[b.code].glow.setLatLngs(ln); if (selCode === b.code && !journeyActive) { layerArrows.clearLayers(); drawArrows(ln, colorOf[b.code]); } } } catch (e) {}
      LD.rDone++; LD.routes = LD.rDone / LD.rTotal; ldUpdate();
    }
    LD.routes = 1; ldUpdate();
  })();
}
let journeyActive = false, selCode = null;
function drawArrows(line, color) {
  if (!hasMap) return;
  const pts = line.map(p => Array.isArray(p) ? p : [p.lat, p.lng]);
  let acc = 0, next = 60;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], d = dist(a, b);
    while (acc + d >= next) {
      const t = (next - acc) / (d || 1);
      let lat = a[0] + (b[0] - a[0]) * t, lng = a[1] + (b[1] - a[1]) * t;
      const brg = Math.atan2((b[1] - a[1]) * Math.cos(rad(a[0])), b[0] - a[0]) * 180 / Math.PI;
      const r90 = rad(brg + 90);                      // shift to the right-hand side so opposite directions don't overlap
      lat += Math.cos(r90) * 6 / 110540; lng += Math.sin(r90) * 6 / (111320 * Math.cos(rad(lat)));
      L.marker([lat, lng], { interactive: false, keyboard: false, icon: L.divIcon({ className: "", iconSize: [16, 16], iconAnchor: [8, 8],
        html: `<svg viewBox="0 0 20 20" width="16" height="16" style="transform:rotate(${brg}deg);display:block"><path d="M10 1 L17 18 L10 14 L3 18 Z" fill="#fff" stroke="${color}" stroke-width="2" stroke-linejoin="round"/></svg>` }) }).addTo(layerArrows);
      next += 180;
    }
    acc += d;
  }
}
function dimAll() { for (const c in rlines) { rlines[c].line.setStyle({ opacity: 0, weight: 2 }); rlines[c].glow.setStyle({ opacity: 0 }); } }
function selectRoute(code, fit = true) {
  if (hasMap) { layerJ.clearLayers(); layerArrows.clearLayers(); } journeyActive = false; selCode = code; { const sb = code && buses.find(x => x.code === code); drawStops(sb ? sb.path : undefined); } if (code) track("view_route", { route: code });
  for (const c in rlines) {
    const on = !code || c === code;
    rlines[c].line.setStyle({ opacity: on ? 0.95 : 0.04, weight: code && on ? 5 : (on ? 3 : 2) });
    rlines[c].glow.setStyle({ opacity: on ? (code ? 0.3 : 0.12) : 0 });
    if (code && c === code) { rlines[c].line.bringToFront(); drawArrows(rlines[c].line.getLatLngs(), colorOf[c] || '#00e5ff'); if (fit) map.fitBounds(rlines[c].line.getBounds(), { padding: [50, 50] }); }
  }
  if (code) { cur.route = code; renderRoutes(); }
  setTipStop(code && routeTipInfo(buses.find(x => x.code === code)) ? KRP_ID : null);
}
function drawStops(only) {
  if (!hasMap) return; layerStops.clearLayers();
  visibleStopIds = [...new Set(only || buses.flatMap(b => b.path))].filter(id => places[id]);
  visibleStopIds.forEach(id => {
    const p = places[id]; if (!p) return;
    L.marker([p.lat, p.lng], { icon: L.divIcon({ className: "", iconSize: [52, 52], iconAnchor: [26, 48], html: '<div class="stop-hitbox"><div class="pin">🚏</div></div>' }) }).addTo(layerStops).on("click", () => picking ? pickAt(stopLL(id)) : openStop(id));
  });
  schedulePokestopRender();
}
addEventListener("resize", () => { if (hasMap) { map.invalidateSize(); resizePokestopOverlay(); } });
function fitAll() {
  const used = [...new Set(buses.flatMap(b => b.path))].filter(i => places[i]);
  if (hasMap && used.length) map.fitBounds(L.latLngBounds(used.map(i => [places[i].lat, places[i].lng])), { padding: [40, 40] });
}
function mapPadFit(latlngs) { map.fitBounds(L.latLngBounds(latlngs), isDesktop() ? { paddingTopLeft: [40, 100], paddingBottomRight: [40, 40] } : { paddingTopLeft: [30, 90], paddingBottomRight: [30, 240] }); }
async function drawJourney(bs, walks) {
  if (!hasMap) return; layerJ.clearLayers(); layerArrows.clearLayers();
  dimAll(); drawStops(bs.flatMap(b => b.path)); journeyActive = true; selCode = null;
  const all = [];
  for (const b of bs) {
    const ln = await cachedRoute(busLegs(b)); all.push(...ln);
    L.polyline(ln, { color: "#f9c552", weight: 10, opacity: 0.5 }).addTo(layerJ);
    L.polyline(ln, { color: colorOf[b.code] || "#00e5ff", weight: 5, opacity: 1 }).addTo(layerJ);
    drawArrows(ln, colorOf[b.code] || "#00e5ff");
  }
  for (const w of walks || []) { L.polyline(w, { color: "#0d2b5e", weight: 4, dashArray: "2 8", opacity: 0.95 }).addTo(layerJ); all.push(...w); }
  if (all.length) mapPadFit(all);
}
